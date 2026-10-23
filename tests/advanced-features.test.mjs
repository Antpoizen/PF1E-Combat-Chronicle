import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {criticalOutcomeFromRoll,saveOutcomeFromRoll} from '../scripts/adapters/rolls.mjs';
import {playerWoundState} from '../scripts/adapters/health.mjs';
import {largestHit,statistics} from '../scripts/analytics/model.mjs';
const participants={pc:{id:'pc',ally:true,pc:true,name:'Hero'},target:{id:'target',ally:false,name:'Enemy'}};
const record=events=>({participants,events,round:1});
test('verified natural 20 needs no confirmation and failed save needs a DC',()=>{
 const nat20={rolls:[{total:27,terms:[{faces:20,results:[{result:20,active:true}]}]}]};
 assert.deepEqual(criticalOutcomeFromRoll(nat20),{natural:20});
 assert.equal(saveOutcomeFromRoll({...nat20,dc:30},'fort').failed,false); // natural 20 auto succeeds
 assert.equal(saveOutcomeFromRoll({rolls:[{total:11,terms:[{faces:20,results:[{result:5}]}]}],dc:18},'will').failed,true);
 assert.equal(saveOutcomeFromRoll({rolls:[{total:11}]},'will'),null);
});
test('downed and dead use PC Wounds/Vigor/Constitution thresholds',()=>{
 assert.equal(playerWoundState({vigor:0,wounds:-1,constitution:14},true).down,true);
 assert.equal(playerWoundState({vigor:0,wounds:0,constitution:14},true).down,false);
 assert.equal(playerWoundState({vigor:0,wounds:-14,constitution:14},true).dead,true);
 assert.equal(playerWoundState({vigor:0,wounds:-14,constitution:14},false).dead,false);
});
test('largest hit sums vigor and wounds for one action and excludes enemy attacks',()=>{
 const events=[
  {id:'a',type:'damage',resource:'vigor',amount:12,sourceId:'pc',targetId:'target',actionId:'swing'},
  {id:'b',type:'damage',resource:'wounds',amount:5,sourceId:'pc',targetId:'target',actionId:'swing'},
  {id:'c',type:'damage',resource:'hp',amount:60,sourceId:'target',targetId:'pc'}
 ];
 assert.equal(largestHit(record(events)).amount,17);
 assert.equal(statistics(record(events)).pc.greatest,17);
});
test('GM-corrected failed saves count towards attributed source control',()=>{
 const events=[{id:'s1',type:'failedSave',failed:true,resource:'will',targetId:'target',sourceId:null,amount:1},
 {id:'fix',type:'correction',action:'replace',targetEvent:'s1',patch:{sourceId:'pc',confidence:'manually-corrected'}}];
 assert.equal(statistics(record(events)).pc.control,1);
 assert.equal(statistics(record(events)).pc.failedSavesCaused,1);
});
test('red border, healing track and new dropdowns exist in actual module',async()=>{
 const css=await readFile(new URL('../styles/chronicle.css',import.meta.url),'utf8');
 const ui=await readFile(new URL('../scripts/ui/windows.mjs',import.meta.url),'utf8');
 assert.match(css,/\.cc-correction-list \.cc-correction\.cc-correction-needs-attribution\{[^}]*border:3px solid/);
 assert.match(css,/\.cc-heal-track\{/);
 assert.match(ui,/data-change="meterSort"|select\('meterSort'/);
 assert.match(ui,/select\('meterExtra'/);
});
