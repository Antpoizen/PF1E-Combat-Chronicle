// NAS is observed through verified downstream PF1e Actor document changes.
// No speculative NAS hook names or damage wrappers are installed.
export function nevelaStatus(){const mod=Array.from(game.modules||[]).find(m=>m.id==='nevelas-automation-suite'||m.id==='nevelas-automation');return {active:!!mod?.active,version:mod?.version||null,mode:'read-only actor/document observation'};}
