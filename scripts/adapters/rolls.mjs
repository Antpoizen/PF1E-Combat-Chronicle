/** Conservative extraction from the documented PF1e save and attack hooks. */
const finite=x=>typeof x==='number'&&Number.isFinite(x)?x:null;
function rollOf(result){let r=result?.rolls?.[0]??result?.roll;if(typeof r==='string'){try{r=JSON.parse(r)}catch{return null}}return r??null;}
export function naturalD20(result){
 const roll=rollOf(result),values=[];
 for(const term of roll?.terms||[])if(Number(term.faces)===20&&Array.isArray(term.results))
  for(const die of term.results)if(die.active!==false&&Number.isFinite(Number(die.result)))values.push(Number(die.result));
 return values.length===1?values[0]:null;
}
export function criticalOutcomeFromRoll(result){return naturalD20(result)===20?{natural:20}:null}
export function saveOutcomeFromRoll(result,save){
 if(!['fort','ref','will'].includes(save))return null;
 const pf1=result?.flags?.pf1||result?.data?.flags?.pf1||{};
 const dc=[result?.dc,result?.options?.dc,pf1.dc,pf1.subject?.dc,pf1.context?.dc].map(finite).find(x=>x!==null);
 const total=[finite(rollOf(result)?.total),finite(result?.total)].find(x=>x!==null);
 if(dc===undefined||total===undefined)return null;
 const natural=naturalD20(result);
 return {failed:natural===1?true:natural===20?false:total<dc,dc,total,natural};
}
