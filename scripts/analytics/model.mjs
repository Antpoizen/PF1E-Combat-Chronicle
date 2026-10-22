import {number,clone,uid,now} from '../core/utils.mjs';
import {resourceDamage} from '../adapters/health.mjs';
export const EVENT_TYPES=['damage','healing','soak','refill','roll','condition','turn','correction','downed','death','critical','encounter'];
export function makeEvent(raw={}) {return {id:uid(),time:now(),type:'note',resource:null,amount:0,sourceId:null,targetId:null,confidence:'unattributed',visibility:'gm',...raw};}
export function resolvedEvents(events=[]){
 const replacements=new Map(),voids=new Set();
 for(const e of events)if(e.type==='correction'&&e.targetEvent){if(e.action==='void')voids.add(e.targetEvent);if(e.action==='replace'&&e.patch)replacements.set(e.targetEvent,{...(replacements.get(e.targetEvent)||{}),...e.patch});}
 return events.filter(e=>e.type!=='correction').map(e=>({...e,...(replacements.get(e.id)||{}),voided:voids.has(e.id)}));
}
const fresh=(id,name)=>({id,name,effective:0,pressure:0,soak:0,healing:0,received:0,healingReceived:0,soakTaken:0,
 vigor:0,wounds:0,hp:0,tempHp:0,tempVigor:0,nonlethal:0,crits:0,natural20:0,natural1:0,downed:0,takedowns:0,
 control:0,rounds:{},items:{},minions:{},greatest:0});
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
    if(effective){src[e.resource]=(src[e.resource]||0)+effective;src.greatest=Math.max(src.greatest,effective)}
    if(dst)dst.received+=effective;
  }else if(e.type==='soak'){
    src.soak+=amount;src.pressure+=amount;round.soak+=amount;round.pressure+=amount;
    if(dst)dst.soakTaken+=amount;
  }else if(e.type==='healing'){
    if(['hp','vigor','wounds'].includes(e.resource)){src.healing+=amount;round.healing+=amount;if(dst)dst.healingReceived+=amount;}
  }else if(e.type==='critical'&&e.confirmed)src.crits++;
  else if(e.type==='roll') {if(e.natural===20)src.natural20++;if(e.natural===1)src.natural1++;}
  else if(e.type==='downed'&&dst)dst.downed++;
  else if(e.type==='condition'&&e.applied&&e.sourceId)src.control++;
  if((effective||e.type==='soak')&&e.itemName)src.items[e.itemName]=(src.items[e.itemName]||0)+effective+(e.type==='soak'?amount:0);
 }
 // Explicit controller grouping without losing the individual record.
 if(opts.groupSummons){
   for(const [id,v] of Object.entries(p))if(v.controllerId && result[id] && result[v.controllerId]){
     const child=result[id],master=result[v.controllerId];
     for(const field of ['effective','pressure','soak','healing'])master[field]+=child[field];
     master.minions[id]={name:child.name,effective:child.effective,pressure:child.pressure};
     for(const [roundId,val] of Object.entries(child.rounds)){
       const r=master.rounds[roundId]??={effective:0,soak:0,pressure:0,healing:0};
       for(const k of ['effective','soak','pressure','healing'])r[k]+=(val[k]||0);
     }
   }
 }
 return result;
}
export function leaders(record){const rows=Object.values(statistics(record)).filter(v=>v.id!=='_unattributed');
 const lead=key=>rows.filter(r=>r[key]>0).sort((a,b)=>b[key]-a[key])[0]||null;
 return [['Relentless Assault','pressure'],['Damage Dealer','effective'],['Best Healer','healing'],['Iron Wall','soakTaken'],['Damage Sponge','received'],['Critical Master','crits'],['Lucky Dice','natural20'],['Controller','control']].map(([title,key])=>({title,key,winner:lead(key)})).filter(x=>x.winner);
}
export function dailyAggregate(records){const result={combats:records.length,rounds:0,effective:0,pressure:0,healing:0,soak:0,combatants:{}};
 for(const record of records){result.rounds+=number(record.round);for(const p of Object.values(statistics(record))){if(p.id==='_unattributed')continue;const key=record.participants?.[p.id]?.actorUuid||record.participants?.[p.id]?.actorId||p.name;
 const t=result.combatants[key]??={name:p.name,effective:0,pressure:0,healing:0,soak:0};
 for(const f of ['effective','pressure','healing','soak']){t[f]+=p[f];result[f]+=p[f]}
 }}return result;}
