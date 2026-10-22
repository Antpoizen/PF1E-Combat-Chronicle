export const MOD = 'combat-chronicle';
export const clone = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));
export const number = x => Number.isFinite(Number(x)) ? Number(x) : 0;
export const esc = s => String(s??'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const get = (object,path) => path.split('.').reduce((o,k) => o?.[k],object);
export const now = () => new Date().toISOString();
export function dateKey(timestamp,timezone='America/Denver') {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp));
  const pick=t=>parts.find(p=>p.type===t)?.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}
export const csv = rows => rows.map(row=>row.map(v=>{const s=String(v??'');const safe=typeof v==='number'?s:/^[=+@\-\t\r\n]/.test(s)?`'${s}`:s;return '"'+safe.replaceAll('"','""')+'"'}).join(',')).join('\r\n');
export const setting=(name,fallback)=>{try{return game.settings.get(MOD,name)}catch{return fallback}};
export const log=(...args)=>{if(setting('debug',false))console.debug('Combat Chronicle |',...args)};
export const warn=(...args)=>console.warn('Combat Chronicle |',...args);
export const activeGM=()=>game.users?.filter(u=>u.active&&u.isGM).sort((a,b)=>a.id.localeCompare(b.id))[0]||null;
export const authority=()=>Boolean(game.user?.isGM && activeGM()?.id===game.user.id);
export const combatStarted=c=>Boolean(c && (c.started || Number(c.round)>0));
export const participantsOf=combat=>Object.fromEntries(Array.from(combat?.combatants||[],c=>[c.id,{
  id:c.id,actorId:c.actorId??c.actor?.id??null, actorUuid:c.actor?.uuid||null,
  tokenId:c.tokenId||null,tokenUuid:c.token?.uuid||null,name:c.name||c.actor?.name||'Unknown',
  img:c.img||c.token?.texture?.src||c.actor?.img||'',hidden:!!c.hidden,
  ally:!!(c.actor?.hasPlayerOwner || c.token?.disposition===1 || c.token?.disposition===1),
  player:!!c.actor?.hasPlayerOwner,actorType:c.actor?.type||null,
  pc:!!(c.actor?.hasPlayerOwner && c.actor?.type==='character'),controllerId:null
}]));
export function selectTarget(combat,actor){
  if(!combat||!actor)return null;
  const matches=Array.from(combat.combatants||[]).filter(c=>c.actor?.uuid===actor.uuid || (c.actorId===actor.id && !actor.isToken));
  return matches.length===1?matches[0]:null;
}
