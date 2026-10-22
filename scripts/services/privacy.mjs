import {statistics,resolvedEvents} from '../analytics/model.mjs';
// Projection is computed GM-side. Never serialize the canonical event archive to players.
export function playerProjection(record,settings={}){
 const p=record?.participants||{};
 const allowed=new Set(Object.values(p).filter(v=>v.ally&&!v.hidden).map(v=>v.id));
 const participants=Object.fromEntries(Object.entries(p).filter(([id])=>allowed.has(id)).map(([id,v])=>[id,{id,name:v.name,img:v.img,ally:true,controllerId:allowed.has(v.controllerId)?v.controllerId:null}]));
 // Strip disallowed source identities BEFORE calculating totals or controller groupings.
 const filtered=resolvedEvents(record.events||[]).flatMap(event=>{
   if(event.voided||event.visibility==='private')return [];
   const sourceAllowed=allowed.has(event.sourceId),targetAllowed=allowed.has(event.targetId);
   if(!sourceAllowed&&!targetAllowed)return [];
   return [{...event,sourceId:sourceAllowed?event.sourceId:null,sourceName:sourceAllowed?event.sourceName:'Unknown',
     targetId:targetAllowed?event.targetId:null,targetName:targetAllowed?event.targetName:null,
     itemName:sourceAllowed?event.itemName:null}];
 });
 const raw=statistics({participants,events:filtered},{includeTemporary:!!settings.includeTemporary,groupSummons:!!settings.groupSummons});
 const rows=Object.fromEntries(Object.entries(raw).filter(([id])=>allowed.has(id)).map(([id,s])=>[id,{
  id:s.id,name:participants[id]?.name, effective:s.effective,pressure:s.pressure,soak:s.soak,healing:s.healing,
  rounds:s.rounds,items:s.items,minions:Object.fromEntries(Object.entries(s.minions||{}).filter(([k])=>allowed.has(k))),
  vigor:s.vigor,wounds:s.wounds,hp:s.hp,received:s.received,soakTaken:s.soakTaken
 }]));
 const awards=(record.awards||[]).filter(a=>a.approved&&allowed.has(a.combatantId)).map(a=>({title:a.title,combatantId:a.combatantId}));
 return {id:record.id,combatId:record.combatId,name:record.privacy?.shareEncounterName?record.name:'Combat Encounter',round:record.round,turn:record.turn,status:record.status,start:record.start,participants,
 stats:rows,awards,report:record.report?.published?record.report.publicText||'':null};
}
