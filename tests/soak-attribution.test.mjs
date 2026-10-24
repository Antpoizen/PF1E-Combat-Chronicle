import test from 'node:test';
import assert from 'node:assert/strict';
import {ChronicleRecorder} from '../scripts/core/recorder.mjs';
import {statistics} from '../scripts/analytics/model.mjs';
const origin={id:'hero',name:'Hero',actorId:'a',actor:{id:'a',uuid:'Actor.a'}};
const victim={id:'enemy',name:'Enemy',actorId:'b',actor:{id:'b',uuid:'Actor.b'}};
const combat={id:'combat1',started:true,round:1,turn:0,combatants:[origin,victim]};
combat.combatants.get=id=>combat.combatants.find(c=>c.id===id);
function setup(){
 globalThis.game={user:{id:'gm',isGM:true},users:[{id:'gm',isGM:true,active:true}],settings:{get:()=>false},messages:{get:()=>null}};
 const recorder=new ChronicleRecorder(),events=[];
 recorder.combatForActor=()=>combat;
 recorder.add=async(c,items)=>events.push(...items);
 return {recorder,events};
}
test('native soak event uses verified same-target resource-damage source',async()=>{
 const {recorder,events}=setup();
 recorder.recentHealthSources.set('Actor.b',{at:Date.now(),combatId:'combat1',used:false,
  source:{sourceId:'hero',sourceName:'Hero',itemName:'Fireball'}});
 recorder.handleSoak(victim.actor,{type:'soak',resource:'soak',amount:9,evidence:{old:12,new:3}});
 await recorder.queue;
 assert.equal(events.length,1);
 assert.equal(events[0].sourceId,'hero');
 assert.equal(events[0].itemName,'Fireball');
 assert.equal(events[0].confidence,'strongly-correlated');
 assert.equal(statistics({participants:{hero:{name:'Hero'},enemy:{name:'Enemy'}},events}).hero.soak,9);
});
test('explicit structured target chat identifies soak-only attacker',async()=>{
 const {recorder,events}=setup();
 const msg={id:'attack1',speaker:{actor:'a'},flags:{pf1:{targets:[{actorId:'b'}],item:{name:'Longsword'}}}};
 recorder.rememberTargetedAttack(combat,msg,origin);
 recorder.handleSoak(victim.actor,{type:'soak',resource:'soak',amount:5,evidence:{old:8,new:3}});
 await recorder.queue;
 assert.equal(events[0].sourceId,'hero');
 assert.equal(events[0].itemName,'Longsword');
});
test('ambiguous competing targeted attackers are not guessed',async()=>{
 const {recorder,events}=setup();
 const another={id:'rogue',name:'Rogue'};
 recorder.rememberTargetedAttack(combat,{id:'1',flags:{pf1:{targets:[{actorId:'b'}]}}},origin);
 recorder.rememberTargetedAttack(combat,{id:'2',flags:{pf1:{targets:[{actorId:'b'}]}}},another);
 recorder.handleSoak(victim.actor,{type:'soak',resource:'soak',amount:5,evidence:{old:8,new:3}});
 await new Promise(done=>setTimeout(done,300));
 await recorder.queue;
 assert.equal(events.length,1);
 assert.equal(events[0].sourceId,null);
});
test('fallback Soak with verified source is not forcibly flagged ambiguous',async()=>{
 const {recorder,events}=setup();let soak=10;
 victim.actor.flags={'armor-soak-pool':{current:7}};
 recorder.snapshots.set(recorder.snapshotKey(combat,victim.actor),{soak});
 recorder.resolveEvidence=()=>({sourceId:'hero',sourceName:'Hero',confidence:'confirmed'});
 recorder.handleHealth(victim.actor,{},{});
 await new Promise(done=>setTimeout(done,685));await recorder.queue;
 assert.equal(events.length,1);
 assert.equal(events[0].confidence,'confirmed');
});

test('direct action context takes precedence over older target correlation',()=>{
 const {recorder}=setup();
 recorder.recentHealthSources.set('Actor.b',{at:Date.now(),combatId:'combat1',used:false,
  source:{sourceId:'oldSource',sourceName:'Old Attacker'}});
 recorder.pendingOrigins.set('Actor.b',{at:Date.now(),sourceId:'hero',sourceName:'Hero',itemName:'Magic Missile'});
 const source=recorder.resolveSoakEvidence(victim.actor,combat);
 assert.equal(source.sourceId,'hero');
 assert.equal(source.itemName,'Magic Missile');
});
test('normal health attribution never consumes an earlier Soak-linked source',()=>{
 const {recorder}=setup();
 recorder.recentHealthSources.set('Actor.b',{at:Date.now(),combatId:'combat1',used:false,
  source:{sourceId:'hero',sourceName:'Hero'}});
 const source=recorder.resolveEvidence({},victim.actor,combat);
 assert.equal(source.sourceId,null);
});
