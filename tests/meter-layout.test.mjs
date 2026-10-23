import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
globalThis.foundry={applications:{api:{ApplicationV2:class{constructor(){}}}}};
const longName='An Extremely Long Character Name That Must Never Be Covered By The Damage Bar';
const encounter={id:'enc',combatId:'c',name:'Combat Encounter',round:2,participants:{a:{id:'a',name:longName,ally:true,img:'hero-portrait.png'}},events:[
 {id:'hit',type:'damage',resource:'hp',amount:17,sourceId:'a',targetId:'enemy',round:1},
 {id:'soak',type:'soak',resource:'soak',amount:8,sourceId:'a',targetId:'enemy',round:1}
]};
globalThis.game={user:{isGM:true},combats:{active:{id:'c'}},settings:{get:(mod,key)=>key==='groupSummons'?true:false},combatChronicle:{recorder:{records:new Map([['c',enc]])}}};
const {LiveMeter}=await import('../scripts/ui/windows.mjs');
test('live meter preserves full long name and renders bar below the header button',async()=>{
 const html=await new LiveMeter().html();
 const row=html.slice(html.indexOf('<div class="cc-meter-row">'));
 const headEnd=row.indexOf('</button>');
 const bar=row.indexOf('<div class="cc-bars">');
 assert.ok(headEnd>0 && bar>headEnd);
 assert.match(row,/class="cc-name-text"/);
 assert.ok(row.includes(longName));
 assert.ok(row.includes('hero-portrait.png'));
 assert.match(row,/25/); // 17 health + 8 soak = 25 pressure
});
test('CSS uses a larger portrait, wrapped names, isolated bar row',async()=>{
 const css=await readFile(new URL('../styles/chronicle.css',import.meta.url),'utf8');
 assert.match(css,/\.cc-avatar\s*\{[\s\S]*?width:40px;/);
 assert.match(css,/\.cc-name-text\s*\{[\s\S]*?white-space:normal;/);
 assert.match(css,/\.cc-meter-row\s*\{[\s\S]*?flex-direction:column;/);
 assert.match(css,/\.cc-bars\s*\{[\s\S]*?order:1;/);
});
