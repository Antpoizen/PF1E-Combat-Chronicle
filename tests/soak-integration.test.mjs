import test from 'node:test';
import assert from 'node:assert/strict';
import {installSoakHooks} from '../scripts/adapters/soak.mjs';
import {ChronicleRecorder} from '../scripts/core/recorder.mjs';
import {statistics} from '../scripts/analytics/model.mjs';

const callbacks=new Map();
globalThis.Hooks={on:(name,fn)=>callbacks.set(name,fn)};
test('Soak native damage hook reads absorbed amount, not overflow',()=>{
 const seen=[];installSoakHooks((actor,event)=>seen.push(event));
 const actor={id:'monster'};
 callbacks.get('armorSoakPool.damageApplied')(actor,{current:7},{current:12},{amount:20,absorbed:5,overflow:15,reason:'split'});
 assert.equal(seen.length,1);
 assert.equal(seen[0].amount,5);
 assert.equal(seen[0].evidence.overflow,15);
 assert.equal(statistics({participants:{a:{name:'Attacker'},m:{name:'Monster'}},events:[{...seen[0],sourceId:'a',targetId:'m'}]}).a.pressure,5);
 callbacks.get('armorSoakPool.damageApplied')(actor,{current:7},{current:7},{amount:13,absorbed:0,overflow:13});
 assert.equal(seen.length,1);
});
test('a manual decrease is not counted as Soak damage when adjustment hook fires',()=>{
 const events=[];installSoakHooks((actor,event)=>events.push(event));
 callbacks.get('armorSoakPool.adjusted')({id:'m'},{current:3},{current:9},{reason:'manual'});
 assert.equal(events.at(-1).type,'adjustment');
 assert.equal(statistics({participants:{a:{name:'Attacker'}},events:[{...events.at(-1),sourceId:'a'}]}).a.pressure,0);
});
const actor={id:'m',uuid:'Actor.m',name:'Monster',system:{attributes:{}},flags:{'armor-soak-pool':{current:10}},statuses:new Set()};
const c={id:'c',started:true,round:1,turn:0};
const a={id:'a',uuid:'Actor.a',name:'Hero',hasPlayerOwner:true,type:'character'};
c.combatants=[
 {id:'m',name:'Monster',actor,actorId:'m',token:{disposition:-1}},
 {id:'a',name:'Hero',actor:a,actorId:'a',token:{disposition:1}}];
c.combatants.get=id=>c.combatants.find(v=>v.id===id);
const setup=()=>{
 const rec=new ChronicleRecorder();const events=[];
 rec.combatForActor=()=>c;rec.add=async(_c,items)=>events.push(...items);
 rec.resolveEvidence=()=>({sourceId:'a',sourceName:'Hero',confidence:'confirmed'});
 rec.snapshots.set(rec.snapshotKey(c,actor),{soak:10});
 return {rec,events};
};
test('two identical soak hits separated by a refill both count',async()=>{
 globalThis.game={user:{id:'gm',isGM:true},users:[{id:'gm',isGM:true,active:true}],settings:{get:()=>false}};
 const {rec,events}=setup();
 actor.flags['armor-soak-pool'].current=5;
 rec.handleHealth(actor,{},{});
 rec.handleSoak(actor,{type:'soak',resource:'soak',amount:5,evidence:{old:10,new:5}});
 await rec.queue;
 actor.flags['armor-soak-pool'].current=10;
 rec.handleHealth(actor,{},{});
 rec.handleSoak(actor,{type:'refill',resource:'soak',amount:5,evidence:{old:5,new:10}});
 await rec.queue;
 actor.flags['armor-soak-pool'].current=5;
 rec.handleHealth(actor,{},{});
 rec.handleSoak(actor,{type:'soak',resource:'soak',amount:5,evidence:{old:10,new:5}});
 await rec.queue;
 const attacks=events.filter(e=>e.type==='soak');
 assert.equal(attacks.length,2);
 assert.equal(new Set(attacks.map(e=>e.eventKey)).size,2);
 const totals=statistics({participants:{a:{name:'Hero'},m:{name:'Monster'}},events});
 assert.equal(totals.a.soak,10);assert.equal(totals.a.pressure,10);
 assert.equal(totals.m.soakTaken,10);
});
test('when native hook is unavailable, flag delta is recorded provisionally',async()=>{
 globalThis.game={user:{id:'gm',isGM:true},users:[{id:'gm',isGM:true,active:true}],settings:{get:()=>false}};
 const {rec,events}=setup();
 rec.resolveEvidence=()=>({sourceId:null,sourceName:'Unattributed',confidence:'unattributed'});
 actor.flags['armor-soak-pool'].current=7;
 rec.handleHealth(actor,{},{});
 await new Promise(done=>setTimeout(done,160));
 await rec.queue;
 assert.equal(events.filter(e=>e.type==='soak').length,1);
 assert.equal(events[0].amount,3);
 assert.equal(events[0].confidence,'ambiguous');
 assert.equal(events[0].evidence.reasonVerified,false);
});
