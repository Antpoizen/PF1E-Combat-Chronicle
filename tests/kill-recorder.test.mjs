import test from 'node:test';
import assert from 'node:assert/strict';
import {ChronicleRecorder} from '../scripts/core/recorder.mjs';
const makeCombat=(enemy=false)=>{
 const actor={uuid:'Actor.target',id:'target',name:'Target',type:enemy?'npc':'character',hasPlayerOwner:!enemy,system:{attributes:{hp:{value:0}}}};
 const attack={uuid:'Actor.pc',id:'attacker',name:'Hero',type:'character',hasPlayerOwner:true};
 const combatants=[{id:'t',name:'Target',actor,actorId:actor.id,token:{disposition:enemy?-1:1}},{id:'s',name:'Hero',actor:attack,actorId:attack.id,token:{disposition:1}}];
 combatants.get=id=>combatants.find(c=>c.id===id);
 return {actor,combat:{id:'c',started:true,round:2,turn:0,combatants}};
};
test('enemy crossing 0 HP creates one kill event linked to actual HP loss',async()=>{
 globalThis.game={user:{isGM:true},settings:{get:()=>'{ }'},messages:{get:()=>null}};
 const {actor,combat}=makeCombat(true);
 const cc=new ChronicleRecorder();cc.combatForActor=()=>combat;const events=[];cc.add=async(c,e)=>events.push(...e);
 cc.snapshots.set(cc.snapshotKey(combat,actor),{hp:5});
 cc.handleHealth(actor,{}, {combatChronicle:{sourceId:'s'}});await cc.queue;
 const damage=events.find(e=>e.type==='damage'&&e.resource==='hp');
 const kill=events.find(e=>e.type==='kill');
 assert.ok(damage&&kill);assert.equal(kill.damageEventId,damage.id);assert.equal(kill.sourceId,'s');
 actor.system.attributes.hp.value=-2;cc.handleHealth(actor,{}, {combatChronicle:{sourceId:'s'}});await cc.queue;
 assert.equal(events.filter(e=>e.type==='kill').length,1);
});
test('player character crossing 0 HP does not create enemy kill',async()=>{
 globalThis.game={user:{isGM:true},settings:{get:()=>'{ }'},messages:{get:()=>null}};
 const {actor,combat}=makeCombat(false);const cc=new ChronicleRecorder();cc.combatForActor=()=>combat;
 const events=[];cc.add=async(c,e)=>events.push(...e);
 cc.snapshots.set(cc.snapshotKey(combat,actor),{hp:5});cc.handleHealth(actor,{},{});await cc.queue;
 assert.equal(events.some(e=>e.type==='kill'),false);
});