import {MOD,esc,setting,number,dateKey} from '../core/utils.mjs';
import {statistics,leaders,dailyAggregate,resolvedEvents,isAwardEligible} from '../analytics/model.mjs';
import {playerProjection} from '../services/privacy.mjs';
import {reportText,csvStats,csvEvents,download} from '../services/export.mjs';
const App=foundry.applications.api.ApplicationV2;
const fmt=n=>number(n).toLocaleString(undefined,{maximumFractionDigits:1});
const safeNumber=x=>Number.isFinite(+x)?+x:0;
const entries=o=>Object.values(o||{});
const btn=(label,action,value='',cls='')=>`<button class="${cls}" data-action="${action}" data-id="${esc(value)}">${esc(label)}</button>`;
const select=(key,value,options)=>`<select data-change="${key}">${options.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
let meterWindow=null,dashboardWindow=null;
const chronicle=()=>game.combatChronicle;
const current=()=>{const recorder=chronicle()?.recorder;const combat=game.combats?.active;
 return game.user.isGM?(combat&&recorder?.records?.get(combat.id))||null:recorder?.latest||null;};
const shown=(record)=>game.user.isGM?record?.participants&&record?.events?statistics(record,{includeTemporary:setting('includeTemporary',false),groupSummons:setting('groupSummons',true)}):{}:record?.stats||{};
const scaled=(p,scope,round,grouped)=>{
 const r=scope==='round'?p.rounds?.[String(round)]||{}:null;
 const div=scope==='dpr'?Math.max(1,round||1):1;
 return {...p,effective:(r?r.effective||0:p.effective||0)/div,soak:(r?r.soak||0:p.soak||0)/div,
 pressure:(r?r.pressure||0:p.pressure||0)/div,healing:(r?r.healing||0:p.healing||0)/div};
};
function ranked(rec,{scope='total',sort='pressure',allies=true}={}){
 const values=entries(shown(rec));const p=rec?.participants||{};
 return values.filter(row=>row.id!=='_unattributed'&&(!allies||p[row.id]?.ally)&&(!setting('groupSummons',true)||!p[row.id]?.controllerId))
 .map(row=>({...scaled(row,scope,rec?.round||0),img:p[row.id]?.img||''})).sort((a,b)=>(b[sort]||0)-(a[sort]||0));}
function meterRows(rows,sort,expanded){const max=Math.max(1,...rows.map(p=>p.pressure||0));return rows.map((p,i)=>{
 const main=Math.max(0,100*(p.effective||0)/max),soak=Math.max(0,100*(p.soak||0)/max);
 const sub=expanded.has(p.id)?`<div class="cc-expand"><div>Vigor <b>${fmt(p.vigor)}</b> · Wounds <b>${fmt(p.wounds)}</b> · HP <b>${fmt(p.hp)}</b> · Soak <b>${fmt(p.soak)}</b> · Healing <b>${fmt(p.healing)}</b> · Kills <b>${fmt(p.kills)}</b></div><div>${Object.entries(p.items||{}).map(([k,v])=>`${esc(k)}: ${fmt(v)}`).join(' • ')||'No verified item attribution recorded'}</div>${Object.values(p.minions||{}).map(m=>`<div>${esc(m.name)}: ${fmt(m.effective)} effective / ${fmt(m.pressure)} pressure</div>`).join('')}</div>`:'';
 return `<div class="cc-meter-row"><button class="cc-row-head" data-action="expand" data-id="${esc(p.id)}"><span class="cc-name">${p.img?`<img class="cc-avatar" src="${esc(p.img)}" alt="">`:``}${i+1}. ${esc(p.name)}</span><span class="cc-val">${fmt(p.effective)}</span><span class="cc-val emph">${fmt(p.pressure)}</span></button><div class="cc-bars"><span class="cc-health" style="width:${main.toFixed(2)}%"></span><span class="cc-soak" style="width:${soak.toFixed(2)}%"></span></div>${sub}</div>`;
 }).join('')||'<p class="cc-muted">No attributed allied damage yet. Check the Corrections tab for unattributed events.</p>';
}
class WindowBase extends App{
 static DEFAULT_OPTIONS={classes:['combat-chronicle'],window:{resizable:true,minimizable:true},position:{width:650,height:560}};
 async _renderHTML(){return await this.html()}
 _replaceHTML(result,content){content.replaceChildren(document.createRange().createContextualFragment(String(result)))}
 async _onRender(context,options){await super._onRender(context,options);
  this.element.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',event=>{event.preventDefault();Promise.resolve(this.action(el.dataset.action,el.dataset.id,event)).catch(e=>{console.error('Combat Chronicle',e);ui.notifications.error(`Combat Chronicle: ${e.message}`)})}));
  this.element.querySelectorAll('[data-change]').forEach(el=>el.addEventListener('change',event=>{Promise.resolve(this.change(el.dataset.change,el.value,el,event)).catch(e=>console.error('Combat Chronicle',e))}));
 }
 refresh(){if(this.rendered)this.render({force:true}).catch(console.error)}
}
export class LiveMeter extends WindowBase{
 static DEFAULT_OPTIONS={id:'combat-chronicle-live',classes:['combat-chronicle','cc-live'],window:{title:'Combat Chronicle • Live',resizable:true,minimizable:true},position:{width:470,height:470}};
 constructor(...a){super(...a);this.sort='pressure';this.scope='total';this.expanded=new Set()}
 async html(){const rec=current();if(!rec)return `<div class="cc-shell"><p>There is no active combat.</p>${btn('Open Combat Archive','dashboard')}</div>`;
 const rows=ranked(rec,{scope:this.scope,sort:this.sort});return `<div class="cc-shell cc-meter"><div class="cc-topline"><span class="cc-live-indicator">● LIVE</span><span>Round ${fmt(rec.round)} • ${esc(rec.name)}</span></div><div class="cc-toolbar">
 ${select('scope',this.scope,[['total','Encounter'],['round','Current round'],['dpr','Damage per round']])}${btn('Analytics','dashboard')}</div>
 <div class="cc-columns"><span>Combatant</span><button data-action="sort" data-id="effective">Effective ${this.sort==='effective'?'▼':''}</button><button data-action="sort" data-id="pressure">Pressure ${this.sort==='pressure'?'▼':''}</button></div>
 <div class="cc-rows">${meterRows(rows,this.sort,this.expanded)}</div><div class="cc-foot">Effective: Vigor + Wounds + HP<br>Pressure: Effective + absorbed Soak</div></div>`;}
 async _onClose(options){try{await game.settings.set(MOD,'meterPosition',JSON.stringify(this.position));}catch{}return super._onClose(options)}
 action(a,id){if(a==='sort'){this.sort=id;this.refresh()}else if(a==='expand'){this.expanded.has(id)?this.expanded.delete(id):this.expanded.add(id);this.refresh()}else if(a==='dashboard')openDashboard()}
 change(a,val){if(a==='scope'){this.scope=val;this.refresh()}}
}
// Flag missing or explicitly unresolved source attribution after GM corrections.
export const needsAttribution = event =>
 !event?.sourceId || ['ambiguous', 'unattributed'].includes(String(event.confidence || '').toLowerCase());
const TABS=['overview','combatants','charts','timeline','impact','corrections','awards','reports','archive'];
function sectionTitle(title,sub=''){return `<h2>${esc(title)}</h2>${sub?`<p class="cc-muted">${esc(sub)}</p>`:''}`}
function kpi(name,val){return `<div class="cc-kpi"><span>${esc(name)}</span><strong>${fmt(val)}</strong></div>`}
function table(headers,rows){return `<div class="cc-table-scroll"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function chart(rec){const rows=ranked(rec,{allies:false});const rounds=[...new Set(rows.flatMap(p=>Object.keys(p.rounds||{})))].sort((a,b)=>Number(a)-Number(b));if(!rounds.length)return '<p class="cc-muted">Round-by-round data will appear here as combat progresses.</p>';
 const data=rounds.map(round=>({round,effective:rows.reduce((s,p)=>s+number(p.rounds?.[round]?.effective),0),pressure:rows.reduce((s,p)=>s+number(p.rounds?.[round]?.pressure),0)}));
 const max=Math.max(1,...data.map(d=>d.pressure));const w=560,h=230,margin=35,step=(w-margin-8)/data.length;const shapes=data.map((d,i)=>{const x=margin+i*step+4,width=Math.max(4,step-9),effective=(h-55)*d.effective/max,pressure=(h-55)*d.pressure/max;return `<rect x="${x}" y="${h-32-pressure}" width="${width}" height="${pressure}" fill="#68788d"/><rect x="${x}" y="${h-32-effective}" width="${width}" height="${effective}" fill="#58a6c9"/><text x="${x+width/2}" y="${h-14}" fill="#bec9d9" text-anchor="middle" font-size="10">${esc(d.round)}</text>`}).join('');
 return `<div class="cc-graph"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Damage by round"><path d="M${margin} 8 V${h-32} H${w}" stroke="#526071" fill="none"/>${shapes}</svg><div class="cc-legend"><span>■ Effective</span><span>■ Total pressure (includes soak)</span></div></div>`;}
export class AnalyticsDashboard extends WindowBase{
 static DEFAULT_OPTIONS={id:'combat-chronicle-dashboard',classes:['combat-chronicle','cc-dashboard-window'],window:{title:'Combat Chronicle • Analytics & Archive',resizable:true,minimizable:true},position:{width:930,height:710}};
 constructor(...a){super(...a);this.tab='overview';this.selectedId=null;this.record=null;this.indices=[];this.date=dateKey(new Date().toISOString(),setting('timezone','America/Denver'));this.archiveList=[];
 this.scope='month';this.search='';this.reportSections=new Set(['overview','damage','healing','awards']);this.preview=false;this.showAll=false;}
 async _renderHTML(){if(game.user.isGM){this.indices=await chronicle().recorder.indices();const active=current();const id=this.selectedId||active?.id||this.indices[0]?.id;
 this.record=id?await chronicle().recorder.load(id):null;
 const pick=this.indices.filter(r=>dateKey(r.start,setting('timezone','America/Denver'))===this.date);this.archiveList=await Promise.all(pick.map(i=>chronicle().recorder.load(i.id)));
 }else this.record=current();return this.html()}
 html(){const tabs=TABS.filter(t=>game.user.isGM||!['corrections','timeline','archive','awards'].includes(t));
 return `<div class="cc-shell cc-dashboard"><nav class="cc-tabs">${tabs.map(t=>`<button class="${this.tab===t?'active':''}" data-action="tab" data-id="${t}">${esc(t.slice(0,1).toUpperCase()+t.slice(1))}</button>`).join('')}</nav><div class="cc-main">${this.panel()}</div></div>`}
 panel(){if(this.tab==='archive')return this.archive();const r=this.record;if(!r)return sectionTitle('No encounter yet','Start a combat to begin recording.');
 switch(this.tab){case 'overview':return this.overview(r);case 'combatants':return this.combatants(r);case 'charts':return sectionTitle('Damage by Round','Blue: effective • Gray: total pressure')+chart(r);
 case 'timeline':return this.timeline(r);case 'impact':return this.impact(r);case 'corrections':return this.corrections(r);case 'awards':return this.awards(r);case 'reports':return this.reports(r);default:return ''}}
 heading(r){return `<div class="cc-record-heading"><h2>${esc(r.name)}</h2><small>${esc(r.start)} • ${esc(r.status)} • Round ${fmt(r.round)}</small></div>`}
 overview(r){const s=entries(shown(r));const allied=s.filter(x=>r.participants?.[x.id]?.ally&&!r.participants?.[x.id]?.controllerId);const neutral=s.filter(x=>!r.participants?.[x.id]?.ally&&x.id!=='_unattributed');const sum=(rows,key)=>rows.reduce((n,x)=>n+number(x[key]),0);
 return this.heading(r)+`<div class="cc-kpis">${kpi('Allied Effective',sum(allied,'effective'))}${kpi('Allied Pressure',sum(allied,'pressure'))}${kpi('Healing',sum(allied,'healing'))}${kpi('Player Kills',sum(s.filter(x=>isAwardEligible(r.participants?.[x.id])),'kills'))}${kpi('Enemy Effective',sum(neutral,'effective'))}</div><h3>Combat performance</h3>${meterRows(ranked(r,{allies:false}), 'pressure',new Set())}${btn('Open Live Meter','meter')}<p class="cc-muted">The GM Corrections tab identifies unapportioned damage. Rankings never assume that a chat roll necessarily landed.</p>`}
 combatants(r){const ps=entries(shown(r)).filter(p=>p.id!=='_unattributed').sort((a,b)=>b.pressure-a.pressure);
 const controls=game.user.isGM;
 const people=Object.values(r.participants||{});
 return this.heading(r)+table(['Combatant','Effective','Pressure','Kills','Soak','Healed','Taken',...(controls?['Controller']:[])],ps.map(p=>[
 esc(p.name),fmt(p.effective),fmt(p.pressure),fmt(p.kills),fmt(p.soak),fmt(p.healing),fmt(p.received),
 ...(controls?[`<select data-change="controller" data-participant="${esc(p.id)}"><option value="">None</option>${people.filter(x=>x.id!==p.id&&x.ally).map(x=>`<option value="${esc(x.id)}" ${r.participants[p.id]?.controllerId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`]:[]) ]));}
 impact(r){return this.heading(r)+sectionTitle('Impact Rankings','Sortable metrics and suggested awards')+table(['Combatant','Damage','Pressure','Kills','Healing','Damage Taken','Soak Taken','Control'],entries(shown(r)).filter(p=>p.id!=='_unattributed').sort((a,b)=>b.pressure-a.pressure).map(p=>[esc(p.name),fmt(p.effective),fmt(p.pressure),fmt(p.kills),fmt(p.healing),fmt(p.received),fmt(p.soakTaken),fmt(p.control)]))}
 timeline(r){if(!game.user.isGM)return '<p>GM only.</p>';return this.heading(r)+`<div class="cc-timeline">${resolvedEvents(r.events||[]).slice(-500).reverse().map(e=>`<div class="${e.voided?'cc-voided':''}"><small>R${fmt(e.round)} • ${esc(e.time?.slice(11,19))}</small><b>${esc(e.type)}</b> ${esc(e.sourceName||'Unknown')} → ${esc(e.targetName||'')} ${esc(e.resource||'')} ${fmt(e.amount)} <em>${esc(e.confidence||'')}</em></div>`).join('')}</div>`}
 corrections(r){if(!game.user.isGM)return '';
 const all=resolvedEvents(r.events||[]).filter(e=>!e.voided&&(['damage','soak','healing','adjustment','condition'].includes(e.type)));
 const pending=all.filter(needsAttribution);
 const src=Object.values(r.participants||{});return this.heading(r)+sectionTitle('Corrections','Unattributed and uncertain events are not credited to arbitrary attackers')+
 `<p>${pending.length} events need attribution review.</p><div class="cc-correction-list">${all.slice(-150).reverse().map(e=>{const pending=needsAttribution(e);return `<div class="cc-correction${pending?' cc-correction-needs-attribution':''}" data-attribution="${pending?'pending':'resolved'}"><span>R${e.round}: ${esc(e.type)} ${fmt(e.amount)} ${esc(e.resource||'')} → ${esc(e.targetName||'Unknown')}</span>${pending?'<span class="cc-attribution-flag">Needs attribution</span>':''}<select data-source-for="${esc(e.id)}"><option value="">Choose source</option>${src.map(c=>`<option value="${esc(c.id)}" ${e.sourceId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>${btn('Assign','assign',e.id)} <input type="number" min="0" step="1" style="width:66px" data-amount-for="${esc(e.id)}" value="${fmt(e.amount)}">${btn('Set Amount','adjust',e.id)} ${btn('Void','void',e.id)}</div>`}).join('')}</div><h3>Manual Event</h3><div class="cc-manual"><label>Type ${select('manualType',this.manualType||'damage',[['damage','Damage'],['healing','Healing'],['soak','Soak']])}</label><label>Resource ${select('manualResource',this.manualResource||'hp',[['hp','HP'],['vigor','Vigor'],['wounds','Wounds'],['soak','Soak']])}</label><label>Amount <input type="number" id="cc-manual-amount" min="0" value="0"></label><label>Source <select id="cc-manual-source"><option value="">Unattributed</option>${src.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><label>Target <select id="cc-manual-target"><option value="">None</option>${src.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label>${btn('Add correction','manual')}</div>`;}
 awards(r){if(!game.user.isGM)return '';
  const candidates=leaders(r);
  const approved=(r.awards||[]).filter(a=>isAwardEligible(r.participants?.[a.combatantId]));
  return this.heading(r)+sectionTitle('Award Suggestions','Player characters only. Review the description, earning requirement, and verified result before approving.')+
  (candidates.map(a=>{
   const already=approved.some(x=>x.title===a.title && x.combatantId===a.winner.id);
   return `<div class="cc-award"><div class="cc-award-details"><h3>${esc(a.title)}</h3><p>${esc(a.description)}</p><p class="cc-award-criteria"><strong>How earned:</strong> ${esc(a.criteria)}</p><p class="cc-award-evidence"><strong>Candidate:</strong> ${esc(a.evidence)}</p></div><div class="cc-award-actions">${already?'<span class="cc-award-approved">Approved</span>':btn('Approve','award',`${a.title}|${a.winner.id}`)}</div></div>`;
  }).join('')||'<p class="cc-muted">No player characters currently meet a measurable award requirement.</p>')+
  `<h3>Approved Awards</h3>`+(approved.map(a=>`<div class="cc-approved-award"><b>${esc(a.title)}</b> — ${esc(r.participants[a.combatantId]?.name||'Player')}<p>${esc(a.evidence||a.description||'GM approved')}</p></div>`).join('')||'<p>None yet.</p>');}
 reports(r){const player=!game.user.isGM;if(player)return sectionTitle('Published Report')+`<pre>${esc(r.report||'No published report yet')}</pre>`;
 const opts=[['overview','Overview'],['damage','Damage Spotlight'],['healing','Healing Spotlight'],['awards','Awards']];const body=reportText(r,[...this.reportSections]);
 return this.heading(r)+sectionTitle('Player-Safe Report Builder','Preview and approval required; never includes private enemy data')+
 `<div class="cc-report-options">${opts.map(([id,title])=>`<label><input type="checkbox" data-change="section" value="${id}" ${this.reportSections.has(id)?'checked':''}>${esc(title)}</label>`).join('')}</div><p>${btn('Preview','preview')} ${btn('Share Chat','publish')} ${btn('Publish Journal','journal')} ${btn('Download Markdown','md')} ${btn('Export JSON (GM)','json')} ${btn('Export CSV Stats','csv')} ${btn('Export CSV Events','csvEvents')}</p>${this.preview?`<pre class="cc-preview">${esc(body)}</pre>`:''}`;}
 archive(){if(!game.user.isGM)return '<p>Archive restricted to GM.</p>';
 const [y,m]=this.date.split('-').map(Number),first=new Date(Date.UTC(y,m-1,1)).getUTCDay(),days=new Date(Date.UTC(y,m,0)).getUTCDate(),tz=setting('timezone','America/Denver');
 const counts={};for(const r of this.indices)counts[dateKey(r.start,tz)]=(counts[dateKey(r.start,tz)]||0)+1;
 const sum=dailyAggregate(this.archiveList||[]),matching=this.showAll?this.indices:this.indices.filter(i=>dateKey(i.start,tz)===this.date);
 return sectionTitle('Combat Calendar',`World-specific archive • ${tz}`)+`<div class="cc-calendar-bar">${btn('◀','prevMonth')}<b>${y}-${String(m).padStart(2,'0')}</b>${btn('▶','nextMonth')}<input type="date" data-change="date" value="${this.date}">${btn('All Encounters','all')}</div><div class="cc-calendar">${['S','M','T','W','T','F','S'].map(x=>`<span class="cc-dayname">${x}</span>`).join('')}${Array.from({length:first},()=>'<span></span>').join('')}${Array.from({length:days},(_,i)=>{const d=`${y}-${String(m).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return `<button class="${this.date===d?'selected':''}" data-action="date" data-id="${d}">${i+1}${counts[d]?`<small>${counts[d]} battles</small>`:''}</button>`}).join('')}</div><h3>${esc(this.date)} — ${sum.combats} encounters</h3><div class="cc-kpis">${kpi('Effective',sum.effective)}${kpi('Pressure',sum.pressure)}${kpi('Healing',sum.healing)}${kpi('Enemy kills',sum.kills)}${kpi('Rounds',sum.rounds)}</div><div class="cc-archive-items">${matching.map(i=>`<div>${btn(`${i.start?.slice(11,16)} • ${i.name} — ${i.status}`,'select',i.id)}</div>`).join('')||'<p>No encounters on this date.</p>'}</div>`}
 async action(a,id){const r=this.record,rec=chronicle()?.recorder;
 if(a==='tab'){this.tab=id==='cc-hidden'?'archive':id;this.refresh();return}
 if(a==='meter'){openMeter();return}
 if(a==='select'){this.selectedId=id;this.tab='overview';this.refresh();return}
 if(a==='date'){this.date=id;this.refresh();return}
 if(a==='prevMonth'||a==='nextMonth'){const [y,m]=this.date.split('-').map(Number);this.date=new Date(Date.UTC(y,m-1+(a==='prevMonth'?-1:1),1)).toISOString().slice(0,10);this.refresh();return}
 if(a==='all'){this.showAll=!this.showAll;this.refresh();return}
 if(a==='preview'){this.preview=true;this.refresh();return}
 if(!game.user.isGM||!r)return;
 if(a==='assign'){const input=this.element.querySelector(`[data-source-for="${CSS.escape(id)}"]`);const source=r.participants[input?.value];if(!source)return ui.notifications.warn('Choose a source.');await rec.modify(r.id,{event:{type:'correction',targetEvent:id,action:'replace',patch:{sourceId:source.id,sourceName:source.name,confidence:'manually-corrected'}}});this.refresh();return}
 if(a==='adjust'){const amt=Number(this.element.querySelector(`[data-amount-for="${CSS.escape(id)}"]`)?.value);if(!Number.isFinite(amt)||amt<0)return ui.notifications.warn('Enter a valid nonnegative amount.');await rec.modify(r.id,{event:{type:'correction',targetEvent:id,action:'replace',patch:{amount:amt,confidence:'manually-corrected'}}});this.refresh();return}
 if(a==='void'){await rec.modify(r.id,{event:{type:'correction',targetEvent:id,action:'void'}});this.refresh();return}
 if(a==='manual'){
  const amount=Number(this.element.querySelector('#cc-manual-amount')?.value);if(!(amount>0))return ui.notifications.warn('Provide a positive amount.');
  const sourceId=this.element.querySelector('#cc-manual-source')?.value||null,targetId=this.element.querySelector('#cc-manual-target')?.value||null;
  await rec.modify(r.id,{event:{type:this.manualType||'damage',resource:this.manualResource||'hp',amount,sourceId,targetId,sourceName:r.participants[sourceId]?.name||'Unattributed',targetName:r.participants[targetId]?.name||null,round:r.round,confidence:'manually-corrected'}});this.refresh();return;
 }
 if(a==='award'){const [title,combatantId]=id.split('|');await rec.modify(r.id,{award:{title,combatantId}});this.refresh();return}
 const filename=`combat-chronicle-${r.id}`;
 if(a==='md'){download(`${filename}.md`,reportText(r,[...this.reportSections]),'text/markdown');return}
 if(a==='json'){download(`${filename}.json`,JSON.stringify(r,null,2),'application/json');return}
 if(a==='csv'){download(`${filename}-statistics.csv`,csvStats(r),'text/csv');return}
 if(a==='csvEvents'){download(`${filename}-events.csv`,csvEvents(r),'text/csv');return}
 if(a==='publish'||a==='journal'){
  if(!this.preview)return ui.notifications.warn('Preview the sanitized report before publishing.');
  const content=reportText(r,[...this.reportSections]);
  if(a==='publish')await ChatMessage.create({content:`<div class="cc-public-report"><pre>${esc(content)}</pre></div>`,speaker:{alias:'Combat Chronicle'}});
  else await JournalEntry.create({name:`Combat Chronicle Report — ${r.name}`,ownership:{default:2},pages:[{name:'Battle Summary',type:'text',text:{format:1,content:`<pre>${esc(content)}</pre>`}}]});
  await rec.modify(r.id,{report:{published:true,publicText:content,sections:[...this.reportSections]}});this.refresh();return;
 }
 }
 async change(a,value,element){if(a==='controller'){const id=element.dataset.participant;if(!game.user.isGM||!this.record?.participants[id])return;await chronicle().recorder.modify(this.record.id,{participant:{id,controllerId:value||null}});this.refresh();return}if(a==='date'){this.date=value;this.refresh()}if(a==='scope'){this.scope=value;this.refresh()}
 if(a==='section'){element.checked?this.reportSections.add(value):this.reportSections.delete(value);this.preview=false;this.refresh()}
 if(a==='manualType'){this.manualType=value;this.refresh()}if(a==='manualResource'){this.manualResource=value;this.refresh()}}
}
export const openMeter=async()=>{if(!meterWindow){meterWindow=new LiveMeter();try{const pos=JSON.parse(setting('meterPosition','{}'));if(Number.isFinite(pos.left)&&Number.isFinite(pos.top))meterWindow.setPosition({left:pos.left,top:pos.top,width:pos.width,height:pos.height})}catch{}}return meterWindow.render({force:true})};
export const openDashboard=()=>{dashboardWindow??=new AnalyticsDashboard();return dashboardWindow.render({force:true})};
export function refreshWindows(){meterWindow?.refresh();dashboardWindow?.refresh()}
