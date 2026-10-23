import {number,clone,uid,now} from '../core/utils.mjs';
import {resourceDamage} from '../adapters/health.mjs';
export const EVENT_TYPES=['damage','healing','soak','refill','roll','condition','turn','correction','downed','death','revived','failedSave','criticalRoll','kill','critical','encounter'];
// Only player characters can receive awards. Historical records use ownership fallback.
export function isAwardEligible(p){
 if(!p || p.ally!==true || p.controllerId) return false;
 return typeof p.pc==='boolean'?p.pc:(p.player===true && p.actorType!=='npc');
}
export const AWARD_DEFINITIONS=[
  {
    "title": "Relentless Assault",
    "key": "pressure",
    "description": "Recognizes the PC applying the most verified offensive pressure.",
    "criteria": "Highest Total Pressure (health damage plus absorbed Soak), at least 1."
  },
  {
    "title": "Damage Dealer",
    "key": "effective",
    "description": "Recognizes the PC inflicting the most actual health-resource damage.",
    "criteria": "Highest verified Effective Damage to HP, Vigor or Wounds, at least 1."
  },
  {
    "title": "Deadliest Strike",
    "key": "greatest",
    "description": "Recognizes the PC delivering the strongest individually recorded damaging resource change.",
    "criteria": "Highest single verified effective-damage event; not the original dice roll."
  },
  {
    "title": "Executioner",
    "key": "kills",
    "description": "Recognizes the PC responsible for the most enemy 0-HP takedowns.",
    "criteria": "Most enemy HP crossings from above 0 to 0 or less with verified or GM-corrected PC attribution."
  },
  {
    "title": "Best Healer",
    "key": "healing",
    "description": "Recognizes the PC restoring the most genuine health resources.",
    "criteria": "Highest verified HP, Vigor and Wounds actually restored; Soak refills do not count."
  },
  {
    "title": "Iron Wall",
    "key": "soakTaken",
    "description": "Recognizes the PC whose defenses absorbed the most damage.",
    "criteria": "Highest Soak loss on the PC from incoming attacks; automatic refills excluded."
  },
  {
    "title": "Damage Sponge",
    "key": "received",
    "description": "Recognizes the PC enduring the most actual health damage.",
    "criteria": "Highest total damage received to HP, Vigor and Wounds; excludes Soak-only hits."
  },
  {
    "title": "Critical Master",
    "key": "crits",
    "description": "Recognizes natural-20 attack rolls without needing a confirmation roll.",
    "criteria": "Most verified natural-20 attack rolls recorded by PF1e."
  },
  {
    "title": "Lucky Dice",
    "key": "natural20",
    "description": "Recognizes exceptional recorded die results.",
    "criteria": "Highest number of verified natural 20 results in recorded d20 rolls."
  },
  {
    "title": "Controller",
    "key": "control",
    "description": "Recognizes successful battlefield control.",
    "criteria": "Most attributed recorded applications of control conditions; manual review may be needed."
  }
];
export function makeEvent(raw={}) {return {id:uid(),time:now(),type:'note',resource:null,amount:0,sourceId:null,targetId:null,confidence:'unattributed',visibility:'gm',...raw};}
export function resolvedEvents(events=[]){
 const replacements=new Map(),voids=new Set();
 for(const e of events)if(e.type==='correction'&&e.targetEvent){if(e.action==='void')voids.add(e.targetEvent);if(e.action==='replace'&&e.patch)replacements.set(e.targetEvent,{...(replacements.get(e.targetEvent)||{}),...e.patch});}
 const resolved=events.filter(e=>e.type!=='correction').map(e=>({...e,...(replacements.get(e.id)||{}),voided:voids.has(e.id)}));
 const byId=new Map(resolved.map(e=>[e.id,e]));
 for(const e of resolved){
  if(e.type!=='kill'||!e.damageEventId)continue;
  const dmg=byId.get(e.damageEventId);
  if(!dmg || dmg.voided || dmg.type!=='damage' || dmg.resource!=='hp' || !(number(dmg.amount)>0)){e.voided=true;continue;}
  // Corrections to the HP damage event automatically change kill attribution.
  e.sourceId=dmg.sourceId||null;e.sourceName=dmg.sourceName||'Unattributed';e.confidence=dmg.confidence;
 }
 return resolved;
}
const fresh=(id,name)=>({id,name,effective:0,pressure:0,soak:0,healing:0,received:0,healingReceived:0,soakTaken:0,
 vigor:0,wounds:0,hp:0,tempHp:0,tempVigor:0,nonlethal:0,crits:0,natural20:0,natural1:0,downed:0,takedowns:0,
 control:0,failedSaves:0,failedSavesCaused:0,critRolls:0,deaths:0,revivals:0,kills:0,rounds:{},items:{},minions:{},greatest:0});
export function statistics(record,opts={}){
 const result={};const p=record?.participants||{};
 for(const [id,v] of Object.entries(p))result[id]=fresh(id,v.name);
 result._unattributed=fresh('_unattributed','Unattributed');
 const includesTemp=!!opts.includeTemporary;
 const touch=(id,name)=>result[id]??=fresh(id,name||p[id]?.name||'Unknown');
 for(const e of resolvedEvents(record?.events||[])){
  if(e.voided)continue;
  const amount=Math.max(0,number(e.amount));const src=touch(e.sourceId||'_unattributed',e.sourceName||'Unattributed');
  const dst=e.targetId?touch(e.targetId,e.targetName):null;
  const r=String(e.round??0);const round=src.rounds[r]??={effective:0,soak:0,pressure:0,healing:0};
  const effective=resourceDamage(e,includesTemp);
  if(e.type==='damage'){
    src.effective+=effective;src.pressure+=effective;round.effective+=effective;round.pressure+=effective;
    if(effective){src[e.resource]=(src[e.resource]||0)+effective}
    if(dst)dst.received+=effective;
  }else if(e.type==='soak'){
    src.soak+=amount;src.pressure+=amount;round.soak+=amount;round.pressure+=amount;
    if(dst)dst.soakTaken+=amount;
  }else if(e.type==='kill'){
    if(e.sourceId){src.kills++;src.takedowns++;round.kills=(round.kills||0)+1;}
    else src.kills++; // Explicitly unattributed until corrected by the GM.
  }else if(e.type==='downed'&&dst)dst.downed++;
  else if(e.type==='death'&&dst)dst.deaths++;
  else if(e.type==='revived'&&dst)dst.revivals++;
  else if(e.type==='failedSave'&&e.failed===true){
    if(dst)dst.failedSaves++;
    if(e.sourceId && e.sourceId!==e.targetId){src.control++;src.failedSavesCaused++;round.control=(round.control||0)+1;}
  }else if(e.type==='criticalRoll'&&e.natural===20){
    src.critRolls++;src.crits++;round.critRolls=(round.critRolls||0)+1;
  }else if(e.type==='healing'){
    if(['hp','vigor','wounds'].includes(e.resource)){src.healing+=amount;round.healing+=amount;if(dst)dst.healingReceived+=amount;}
  }else if(e.type==='critical'&&e.confirmed)src.crits++;
  else if(e.type==='roll') {if(e.natural===20)src.natural20++;if(e.natural===1)src.natural1++;}
    else if(e.type==='condition'&&e.applied&&e.sourceId)src.control++;
  if((effective||e.type==='soak')&&e.itemName)src.items[e.itemName]=(src.items[e.itemName]||0)+effective+(e.type==='soak'?amount:0);
 }

 // Combine direct damage to several health resources only when it belongs to
 // one recorded action against the SAME target.
 const hits=new Map();
 for(const e of resolvedEvents(record?.events||[])){
  if(e.voided||e.type!=='damage'||!e.sourceId||!e.targetId)continue;
  const damage=resourceDamage(e,includesTemp);if(damage<=0)continue;
  const key=e.actionId?`${e.sourceId}:${e.targetId}:${e.actionId}`:`event:${e.id}`;
  const hit=hits.get(key)||{sourceId:e.sourceId,damage:0};
  hit.damage+=damage;hits.set(key,hit);
 }
 for(const hit of hits.values())if(result[hit.sourceId])
  result[hit.sourceId].greatest=Math.max(result[hit.sourceId].greatest,hit.damage);

 // Explicit controller grouping without losing the individual record.
 if(opts.groupSummons){
   for(const [id,v] of Object.entries(p))if(v.controllerId && result[id] && result[v.controllerId]){
     const child=result[id],master=result[v.controllerId];
     for(const field of ['effective','pressure','soak','healing','kills','takedowns','crits','critRolls','failedSavesCaused','control'])master[field]+=child[field];
     master.greatest=Math.max(master.greatest,child.greatest);
     master.minions[id]={name:child.name,effective:child.effective,pressure:child.pressure,kills:child.kills,critRolls:child.critRolls};
     for(const [roundId,val] of Object.entries(child.rounds)){
       const r=master.rounds[roundId]??={effective:0,soak:0,pressure:0,healing:0};
       for(const k of ['effective','soak','pressure','healing','critRolls','kills','control'])r[k]+=(val[k]||0);
     }
   }
 }
 return result;
}
export function largestHit(record,{playersOnly=true}={}){
 const people=record?.participants||{},hits=new Map();
 for(const e of resolvedEvents(record?.events||[])){
  if(e.voided||e.type!=='damage'||!e.sourceId||!e.targetId)continue;
  const amount=resourceDamage(e,false);if(!(amount>0))continue;
  const origin=people[e.sourceId];
  const owner=origin?.controllerId?people[origin.controllerId]:null;
  const credited=owner&&isAwardEligible(owner)?owner:origin;
  if(playersOnly&&!isAwardEligible(credited))continue;
  const key=e.actionId?`${e.sourceId}:${e.targetId}:${e.actionId}`:`event:${e.id}`;
  const hit=hits.get(key)||{amount:0,sourceId:credited?.id||e.sourceId,sourceName:credited?.name||e.sourceName||'Unknown',
   targetName:e.targetName||people[e.targetId]?.name||'Unknown',itemName:e.itemName||'Unspecified attack'};
  hit.amount+=amount;hits.set(key,hit);
 }
 return [...hits.values()].sort((a,b)=>b.amount-a.amount)[0]||null;
}
export function leaders(record){
 const p=record?.participants||{};
 const scores=statistics(record,{groupSummons:true});
 const eligible=Object.values(scores).filter(s=>isAwardEligible(p[s.id]));
 return AWARD_DEFINITIONS.map(def=>{
  const winner=eligible.filter(s=>s[def.key]>0).sort((a,b)=>b[def.key]-a[def.key])[0];
  const suffix=def.key==='kills'?'enemy takedown(s)':def.key==='greatest'?'effective damage from one recorded event':def.key==='crits'?'confirmed critical hit(s)':def.key==='natural20'?'natural 20(s)':def.key==='pressure'?'total pressure':def.key==='effective'?'effective damage':def.key==='healing'?'healing restored':def.key==='soakTaken'?'soak absorbed':def.key==='received'?'damage received':'control application(s)';
  return winner?{...def,winner,evidence:winner.name+': '+number(winner[def.key])+' '+suffix}:null;
 }).filter(Boolean);
}
export function dailyAggregate(records){const result={combats:records.length,rounds:0,effective:0,pressure:0,healing:0,soak:0,kills:0,combatants:{}};
 for(const record of records){result.rounds+=number(record.round);
  result.kills+=Object.values(statistics(record,{groupSummons:true})).filter(v=>isAwardEligible(record.participants?.[v.id])).reduce((n,v)=>n+v.kills,0);
  for(const p of Object.values(statistics(record))){if(p.id==='_unattributed')continue;const key=record.participants?.[p.id]?.actorUuid||record.participants?.[p.id]?.actorId||p.name;
 const t=result.combatants[key]??={name:p.name,effective:0,pressure:0,healing:0,soak:0,kills:0};
 for(const f of ['effective','pressure','healing','soak','kills']){t[f]+=p[f];if(f!=='kills')result[f]+=p[f]}
 }}return result;}
