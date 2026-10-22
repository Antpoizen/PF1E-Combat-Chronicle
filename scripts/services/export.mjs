import {esc,csv,dateKey} from '../core/utils.mjs';
import {statistics,dailyAggregate} from '../analytics/model.mjs';
import {playerProjection} from './privacy.mjs';
export function reportText(record,sections=['overview','damage','healing','awards']){
 // NEVER derive a shareable report from unsanitized GM records.
 const safe=record?.participants && record?.events ? playerProjection(record) : record;
 const stats=Object.values(safe.stats||{}).sort((a,b)=>b.pressure-a.pressure);
 const out=[`# ${safe.name||'Encounter Report'}`,`Recorded: ${safe.start||''}`];
 if(sections.includes('overview'))out.push(`Round ${safe.round||0}; ${stats.length} visible allied combatants.`);
 if(sections.includes('damage'))out.push('## Damage Spotlight',...stats.map(s=>`- ${s.name}: ${s.effective} effective; ${s.pressure} pressure; ${s.soak} soak`));
 if(sections.includes('healing'))out.push('## Healing',...stats.filter(s=>s.healing>0).map(s=>`- ${s.name}: ${s.healing} effective healing`));
 if(sections.includes('awards'))out.push('## Approved Awards',...(safe.awards||[]).map(a=>`- ${a.title}: ${safe.participants?.[a.combatantId]?.name||'Ally'}`));
 return out.join('\n\n');
}
export function csvStats(record){const stats=Object.values(statistics(record)).filter(p=>p.id!=='_unattributed');return csv([['Combatant','Effective','Total Pressure','Soak Dealt','Vigor','Wounds','HP','Healing','Received','Soak Taken','Crits'],...stats.map(p=>[p.name,p.effective,p.pressure,p.soak,p.vigor,p.wounds,p.hp,p.healing,p.received,p.soakTaken,p.crits])]);}
export function csvEvents(record){return csv([['Event ID','Time','Round','Type','Source','Target','Resource','Amount','Confidence'],...(record.events||[]).map(e=>[e.id,e.time,e.round,e.type,e.sourceName,e.targetName,e.resource,e.amount,e.confidence])]);}
export function download(name,content,mime='text/plain'){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}
