import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ChronicleRecorder} from '../scripts/core/recorder.mjs';
import {currentEncounter} from '../scripts/core/utils.mjs';
import {playerProjection} from '../scripts/services/privacy.mjs';
const heroActor={id:'a',uuid:'Actor.a',name:'Hero',type:'character',hasPlayerOwner:true};
const enemyActor={id:'b',uuid:'Actor.b',name:'Enemy',type:'npc',flags:{'armor-soak-pool':{current:5}}};
const hero={id:'hero',actorId:'a',actor:heroActor,name:'Hero',tokenId:'token1',token:{disposition:1}};
const enemy={id:'enemy',actorId:'b',actor:enemyActor,name:'Enemy',tokenId:'token2',token:{disposition:-1}};
const combat={id:'combat-1',started:true,round:2,turn:0,combatants:[hero,enemy]};
combat.combatants.get=id=>combat.combatants.find(c=>c.id===id);
function world(isGM=false){
 const socketEvents=[],handlers=new Map();
 const gm={id:'gm',isGM:true,active:true},pc={id:'pc',isGM:false,active:true};
 globalThis.Hooks={on:()=>{}};
 globalThis.game={user:isGM?gm:pc,users:[gm,pc],combats:[combat],
  messages:{get:id=>id==='message1'?{id:'message1',speaker:{actor:'a'},flags:{pf1:{item:{name:'Longsword'}}}}:null},
  settings:{get:(module,name)=>name==='allowPlayers'||name==='enabled'||name==='groupSummons'?true:false},
  socket:{on:(name,fn)=>handlers.set(name,fn),emit:(name,message)=>socketEvents.push(message)}};
 game.combats.active=null;game.users.get=id=>game.users.find(x=>x.id===id);
 return {socketEvents,handlers};
}
test('module explicitly enables the Foundry socket namespace',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../module.json',import.meta.url),'utf8'));
 assert.equal(manifest.socket,true);
});
test('player request works when a single combat is started but not scene-active',()=>{
 const x=world(false),r=new ChronicleRecorder();
 assert.equal(currentEncounter()?.id,combat.id);
 r.requestProjection();
 assert.equal(x.socketEvents[0].kind,'request');
});
test('GM serves a private-safe player projection on a request',()=>{
 const x=world(true),r=new ChronicleRecorder();
 const record={id:'record',combatId:combat.id,round:2,status:'active',participants:{
  hero:{id:'hero',ally:true,name:'Hero',img:'hero.png',player:true,pc:true},
  enemy:{id:'enemy',ally:false,name:'Hidden Dragon',hidden:true,img:'secret.png'}},events:[
  {id:'d',type:'damage',resource:'hp',sourceId:'hero',targetId:'enemy',amount:12}]};
 r.records.set(combat.id,record);
 r.install();
 const fn=x.handlers.get('module.combat-chronicle');
 assert.equal(typeof fn,'function');
 fn({kind:'request'},'pc');
 const state=x.socketEvents.find(m=>m.kind==='state');
 assert.ok(state);
 assert.equal(state.projection.stats.hero.effective,12);
 assert.ok(!JSON.stringify(state.projection).includes('Hidden Dragon'));
});
test('player receiving the GM projection can render the live meter',async()=>{
 world(false);
 globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){}}}}};
 const r=new ChronicleRecorder(),record={id:'record',combatId:combat.id,round:2,status:'active',participants:{
  hero:{id:'hero',ally:true,name:'Hero',img:'hero.png',player:true,pc:true}},events:[
  {id:'d',type:'damage',resource:'hp',sourceId:'hero',targetId:null,amount:12}]};
 r.latest=playerProjection(record);
 game.combatChronicle={recorder:r};
 const {LiveMeter}=await import('../scripts/ui/windows.mjs');
 const html=await new LiveMeter().html();
 assert.match(html,/Hero/);
 assert.doesNotMatch(html,/No active combat|Waiting for GM combat data/);
});
test('client-side Soak hook relays the native absorbed amount to the GM',async()=>{
 const x=world(false),r=new ChronicleRecorder();
 r.observeSoak(enemyActor,{type:'soak',resource:'soak',amount:5,delta:-5,evidence:{old:10,new:5,reason:'split'}});
 const packet=x.socketEvents.find(m=>m.kind==='soak-observed');
 assert.ok(packet);assert.equal(packet.actorUuid,'Actor.b');
 assert.equal(packet.event.amount,5);
 world(true);
 const authorityRecorder=new ChronicleRecorder(),events=[];
 authorityRecorder.add=async(_c,items)=>events.push(...items);
 authorityRecorder.receiveDamageContext({actorUuid:'Actor.b',combatId:combat.id,messageId:'message1'});
 authorityRecorder.receiveSoakObservation(packet);
 await authorityRecorder.queue;
 assert.equal(events.length,1);
 assert.equal(events[0].sourceId,'hero');
 assert.equal(events[0].itemName,'Longsword');
 assert.equal(events[0].amount,5);
});
test('GM ignores unverified Soak packets whose flag state does not match',async()=>{
 world(true);
 const r=new ChronicleRecorder(),events=[];
 r.add=async(_c,items)=>events.push(...items);
 r.receiveSoakObservation({combatId:combat.id,actorUuid:'Actor.b',
  event:{type:'soak',amount:5,evidence:{old:20,new:15}}});
 await r.queue;assert.equal(events.length,0);
});
