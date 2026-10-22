import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){}}}}};
globalThis.game={user:{isGM:true},settings:{get:(module,name)=>name==='timezone'?'America/Denver':false}};
const {AnalyticsDashboard,needsAttribution}=await import('../scripts/ui/windows.mjs');
const base={id:'r',combatId:'c',name:'Battle',start:'2026-10-22T03:00:00Z',status:'active',round:2,
 participants:{a:{id:'a',name:'Hero',ally:true},b:{id:'b',name:'Enemy',ally:false}},awards:[]};
function render(events){const app=new AnalyticsDashboard();app.tab='corrections';app.record={...base,events};return app.html()}
const event={id:'e',type:'damage',resource:'hp',amount:14,sourceId:null,targetId:'b',targetName:'Enemy',confidence:'unattributed',round:1};
test('unattributed event gets a red class and readable label',()=>{
 const html=render([event]);
 assert.match(html,/1 events need attribution review/);
 assert.match(html,/cc-correction-needs-attribution/);
 assert.match(html,/Needs attribution/);
 assert.match(html,/data-attribution="pending"/);
});
test('assigning a source removes the red class after correction',()=>{
 const correction={id:'fix',type:'correction',action:'replace',targetEvent:'e',
 patch:{sourceId:'a',sourceName:'Hero',confidence:'manually-corrected'}};
 const html=render([event,correction]);
 assert.match(html,/0 events need attribution review/);
 assert.doesNotMatch(html,/cc-correction-needs-attribution/);
 assert.match(html,/data-attribution="resolved"/);
});
test('ambiguous source remains highlighted even if sourceId exists',()=>{
 assert.equal(needsAttribution({...event,sourceId:'a',confidence:'ambiguous'}),true);
 const html=render([{...event,sourceId:'a',confidence:'ambiguous'}]);
 assert.match(html,/cc-correction-needs-attribution/);
});
test('normal attributed event stays neutral',()=>{
 const html=render([{...event,sourceId:'a',confidence:'confirmed'}]);
 assert.doesNotMatch(html,/cc-correction-needs-attribution/);
});
