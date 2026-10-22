import {MOD,clone,now,dateKey,setting,uid,log,warn} from './utils.mjs';
const CHUNK_SIZE=75;const cache=new Map();let folderId=null;
async function archiveFolder(){
 if(folderId&&game.folders.get(folderId))return folderId;
 let folder=game.folders.find(f=>f.type==='JournalEntry'&&f.name==='Combat Chronicle — GM Private');
 if(!folder)folder=await Folder.create({name:'Combat Chronicle — GM Private',type:'JournalEntry',sorting:'a'});
 folderId=folder.id;return folderId;
}
export async function listIndexes(){if(!game.user.isGM)return [];
 return game.journal.filter(j=>j.getFlag(MOD,'index')?.schema===2).map(j=>({...j.getFlag(MOD,'index'),id:j.id})).sort((a,b)=>String(b.start).localeCompare(String(a.start)));}
export async function createRecord(combat,participants){
 if(!game.user.isGM)throw Error('Only the GM may create private records');
 const start=now(),tz=setting('timezone','America/Denver');
 const record={schema:2,id:null,combatId:combat.id,sceneId:combat.scene?.id||null,name:combat.name||'Combat Encounter',start,end:null,status:'active',round:combat.round||0,turn:combat.turn||0,
 timezone:tz,day:dateKey(start,tz),participants,awards:[],report:{sections:['overview','damage','healing','awards'],published:false,notes:''},
 privacy:{hideEnemyNames:true,hideEnemyNumbers:true},events:[]};
 const j=await JournalEntry.create({name:`Chronicle | ${record.name} | ${record.day}`,folder:await archiveFolder(),ownership:{default:0},flags:{[MOD]:{index:{schema:2,combatId:record.combatId,name:record.name,start:record.start,status:record.status,day:record.day}}}});
 record.id=j.id;await j.setFlag(MOD,'meta',metadata(record));cache.set(j.id,record);return record;
}
const metadata=rec=>{const {events,...rest}=rec;return clone(rest)};
export async function loadRecord(id){if(!game.user.isGM)return null;if(cache.has(id))return cache.get(id);
 const j=game.journal.get(id);if(!j)return null;const meta=j.getFlag(MOD,'meta');if(meta?.schema!==2)return null;
 const pages=Array.from(j.pages).filter(p=>Number.isInteger(p.getFlag(MOD,'chunk'))).sort((a,b)=>a.getFlag(MOD,'chunk')-b.getFlag(MOD,'chunk'));
 const events=pages.flatMap(p=>clone(p.getFlag(MOD,'events')||[]));const record={...clone(meta),events};cache.set(id,record);return record;}
export async function findByCombat(combatId){for(const r of cache.values())if(r.combatId===combatId&&r.status==='active')return r;
 const item=(await listIndexes()).find(i=>i.combatId===combatId&&i.status==='active');return item?await loadRecord(item.id):null;}
export async function saveMetadata(record){if(!game.user.isGM)throw Error('GM only');const j=game.journal.get(record.id);if(!j)throw Error('Missing Journal archive entry');
 await j.update({[`flags.${MOD}.meta`]:metadata(record),[`flags.${MOD}.index`]:{schema:2,combatId:record.combatId,name:record.name,start:record.start,end:record.end,status:record.status,day:record.day}},{diff:false});cache.set(record.id,record);}
export async function appendEvents(record,newEvents=[]){if(!game.user.isGM)throw Error('GM only');const j=game.journal.get(record.id);if(!j)throw Error('Missing private archive');
 const known=new Set(record.events.map(e=>e.eventKey||e.id));const unique=newEvents.filter(e=>!known.has(e.eventKey||e.id)&&known.add(e.eventKey||e.id));if(!unique.length)return 0;
 const pages=Array.from(j.pages).filter(p=>Number.isInteger(p.getFlag(MOD,'chunk'))).sort((a,b)=>a.getFlag(MOD,'chunk')-b.getFlag(MOD,'chunk'));
 let chunk=pages.at(-1),list=chunk?clone(chunk.getFlag(MOD,'events')||[]):[],sequence=chunk?chunk.getFlag(MOD,'chunk'):0;
 const flush=async()=>{
   if(chunk)await chunk.update({[`flags.${MOD}.events`]:list},{diff:false});
   else await j.createEmbeddedDocuments('JournalEntryPage',[{name:`Events ${String(sequence).padStart(4,'0')}`,type:'text',text:{format:1,content:'Private Combat Chronicle event data; do not share.'},ownership:{default:0},flags:{[MOD]:{chunk:sequence,events:list}}}]);
 };
 for(const e of unique){
   if(list.length>=CHUNK_SIZE){await flush();chunk=null;list=[];sequence++;}
   list.push(clone(e));record.events.push(e);
 }
 await flush();
 cache.set(record.id,record);return unique.length;
}
export function invalidateRecord(id){cache.delete(id)}
export function clearCache(){cache.clear()}
