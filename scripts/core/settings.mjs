import {MOD} from './utils.mjs';
export function registerSettings(){
 const config={
  enabled:[Boolean,true,'world','Automatically record Foundry combats'],
  autoOpen:[Boolean,true,'client','Automatically open the meter on combat start'],
  allowPlayers:[Boolean,true,'world','Allow player-facing combat meter and reports'],
  includeTemporary:[Boolean,false,'world','Include temporary HP/Vigor damage in effective damage'],
  groupSummons:[Boolean,true,'world','Group explicitly assigned summons under their owners'],
  timezone:[String,'America/Denver','world','Timezone used for the real-world combat calendar'],
  healthPaths:[String,'{}','world','Advanced: JSON object mapping resource keys to exact PF1e actor paths'],
  debug:[Boolean,false,'world','Enable debug logging'],
  lastCombatOpened:[String,'','client','Last combat which automatically opened the meter'],
  meterPosition:[String,'{}','client','Last saved meter window position'],
 };
 for(const [name,[type,value,scope,hint]] of Object.entries(config))game.settings.register(MOD,name,{
  name:name.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()),hint,scope,config:!['lastCombatOpened','meterPosition'].includes(name),type,default:value,
  ...(name==='allowPlayers'?{onChange:enabled=>{if(!enabled&&game.user?.isGM)game.socket?.emit(`module.${MOD}`,{kind:'revoke'})}}:{}),
 });
}
