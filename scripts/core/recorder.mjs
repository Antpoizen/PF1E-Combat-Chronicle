import {MOD,authority,setting,combatStarted,currentEncounter,participantsOf,selectTarget,now,uid,log,warn} from './utils.mjs';
import {makeEvent,leaders,isAwardEligible} from '../analytics/model.mjs';
import {readHealth,changesBetween,playerWoundState} from '../adapters/health.mjs';
import {saveOutcomeFromRoll,criticalOutcomeFromRoll,itemFromMessage} from '../adapters/rolls.mjs';
import {installSoakHooks} from '../adapters/soak.mjs';
import {playerProjection} from '../services/privacy.mjs';
import {createRecord,findByCombat,loadRecord,appendEvents,saveMetadata,listIndexes} from './store.mjs';
export class ChronicleRecorder {
 constructor(){this.records=new Map();this.snapshots=new Map();this.conditions=new Map();this.queue=Promise.resolve();this.latest=null;this.recentMessages=[];this.pendingOrigins=new Map();this.pendingSoak=new Map();this.recentTargetMessages=new Map();this.recentHealthSources=new Map();this.sentSoakKeys=new Set();this.onRefresh=()=>{};this.lastPublished=null;this.lastCombatUI=null;}
 enqueue(fn){const promise=this.queue.then(fn);this.queue=promise.catch(error=>{console.error('Combat Chronicle | operation failed',error)});return promise;}
 combatForActor(actor){if(!actor)return null;const matches=Array.from(game.combats||[]).filter(c=>combatStarted(c)&&selectTarget(c,actor));return matches.length===1?matches[0]:null;}
 snapshotKey(combat,actor){return `${combat.id}:${actor.uuid}`;}
 seed(combat){for(const c of combat.combatants||[]){const a=c.actor;if(!a)continue;const key=this.snapshotKey(combat,a);if(!this.snapshots.has(key))this.snapshots.set(key,readHealth(a));this.conditions.set(key,new Set(a.statuses||[]));}}
 async ensure(combat){if(!authority()||!combatStarted(combat)||!setting('enabled',true))return null;
 let record=this.records.get(combat.id);if(record)return record;
 record=await findByCombat(combat.id)||await createRecord(combat,participantsOf(combat));
 this.records.set(combat.id,record);this.seed(combat);this.broadcast(record);return record;
 }
 requestProjection(){
  if(game.user?.isGM||!setting('allowPlayers',true))return;
  game.socket?.emit?.(`module.${MOD}`,{kind:'request'});
 }
 broadcast(record){if(!authority()||!record)return;
 const projection=playerProjection(record,{includeTemporary:setting('includeTemporary',false),groupSummons:setting('groupSummons',true)});
 this.latest=projection;if(setting('allowPlayers',true))game.socket.emit(`module.${MOD}`,{kind:'state',projection});this.onRefresh();
 }
 async add(combat,events=[]){if(!authority()||!combatStarted(combat)||!setting('enabled',true))return;
 const record=await this.ensure(combat);if(!record)return;
 const p=participantsOf(combat);for(const [id,v] of Object.entries(p))record.participants[id]??=v;
 const entries=events.map(e=>makeEvent({round:combat.round,turn:combat.turn,...e}));
 record.round=combat.round;record.turn=combat.turn;
 const count=await appendEvents(record,entries);if(count){await saveMetadata(record);this.broadcast(record)}
 }
 async closeCombat(combat){if(!authority())return;
 let record=this.records.get(combat.id)||await findByCombat(combat.id);if(!record)return;
 record.status='completed';record.end=now();record.round=combat.round;await saveMetadata(record);this.records.delete(combat.id);this.broadcast(record);
 }
 async resume(){if(!authority())return;for(const combat of game.combats||[])if(combatStarted(combat))await this.ensure(combat);}
 resolveEvidence(options,actor,combat){
  // Only explicit per-update provenance can automatically establish a source.
  const cc=options?.combatChronicle||options?.chronicle||{};
  const msg=typeof options?.message==='string'?game.messages?.get(options.message):options?.message;
  const verifiedItem=cc.itemName||itemFromMessage(msg,combat)||null;
  const sourceId=cc.sourceId||null;
  const source=sourceId?combat.combatants.get(sourceId):null;
  if(source)return {sourceId:source.id,sourceName:source.name,confidence:'confirmed',itemName:verifiedItem,messageId:cc.messageId||msg?.id||null};
  const speaker=msg?.speaker;
  if(speaker?.actor){const matches=Array.from(combat.combatants).filter(c=>c.actorId===speaker.actor&&(!speaker.token||speaker.token===c.tokenId));
   if(matches.length===1)return {sourceId:matches[0].id,sourceName:matches[0].name,confidence:'confirmed',itemName:verifiedItem,messageId:msg.id||null};}
  const uuid=cc.sourceActorUuid||cc.originActorUuid||null;
  if(uuid){const matches=Array.from(combat.combatants).filter(c=>c.actor?.uuid===uuid);
   if(matches.length===1)return {sourceId:matches[0].id,sourceName:matches[0].name,confidence:'confirmed',itemName:verifiedItem,messageId:cc.messageId||msg?.id||null};}
  const contextual=this.pendingOrigins.get(actor.uuid);
  if(contextual && Date.now()-contextual.at<2000)return {...contextual,confidence:'strongly-correlated'};
  return {sourceId:null,sourceName:'Unattributed',confidence:'unattributed',itemName:null,messageId:null};
 }

 /** Attribute Soak using verified action context first, then same-target
  * health damage or explicitly targeted attack messages. It never uses turn
  * order. Do not call this for unrelated resource updates. */
 resolveSoakEvidence(actor,combat,options={}){
  const direct=this.resolveEvidence(options,actor,combat);
  if(direct.sourceId)return direct;
  const linked=this.recentHealthSources.get(actor.uuid);
  if(linked&&linked.combatId===combat.id&&Date.now()-linked.at<=400&&!linked.used){
   linked.used=true;
   return {...linked.source,confidence:'strongly-correlated'};
  }
  const messages=(this.recentTargetMessages.get(actor.uuid)||[]).filter(m=>
    m.combatId===combat.id&&Date.now()-m.at<=3500);
  if(messages.length&&new Set(messages.map(m=>m.sourceId)).size===1){
   const last=messages.at(-1);
   return {sourceId:last.sourceId,sourceName:last.sourceName,itemName:last.itemName,
    messageId:last.messageId,confidence:'strongly-correlated'};
  }
  return direct;
 }

 handleHealth(actor,changes,options={}){
  const combat=this.combatForActor(actor);if(!combat)return;
  const key=this.snapshotKey(combat,actor),before=this.snapshots.get(key),after=readHealth(actor);
  this.snapshots.set(key,after);if(!before){log('Missing resource baseline',key);return}
  if(Number.isFinite(before.soak)&&Number.isFinite(after.soak)&&before.soak!==after.soak){
   const signature=`soakdelta:${combat.id}:${actor.uuid}:${before.soak}:${after.soak}:${combat.round}:${combat.turn}`;
   if(!this.pendingSoak.has(signature)){
    // A nonce distinguishes two identical 10→5 hits after an intervening refill.
    // The native hook shares this event key with the flag-based fallback.
    const eventKey=`${signature}:${uid()}`;
    const delta=after.soak-before.soak;
    const timeout=setTimeout(()=>{
      if(this.pendingSoak.get(signature)?.eventKey!==eventKey)return;
      this.pendingSoak.delete(signature);
      const target=selectTarget(combat,actor);if(!target)return;
      const source=this.resolveSoakEvidence(actor,combat,options);
      this.enqueue(()=>this.add(combat,[{
       type:delta<0?'soak':'refill',resource:'soak',amount:Math.abs(delta),delta,
       targetId:target.id,targetName:target.name,...source,
       confidence:delta<0?(source.sourceId?source.confidence:'ambiguous'):'confirmed',
       eventKey,evidence:{integration:'soak-flag-fallback',old:before.soak,new:after.soak,
        amountVerifiedBy:'actor-flag-change',reasonVerified:false,
        note:'The Armor Soak Pool native hook was not visible to this GM. Negative flag deltas may also reflect manual adjustments.'}
      }]));
    },600);
    this.pendingSoak.set(signature,{timeout,eventKey});
   }
  }
  const effects=changesBetween(before,after);
  const pc=actor?.type==='character'&&actor?.hasPlayerOwner===true;
  const prior=playerWoundState(before,pc),next=playerWoundState(after,pc);
  if(!prior.down&&next.down)effects.push({type:'downed',resource:'wounds',amount:1});
  if(!prior.dead&&next.dead)effects.push({type:'death',resource:'wounds',amount:1,evidence:{wounds:after.wounds,constitution:after.constitution}});
  if(prior.down&&!next.down)effects.push({type:'revived',resource:'wounds',amount:1});

  const previousConditions=this.conditions.get(key)||new Set();const currentConditions=new Set(actor.statuses||[]);
  this.conditions.set(key,currentConditions);
  for(const c of currentConditions)if(!previousConditions.has(c))effects.push({type:'condition',resource:String(c),amount:1,applied:true});
  for(const c of previousConditions)if(!currentConditions.has(c))effects.push({type:'condition',resource:String(c),amount:0,applied:false});
  if(!effects.length)return;
  const target=selectTarget(combat,actor),source=this.resolveEvidence(options,actor,combat);
  if(!target)return;
  // Cache only a real resource-loss source; never infer the attacker from the
  // combat turn. The matching Soak event may reach the GM a moment later.
  if(source.sourceId&&effects.some(e=>e.type==='damage'&&e.amount>0)){
   this.recentHealthSources.set(actor.uuid,{at:Date.now(),combatId:combat.id,
     source:{sourceId:source.sourceId,sourceName:source.sourceName,
      itemName:source.itemName||null,messageId:source.messageId||null},used:false});
  }
  const batchId=uid();const entries=effects.map((change,i)=>({id:uid(),...change,...source,targetId:target.id,targetName:target.name,
   actionId:options?.combatChronicle?.actionId||batchId,
   eventKey:options?.combatChronicle?.actionId?`health:${options.combatChronicle.actionId}:${target.id}:${change.resource}:${i}`:null,
   evidence:{path:'actor-document',before:change.before,after:change.after,origin:'PF1e/Nevela actor update'}}));
  // A kill is an enemy HP crossing from above 0 to 0 or below. No active-turn guesses.
  const hpDamage=entries.find(e=>e.type==='damage' && e.resource==='hp');
  const enemy=participantsOf(combat)[target.id];
  if(hpDamage && Number.isFinite(before.hp) && Number.isFinite(after.hp) && before.hp>0 && after.hp<=0 && enemy && !enemy.ally){
   entries.push({id:uid(),type:'kill',resource:'hp',amount:1,
    sourceId:source.sourceId,sourceName:source.sourceName,confidence:source.confidence,
    targetId:target.id,targetName:target.name,damageEventId:hpDamage.id,
    eventKey:'kill:'+combat.id+':'+target.id+':'+batchId,
    evidence:{origin:'enemy-hp-crossed-zero',hpBefore:before.hp,hpAfter:after.hp,damageEventId:hpDamage.id}});
  }
  // Changes are direct observations of actual resource deltas; source is left unattributed if no explicit provenance.
  this.enqueue(()=>this.add(combat,entries));
 }
 trackApplyContext(actor,options){
  if(!actor||!options?.message)return;
  const combat=this.combatForActor(actor);if(!combat)return;
  const msg=typeof options.message==='string'?game.messages?.get(options.message):options.message;
  const speaker=msg?.speaker;if(!speaker?.actor)return;
  const matches=Array.from(combat.combatants).filter(c=>c.actorId===speaker.actor&&(!speaker.token||c.tokenId===speaker.token));
  if(matches.length!==1)return;
  this.pendingOrigins.set(actor.uuid,{at:Date.now(),sourceId:matches[0].id,sourceName:matches[0].name,
    itemName:itemFromMessage(msg,combat),messageId:msg.id||null});
  if(!authority()&&!game.user?.isGM&&msg.id)game.socket?.emit?.(`module.${MOD}`,{
    kind:'source-context',combatId:combat.id,actorUuid:actor.uuid,messageId:msg.id,
    userId:game.user.id
  });
 }
 
 /** Report Armor Soak events from the client that actually applied the damage.
  * The server-local GM sees actor flags but may never receive custom hooks.
  * Never transmit full actor documents or private actor stats. */
 observeSoak(actor,event){
  if(!setting('enabled',true))return;
  if(authority()){this.handleSoak(actor,event);return;}
  if(game.user?.isGM)return;
  const combat=this.combatForActor(actor),target=selectTarget(combat,actor);
  if(!combat||!target||!['soak','refill','adjustment','capacity'].includes(event?.type))return;
  const old=event?.evidence?.old,newValue=event?.evidence?.new;
  if(!Number.isFinite(old)||!Number.isFinite(newValue))return;
  game.socket?.emit?.(`module.${MOD}`,{
   kind:'soak-observed',userId:game.user.id,combatId:combat.id,
   actorUuid:actor.uuid,tokenId:target.tokenId||null,
   event:{type:event.type,resource:'soak',amount:event.amount,delta:event.delta,
    evidence:{integration:event.evidence?.integration,old,new:newValue,
     reason:String(event.evidence?.reason||'').slice(0,60),
     overflow:event.evidence?.overflow||0}}
  });
 }
 /** Verify the referenced PF1e chat message exists and its speaker belongs to
  * the same combat before treating a remote damage context as attribution. */
 receiveDamageContext(message){
  if(!authority()||!message?.actorUuid||!message?.messageId)return;
  const combat=Array.from(game.combats||[]).find(c=>c.id===message.combatId&&combatStarted(c));
  const target=Array.from(combat?.combatants||[]).find(c=>c.actor?.uuid===message.actorUuid);
  if(!target)return;
  const chat=game.messages?.get(message.messageId);
  const speaker=chat?.speaker;
  if(!speaker?.actor)return;
  const candidates=Array.from(combat.combatants).filter(c=>c.actorId===speaker.actor
   &&(!speaker.token||speaker.token===c.tokenId));
  if(candidates.length!==1)return;
  // The sender is not trusted as source; only GM-visible chat speaker is.
  this.pendingOrigins.set(message.actorUuid,{at:Date.now(),sourceId:candidates[0].id,
    sourceName:candidates[0].name,itemName:itemFromMessage(chat,combat),
    messageId:chat.id||null});
 }
 /** Validate source-client native Soak report against a real combat target and
  * Soak flag transition. GM remains sole writer of encounter records. */
 receiveSoakObservation(message){
  if(!authority()||!message||!['soak','refill','adjustment','capacity'].includes(message.event?.type))return;
  const combat=Array.from(game.combats||[]).find(c=>c.id===message.combatId&&combatStarted(c));
  if(!combat)return;
  const target=Array.from(combat.combatants||[]).find(c=>c.actor?.uuid===message.actorUuid
   &&(!message.tokenId||c.tokenId===message.tokenId));
  if(!target)return;
  const raw=message.event,evidence=raw.evidence||{};
  const old=Number(evidence.old),current=Number(evidence.new),amount=Number(raw.amount);
  if(!Number.isFinite(old)||!Number.isFinite(current)||!Number.isFinite(amount)||amount<=0||amount>1000000)return;
  if(raw.type==='soak'&&(old-current!==amount||current>=old))return;
  // A client must not be able to fabricate Soak damage by sending impossible
  // value changes; verify it against the GM's current Soak flag/snapshot.
  const flag=Number(target.actor?.flags?.['armor-soak-pool']?.current);
  const snapshot=this.snapshots.get(this.snapshotKey(combat,target.actor));
  if(Number.isFinite(flag)&&flag!==current&&Number(snapshot?.soak)!==current)return;
  this.handleSoak(target.actor,{
   type:raw.type,resource:'soak',amount,delta:raw.delta,
   confidence:raw.type==='soak'?'unattributed':'confirmed',
   evidence:{integration:'armor-soak-pool-relayed',old,new:current,
    reason:String(evidence.reason||'').slice(0,60),overflow:Number(evidence.overflow)||0}
  });
 }

 handleSoak(actor,event){const combat=this.combatForActor(actor);if(!combat||!authority())return;
  const target=selectTarget(combat,actor),source=this.resolveSoakEvidence(actor,combat);if(!target)return;
  const old=event.evidence?.old,latest=event.evidence?.new;
  const signature=(Number.isFinite(old)&&Number.isFinite(latest))?`soakdelta:${combat.id}:${actor.uuid}:${old}:${latest}:${combat.round}:${combat.turn}`:null;
  const pending=signature?this.pendingSoak.get(signature):null;
  if(pending){clearTimeout(pending.timeout);this.pendingSoak.delete(signature)}
  // Prefer the native Armor Soak Pool DAMAGE_APPLIED hook's exact absorbed value.
  // Never infer health damage from its overflow field.
  const eventKey=pending?.eventKey||`soak-hook:${combat.id}:${actor.uuid}:${uid()}`;
  const commit=resolved=>this.enqueue(()=>this.add(combat,[{
   ...event,targetId:target.id,targetName:target.name,...resolved,
   eventKey,evidence:{...event.evidence,amountVerifiedBy:'armor-soak-pool-hook',
    attribution:resolved.sourceId?'correlated-action':'pending-review'}
  }]));
  if(event.type==='soak'&&!source.sourceId){
   // The hook often precedes the later HP actor update. Give it a short window
   // to receive source evidence from the same target, without guessing.
   setTimeout(()=>commit(this.resolveSoakEvidence(actor,combat)),250);
  }else commit(source);
 }
 async updateCombat(combat,changed){if(!authority())return;
  if(combatStarted(combat)){
   await this.ensure(combat);this.seed(combat);
   if(Object.hasOwn(changed,'round')||Object.hasOwn(changed,'turn'))await this.add(combat,[{type:'turn',confidence:'confirmed',sourceName:'System',eventKey:`turn:${combat.id}:${combat.round}:${combat.turn}`}]);
  }else if(this.records.has(combat.id))await this.closeCombat(combat);
 }

 /**
  * Recognize source only when an attack/damage roll explicitly includes
  * structured target IDs matching combatants. Do not use player target cursors,
  * current turn, or temporal proximity alone.
  */
 rememberTargetedAttack(combat,message,source){
  const flag=message?.flags||{};
  const groups=[flag.pf1?.targets,flag['nevelas-automation-suite']?.targets,
    message?.actionSource?.targets,flag.pf1?.context?.targets].filter(Array.isArray);
  const ids=new Set();
  for(const group of groups)for(const entry of group){
   if(typeof entry==='string'){ids.add(entry);continue;}
   if(!entry||typeof entry!=='object')continue;
   for(const key of ['id','tokenId','tokenUuid','uuid','actorId','actorUuid'])
    if(typeof entry[key]==='string')ids.add(entry[key]);
  }
  if(!ids.size)return;
  const itemName=itemFromMessage(message,combat);
  const ts=Date.now();
  for(const participant of combat.combatants||[]){
   const actor=participant.actor;if(!actor||participant.id===source.id)continue;
   const refs=[participant.id,participant.tokenId,participant.token?.id,participant.token?.uuid,
     participant.actorId,actor.id,actor.uuid].filter(Boolean);
   if(!refs.some(id=>ids.has(id)))continue;
   const recent=(this.recentTargetMessages.get(actor.uuid)||[]).filter(x=>ts-x.at<=3500);
   recent.push({at:ts,combatId:combat.id,sourceId:source.id,sourceName:source.name,
     itemName,messageId:message.id||null});
   this.recentTargetMessages.set(actor.uuid,recent.slice(-8));
  }
 }

 observeChat(message){if(!authority())return;
  const matches=Array.from(game.combats||[]).filter(c=>combatStarted(c)&&Array.from(c.combatants).some(p=>p.actorId===message.speaker?.actor));
  if(matches.length!==1)return;const combat=matches[0];const speaker=Array.from(combat.combatants).filter(c=>c.actorId===message.speaker.actor&&(!message.speaker.token||c.tokenId===message.speaker.token));
  if(speaker.length!==1)return;
  const src=speaker[0];
  this.rememberTargetedAttack(combat,message,src);
  if(!message.rolls?.length)return;
  const natural=[];for(const roll of message.rolls){for(const term of roll.terms||[])if(Array.isArray(term.results)&&Number(term.faces)===20)for(const r of term.results)if(Number.isFinite(r.result))natural.push(r.result)}
  const hidden=!!(message.blind||message.whisper?.length);
  const critical=criticalOutcomeFromRoll(message);
  const attackEvidence=/attack|critical|crit threat/i.test(String(message.flavor||'')+' '+String(message.flags?.pf1?.context?.type||''));
  if(critical&&attackEvidence)this.enqueue(()=>this.add(combat,[{
    type:'criticalRoll',resource:'attack',amount:1,critical:true,natural:critical.natural,reason:critical.reason,
    sourceId:src.id,sourceName:src.name,confidence:'confirmed',messageId:message.id,
    eventKey:`criticalRoll:${combat.id}:${message.id}:${src.id}`,visibility:'gm'
  }]));
  this.enqueue(()=>this.add(combat,[{type:'roll',sourceId:src.id,sourceName:src.name,messageId:message.id,
    natural:natural.length===1?natural[0]:null,evidence:{rollTotals:message.rolls.map(r=>r.total),naturalD20:natural},visibility:hidden?'private':'gm',confidence:'confirmed',eventKey:`roll:${message.id}`} ]));
 }
 recordSave(actor,message,saveType){
  if(!authority())return;
  const combat=this.combatForActor(actor),target=selectTarget(combat,actor);
  if(!combat||!target)return;
  const outcome=saveOutcomeFromRoll(message,saveType);
  if(!outcome?.failed)return;
  const src=this.resolveEvidence(message?.options||{},actor,combat);
  this.enqueue(()=>this.add(combat,[{type:'failedSave',resource:saveType,amount:1,failed:true,
   sourceId:src.sourceId,targetId:target.id,targetName:target.name,confidence:src.confidence,
   dc:outcome.dc,rollTotal:outcome.total,visibility:'gm',
   eventKey:message?.id?`failedSave:${combat.id}:${message.id}:${target.id}`:null}]));
 }
 recordCriticalRoll(actor,message){
  if(!authority())return;
  const critical=criticalOutcomeFromRoll(message);if(!critical)return;
  const combat=this.combatForActor(actor),source=selectTarget(combat,actor);
  if(!combat||!source)return;
  this.enqueue(()=>this.add(combat,[{type:'criticalRoll',resource:'attack',amount:1,critical:true,natural:critical.natural,reason:critical.reason,
   sourceId:source.id,sourceName:source.name,confidence:'confirmed',visibility:'gm',
   eventKey:message?.id?`criticalRoll:${combat.id}:${message.id}:${source.id}`:null}]));
 }
 async modify(recordId,mutation){if(!authority())throw Error('Only authoritative GM can edit records');
  const record=await loadRecord(recordId);if(!record)throw Error('Record unavailable');
  const event=mutation.event?makeEvent(mutation.event):null;
  if(event)await appendEvents(record,[event]);
  if(mutation.participant){const {id,...patch}=mutation.participant;if(record.participants[id])Object.assign(record.participants[id],patch)}
  if(mutation.award){
   const a=mutation.award;
   if(!isAwardEligible(record.participants[a.combatantId]))throw Error('Only player characters can receive awards');
   const candidate=leaders(record).find(x=>x.title===a.title && x.winner.id===a.combatantId);
   if(!candidate)throw Error('This character does not qualify for the suggested award');
   if(!record.awards.some(v=>v.title===a.title && v.combatantId===a.combatantId))
    record.awards.push({...a,description:candidate.description,criteria:candidate.criteria,evidence:candidate.evidence,approved:true});
  }
  if(mutation.report)record.report={...record.report,...mutation.report};
  if(mutation.status)record.status=mutation.status;
  await saveMetadata(record);if(this.records.has(record.combatId))this.records.set(record.combatId,record);this.broadcast(record);return record;
 }
 async load(id){return loadRecord(id)}
 async indices(){return listIndexes()}
 install(){
  Hooks.on('createCombat',combat=>{if(combatStarted(combat))this.enqueue(()=>this.ensure(combat))});
  Hooks.on('updateCombat',(combat,changed)=>{this.onCombatStartedUI(combat);if(authority())this.enqueue(()=>this.updateCombat(combat,changed))});
  Hooks.on('deleteCombat',combat=>{if(authority())this.enqueue(()=>this.closeCombat(combat))});
  Hooks.on('createCombatant',doc=>{if(authority()&&combatStarted(doc.parent))this.enqueue(async()=>{const r=await this.ensure(doc.parent);r.participants[doc.id]=participantsOf(doc.parent)[doc.id];this.seed(doc.parent);await saveMetadata(r);this.broadcast(r)})});
  Hooks.on('preUpdateActor',(actor,changed,options)=>{if(!authority())return;const c=this.combatForActor(actor);if(c){options.combatChroniclePreHealth=readHealth(actor)}});
  Hooks.on('updateActor',(actor,changed,options)=>{if(authority())this.handleHealth(actor,changed,options)});
  Hooks.on('pf1ApplyDamage',(actor,options)=>this.trackApplyContext(actor,options));
  installSoakHooks((actor,event)=>this.observeSoak(actor,event));
  Hooks.on('createChatMessage',m=>this.observeChat(m));
  Hooks.on('pf1ActorRollSave',(actor,message,save)=>this.recordSave(actor,message,save));
  Hooks.on('pf1ActorRollAttack',(actor,message)=>this.recordCriticalRoll(actor,message));
  game.socket.on(`module.${MOD}`,(message,senderId)=>{
   if(!message||typeof message!=='object')return;
   // Where Foundry exposes the authenticated relay sender, reject mismatched
   // claims and ignore projection/revocation from a non-GM sender.
   if(senderId&&message.userId&&senderId!==message.userId)return;
   const sender=senderId?game.users?.get?.(senderId):null;
   if(sender&&['state','revoke'].includes(message.kind)&&!sender.isGM)return;
   if(sender&&['soak-observed','source-context'].includes(message.kind)&&sender.isGM)return;
   if(message.kind==='source-context'&&authority())this.receiveDamageContext(message);
   if(message.kind==='soak-observed'&&authority())this.receiveSoakObservation(message);
   if(message.kind==='state'&&!game.user.isGM&&setting('allowPlayers',true)){this.latest=message.projection;this.onRefresh();}
   if(message.kind==='revoke'&&!game.user.isGM){this.latest=null;this.onRefresh();}
   if(message.kind==='request'&&authority()){
    const active=currentEncounter();const record=active&&this.records.get(active.id);
    if(record)this.broadcast(record);
   else if(active)this.enqueue(async()=>{const r=await this.ensure(active);if(r)this.broadcast(r)});
   }
  });
 }
 onCombatStartedUI(combat){if(!combatStarted(combat)||!setting('autoOpen',true)||(!game.user.isGM&&!setting('allowPlayers',true)))return;
  const already=setting('lastCombatOpened','');if(already===combat.id)return;
  game.settings.set(MOD,'lastCombatOpened',combat.id).catch(()=>{});
  globalThis.game?.combatChronicle?.openMeter?.();
 }
}
