import test from 'node:test';
import assert from 'node:assert/strict';
import {criticalOutcomeFromRoll,itemFromMessage} from '../scripts/adapters/rolls.mjs';
import {statistics} from '../scripts/analytics/model.mjs';
test('critical threat and confirmation on 18 or 19',()=>{
 assert.equal(criticalOutcomeFromRoll({flags:{pf1:{critThreat:true}},rolls:[{terms:[{faces:20,results:[{result:18}]}]}]})?.reason,'critical-threat');
 assert.equal(criticalOutcomeFromRoll({flavor:'Critical Confirmation',rolls:[{terms:[{faces:20,results:[{result:17}]}]}]})?.reason,'confirmation-evidence');
 assert.equal(criticalOutcomeFromRoll({flavor:'Attack roll',rolls:[{terms:[{faces:20,results:[{result:19}]}]}]}),null);
});
test('item source inferred only from structured linked item data',()=>{
 const message={speaker:{actor:'a'},flags:{pf1:{itemId:'item1'}}};
 const combat={combatants:[{actorId:'a',actor:{items:{get:id=>id==='item1'?{name:'Fireball'}:null}}}]};
 assert.equal(itemFromMessage(message,combat),'Fireball');
 assert.equal(itemFromMessage({flags:{pf1:{item:{name:'Boneshaker'}}}}),'Boneshaker');
 assert.equal(itemFromMessage({content:'Fireball appears in other text'}),null);
});
test('corrected damage item names produce distinct ability breakdown',()=>{
 const r={participants:{a:{name:'Wizard'},t:{name:'Enemy'}},events:[
  {id:'d1',type:'damage',resource:'hp',amount:120,sourceId:'a',targetId:'t'},
  {id:'d2',type:'damage',resource:'hp',amount:60,sourceId:'a',targetId:'t',itemName:'Boneshaker'},
  {id:'fix',type:'correction',action:'replace',targetEvent:'d1',patch:{itemName:'Fireball'}}
 ]};
 assert.deepEqual(statistics(r).a.items,{Fireball:120,Boneshaker:60});
});
test('manual Control can be added and corrected without mutation',()=>{
 const r={participants:{a:{name:'Mage'}},events:[{id:'ctrl',type:'control',applied:true,sourceId:'a',amount:1}]};
 assert.equal(statistics(r).a.control,1);
 r.events.push({id:'fix',type:'correction',targetEvent:'ctrl',action:'replace',patch:{amount:3}});
 assert.equal(statistics(r).a.control,3);
});
test('flagged critical does not require a natural 20',()=>{
 assert.equal(statistics({participants:{a:{name:'Rogue'}},events:[{id:'crit',type:'criticalRoll',critical:true,natural:18,sourceId:'a',amount:1}]}).a.critRolls,1);
});
