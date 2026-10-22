import test from 'node:test';
import assert from 'node:assert/strict';
import {statistics,leaders,resolvedEvents,isAwardEligible,dailyAggregate} from '../scripts/analytics/model.mjs';
import {playerProjection} from '../scripts/services/privacy.mjs';
const pc={id:'pc',name:'PC',ally:true,player:true,pc:true,actorType:'character'};
const pet={id:'pet',name:'Pet',ally:true,player:true,pc:false,controllerId:'pc',actorType:'npc'};
const enemy={id:'enemy',name:'Enemy',ally:false,player:false,pc:false,actorType:'npc'};
const base={id:'rec1',name:'Battle',combatId:'combat1',round:1,participants:{pc,pet,enemy},awards:[]};
const damage=(id,src,target,amount)=>({id,type:'damage',resource:'hp',amount,sourceId:src,targetId:target,sourceName:src||'Unattributed'});
const kill=(id,src,target,did)=>({id,type:'kill',resource:'hp',amount:1,sourceId:src,targetId:target,damageEventId:did});
const r=events=>({...base,events});
test('awards exclude enemies and pets, even if enemy has highest damage',()=>{
 const a=leaders(r([damage('a','enemy','pc',100),damage('b','pc','enemy',15)]));
 assert.equal(a.find(x=>x.title==='Damage Dealer')?.winner.id,'pc');
 assert.equal(a.some(x=>x.winner.id==='enemy'||x.winner.id==='pet'),false);
 assert.equal(isAwardEligible(pet),false);
});
test('award cards provide rationale and exact candidate value',()=>{
 const x=leaders(r([damage('a','pc','enemy',15)])).find(x=>x.title==='Damage Dealer');
 assert.ok(x.description&&x.criteria);
 assert.match(x.evidence,/15/);
});
test('confirmed PC kill credits a 0-HP takedown and Executioner',()=>{
 const a=r([damage('d','pc','enemy',12),kill('k','pc','enemy','d')]);
 assert.equal(statistics(a).pc.kills,1);
 assert.equal(leaders(a).find(x=>x.title==='Executioner')?.winner.id,'pc');
 assert.equal(dailyAggregate([a]).kills,1);
 assert.equal(playerProjection(a).stats.pc.kills,1);
});
test('GM correction to linked damage source retroactively credits kill',()=>{
 const a=r([damage('d',null,'enemy',12),kill('k',null,'enemy','d')]);
 assert.equal(statistics(a).pc.kills,0);
 const b=r([...a.events,{id:'c',type:'correction',targetEvent:'d',action:'replace',patch:{sourceId:'pc',sourceName:'PC',confidence:'manually-corrected'}}]);
 assert.equal(statistics(b).pc.kills,1);
 assert.equal(resolvedEvents(b.events).find(x=>x.id==='k').sourceId,'pc');
});
test('voiding damage also voids linked kill',()=>{
 const a=r([damage('d','pc','enemy',12),kill('k','pc','enemy','d'),{id:'c',type:'correction',targetEvent:'d',action:'void'}]);
 assert.equal(statistics(a).pc.kills,0);
});
test('companion kill rolls up to player without offering companion an award',()=>{
 const a=r([damage('d','pet','enemy',9),kill('k','pet','enemy','d')]);
 assert.equal(statistics(a,{groupSummons:true}).pc.kills,1);
 assert.equal(leaders(a).find(x=>x.title==='Executioner')?.winner.id,'pc');
});
test('UI displays eligibility details and candidate evidence',async()=>{
 globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){}}}}};
 globalThis.game={user:{isGM:true},settings:{get:(m,k)=>k==='timezone'?'America/Denver':false}};
 const {AnalyticsDashboard}=await import('../scripts/ui/windows.mjs');
 const app=new AnalyticsDashboard();app.record=r([damage('a','enemy','pc',90),damage('b','pc','enemy',15)]);app.tab='awards';
 const html=app.html();assert.match(html,/How earned:/);assert.match(html,/Candidate:/);
 assert.doesNotMatch(html,/data-id="Damage Dealer\|enemy"/);
});