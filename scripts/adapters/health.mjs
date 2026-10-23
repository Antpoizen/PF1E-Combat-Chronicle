import {get,number,setting} from '../core/utils.mjs';
// Mapping is based on observed PF1e actor attributes; world setting enables verified overrides.
export const PATHS={
 hp:['system.attributes.hp.value'],vigor:['system.attributes.vigor.value'],wounds:['system.attributes.wounds.value'],
 tempHp:['system.attributes.hp.temp'],tempVigor:['system.attributes.vigor.temp'],
 nonlethal:['system.attributes.hp.nonlethal'],
};
export const RESOURCES=['hp','vigor','wounds','tempHp','tempVigor','nonlethal'];
export function mappings(){let configured={};try{configured=JSON.parse(setting('healthPaths','{}'))}catch{}
 return Object.fromEntries(Object.entries(PATHS).map(([k,v])=>[k,typeof configured[k]==='string'&&configured[k]? [configured[k]]:v]));}
export function readHealth(actor){const state={};for(const [name,paths] of Object.entries(mappings())){
  for(const path of paths){const value=get(actor,path);if(typeof value==='number'&&Number.isFinite(value)){state[name]=value;break;}}
 }
 const constitution=['system.abilities.con.total','system.abilities.con.value','system.abilities.con.score']
  .map(path=>get(actor,path)).find(value=>typeof value==='number'&&Number.isFinite(value)&&value>0);
 if(constitution!==undefined)state.constitution=constitution;
 const soak=actor?.flags?.['armor-soak-pool']?.current;if(typeof soak==='number')state.soak=soak;
 return state;
}
export function changesBetween(before,after){const out=[];for(const resource of RESOURCES){
 const a=before?.[resource],b=after?.[resource];if(!Number.isFinite(a)||!Number.isFinite(b)||a===b)continue;
 const delta=b-a;let type=delta<0?'damage':'healing';
 if(resource==='nonlethal')type=delta>0?'damage':'healing';
 out.push({type,resource,amount:Math.abs(delta),delta,before:a,after:b});
 }return out;}
export function resourceHealthMode(snapshot){return Number.isFinite(snapshot?.vigor)&&Number.isFinite(snapshot?.wounds)?'wv':'hp';}
export function resourceDamage(event,includeTemporary=false){if(event.type!=='damage')return 0;
 return ['hp','vigor','wounds'].includes(event.resource)||includeTemporary&&['tempHp','tempVigor'].includes(event.resource)?number(event.amount):0;
}
export function watchHealth(actor, before){return changesBetween(before,readHealth(actor));}

/** User's Wounds/Vigor thresholds; no death guess when Constitution is unknown. */
export function playerWoundState(state,pc=false){
 if(!pc||!Number.isFinite(state?.vigor)||!Number.isFinite(state?.wounds))return {down:false,dead:false};
 const con=state.constitution;
 const dead=Number.isFinite(con)&&con>0&&state.wounds<=-con;
 return {down:(state.vigor<=0&&state.wounds<0)||dead,dead};
}
