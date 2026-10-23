/** Conservative extraction from the documented PF1e save and attack hooks. */
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
function rollOf(result){let r=result?.rolls?.[0]??result?.roll;if(typeof r==='string'){try{r=JSON.parse(r)}catch{return null}}return r??null;}
export function naturalD20(result){
 const roll=rollOf(result),values=[];
 for(const term of roll?.terms||[])if(Number(term.faces)===20&&Array.isArray(term.results))
  for(const die of term.results)if(die.active!==false&&Number.isFinite(Number(die.result)))values.push(Number(die.result));
 return values.length===1?values[0]:null;
}
export function criticalOutcomeFromRoll(result){
 const natural=naturalD20(result);
 if(natural===20)return {natural:20,reason:'natural20'};
 const pf1=result?.flags?.pf1||{},action=result?.actionSource||{},roll=result?.rolls?.[0]||result?.roll||{};
 const flags=[result?.criticalThreat,result?.isCriticalThreat,pf1.criticalThreat,pf1.critThreat,
    action.criticalThreat,action.critThreat,roll?.options?.criticalThreat];
 if(flags.some(x=>x===true))return {natural,reason:'critical-threat'};
 const flavor=String(result?.flavor||'');
 const html=String(result?.content||'');
 if(/(?:critical|crit)\s*(?:threat|confirmation|confirm)/i.test(flavor)||
    /data-action=["'](?:confirmCritical|confirm-crit|confirmCrit|criticalConfirm|rollCritConfirm)["']/i.test(html))
  return {natural,reason:'confirmation-evidence'};
 return null;
}
export function saveOutcomeFromRoll(result,save){
 if(!['fort','ref','will'].includes(save))return null;
 const pf1=result?.flags?.pf1||result?.data?.flags?.pf1||{};
 const dc=[result?.dc,result?.options?.dc,pf1.dc,pf1.subject?.dc,pf1.context?.dc].map(finite).find(x=>x!==null);
 const total=[finite(rollOf(result)?.total),finite(result?.total)].find(x=>x!==null);
 if(dc===undefined||total===undefined)return null;
 const natural=naturalD20(result);
 return {failed:natural===1?true:natural===20?false:total<dc,dc,total,natural};
}

/** Extract only verifiable item metadata; never infer an item from chat timing or loose text. */
export function itemFromMessage(message,combat=null){
 if(!message)return null;
 const cc=message.flags?.['combat-chronicle']||{},pf=message.flags?.pf1||{};
 const action=message.actionSource||pf.action||pf.context?.action||{};
 const actor=Array.from(combat?.combatants||[]).find(c=>c.actorId===message.speaker?.actor)?.actor;
 const ids=[cc.itemId,pf.itemId,pf.item?.id,action.item?.id,message.item?.id,
  pf.subject?.itemId,pf.context?.itemId,pf.itemUuid,action.itemUuid];
 for(const raw of ids)if(typeof raw==='string'){
  const item=actor?.items?.get?.(raw.split('.').at(-1));if(item?.name)return String(item.name).slice(0,160);
 }
 for(const name of [cc.itemName,action.item?.name,action.itemName,pf.item?.name,
  message.item?.name,pf.subject?.itemName,pf.context?.itemName]){
  if(typeof name==='string'&&name.trim()&&name.length<=160)return name.trim();
 }
 return null;
}
