import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {releaseManifest,prepareRelease} from '../tools/prepare-release.mjs';
test('release manifest supports Foundry install URL',()=>{
 const m=releaseManifest({id:'combat-chronicle',version:'0.2.7'},'Antpoizen/PF1E-Combat-Chronicle','v0.2.7');
 assert.equal(m.manifest,'https://github.com/Antpoizen/PF1E-Combat-Chronicle/releases/latest/download/module.json');
 assert.equal(m.download,'https://github.com/Antpoizen/PF1E-Combat-Chronicle/releases/download/v0.2.7/combat-chronicle.zip');
});
test('wrong version and invalid repos are rejected',()=>{
 assert.throws(()=>releaseManifest({id:'combat-chronicle',version:'0.2.0'},'Antpoizen/PF1E-Combat-Chronicle','v0.2.7'));
 assert.throws(()=>releaseManifest({id:'combat-chronicle',version:'0.2.7'},'../bad','v0.2.7'));
});
test('manifest inside staged ZIP matches release manifest',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cc-release-'));
 try{
  const r=await prepareRelease({repository:'Antpoizen/PF1E-Combat-Chronicle',tag:'v0.2.7',root:process.cwd(),out:dir});
  assert.equal(await readFile(join(r.stage,'module.json'),'utf8'),await readFile(join(r.out,'module.json'),'utf8'));
 }finally{await rm(dir,{recursive:true,force:true})}
});
