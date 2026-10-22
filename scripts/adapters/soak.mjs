import {number,uid,log} from '../core/utils.mjs';
export function soakAPI(){return game.modules?.get('armor-soak-pool')?.active?game.modules.get('armor-soak-pool').api:null}
export const soakAvailable=()=>!!soakAPI();
// Hook payload shape verified against armor-soak-pool/scripts/api.js (v1.1.1).
export function installSoakHooks(onEvent){
 const attached=(type,transform)=>Hooks.on(type,(actor,data,old,details={})=>{
  try{const event=transform(actor,data,old,details);if(event)onEvent(actor,event)}catch(e){console.warn('Combat Chronicle | Soak hook error:',e)}
 });
 attached('armorSoakPool.damageApplied',(actor,data,old,d)=>{
  const absorbed=number(d?.absorbed);if(absorbed<=0)return null;
  return {type:'soak',resource:'soak',amount:absorbed,delta:-absorbed,confidence:'unattributed',
   evidence:{integration:'armor-soak-pool',old:old?.current,new:data?.current,overflow:number(d?.overflow),reason:d?.reason||'damage'}};
 });
 attached('armorSoakPool.refilled',(actor,data,old,info)=>{
  const amount=Math.max(0,number(data?.current)-number(old?.current));if(!amount)return null;
  return {type:'refill',resource:'soak',amount,confidence:'confirmed',sourceName:'System',
   evidence:{integration:'armor-soak-pool',automatic:!!info?.automatic,old:old?.current,new:data?.current}};
 });
 attached('armorSoakPool.adjusted',(actor,data,old,info)=>{
  const delta=number(data?.current)-number(old?.current);if(!delta)return null;
  return {type:delta<0?'adjustment':'refill',resource:'soak',amount:Math.abs(delta),delta,confidence:delta<0?'unattributed':'confirmed',
   evidence:{integration:'armor-soak-pool',reason:info?.reason||'manual',old:old?.current,new:data?.current}};
 });
 attached('armorSoakPool.calculated',(actor,data,old)=>{
  const delta=number(data?.current)-number(old?.current);if(!delta)return null;
  return {type:'capacity',resource:'soak',amount:Math.abs(delta),delta,confidence:'confirmed',evidence:{integration:'armor-soak-pool',reason:'recalculation'}};
 });
}
