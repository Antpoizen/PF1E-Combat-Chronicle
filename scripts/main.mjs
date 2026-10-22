import {MOD,authority,setting,warn,combatStarted} from './core/utils.mjs';
import {registerSettings} from './core/settings.mjs';
import {ChronicleRecorder} from './core/recorder.mjs';
import {openMeter,openDashboard,refreshWindows} from './ui/windows.mjs';
import {soakAvailable} from './adapters/soak.mjs';
import {nevelaStatus} from './adapters/nevela.mjs';
let recorder;
function addControl(html){
 const root=html?.querySelector?.('.combat-tracker')||html?.querySelector?.('section, .directory-header')||html;
 if(!root?.querySelector||root.querySelector('.cc-reopen'))return;
 const bar=document.createElement('div');bar.className='cc-reopen';
 const m=document.createElement('button');m.type='button';m.title='Open Combat Chronicle live meter';m.innerHTML='<i class="fas fa-chart-bar"></i> Meter';m.addEventListener('click',()=>openMeter());
 const a=document.createElement('button');a.type='button';a.title='Open Combat Chronicle analytics';a.innerHTML='<i class="fas fa-book-open"></i> Chronicle';a.addEventListener('click',()=>openDashboard());
 bar.append(m,a);root.prepend(bar);
}
Hooks.once('init',()=>registerSettings());
Hooks.once('ready',async()=>{
 if(game.system.id!=='pf1'){console.warn('Combat Chronicle is designed for Pathfinder 1e (pf1)');return;}
 recorder=new ChronicleRecorder();
 game.combatChronicle={recorder,openMeter,openDashboard,version:'0.2.1',
  status:()=>({authority:authority(),soak:soakAvailable(),nevela:nevelaStatus(),activeCombats:recorder.records.size}),
  // Explicit provenance helper for cooperating custom macros: supply these options on actor.update().
  attributionOptions:(combatantId,itemName='',messageId=null)=>({combatChronicle:{sourceId:combatantId,itemName,messageId}})
 };
 recorder.onRefresh=refreshWindows;
 recorder.install();
 Hooks.on('renderCombatTracker',(app,html)=>addControl(html instanceof HTMLElement?html:html?.[0]));
 Hooks.on('getSceneControlButtons',groups=>{
  // V13 custom token control for quick access; combat tracker buttons remain the fallback.
  const tokenGroup=Array.isArray(groups)?groups.find(g=>g.name==='tokens'||g.name==='token'):groups?.tokens||groups?.token;
  if(!tokenGroup)return;
  const control={name:'combat-chronicle',title:'Combat Chronicle',icon:'fas fa-chart-bar',button:true,onClick:()=>openDashboard()};
  if(Array.isArray(tokenGroup.tools)){if(!tokenGroup.tools.some(t=>t.name===control.name))tokenGroup.tools.push(control)}
  else if(tokenGroup.tools&&!tokenGroup.tools[control.name])tokenGroup.tools[control.name]=control;
 });
 if(authority())recorder.enqueue(()=>recorder.resume());
 const active=game.combats?.active;
 if(active&&combatStarted(active)){
  if(setting('autoOpen',true)&&setting('lastCombatOpened','')!==active.id)recorder.onCombatStartedUI(active);
  if(!game.user.isGM)game.socket.emit(`module.${MOD}`,{kind:'request'});
 }
 console.info(`Combat Chronicle 0.2.1 | GM recorder ${authority()?'active':'passive'}; armor soak ${soakAvailable()?'present':'not detected'}`);
});
