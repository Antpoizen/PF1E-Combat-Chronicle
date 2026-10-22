import {copyFile,mkdir,readFile,rm,writeFile,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
export const MODULE_ID='combat-chronicle';
export const ASSET_NAME='combat-chronicle.zip';
export function releaseManifest(m,repo,tag){
 if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo||'')||repo.includes('..'))throw Error('Invalid repository');
 if(!/^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(tag||''))throw Error('Invalid tag');
 if(m.id!==MODULE_ID||m.version!==tag.slice(1))throw Error('Tag and module version mismatch');
 const root='https://github.com/'+repo;
 return {...m,url:root,version:tag.slice(1),manifest:root+'/releases/latest/download/module.json',download:root+'/releases/download/'+encodeURIComponent(tag)+'/'+ASSET_NAME};
}
export async function prepareRelease({repository,tag,root=process.cwd(),out=join(root,'dist')}){
 root=resolve(root);out=resolve(out);if(root===out)throw Error('Invalid output directory');
 const m=JSON.parse(await readFile(join(root,'module.json'),'utf8'));
 const release=releaseManifest(m,repository,tag),stage=join(out,'stage');
 await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
 for(const n of ['scripts','styles','lang'])await cp(join(root,n),join(stage,n),{recursive:true});
 for(const n of ['README.md','LICENSE'])await copyFile(join(root,n),join(stage,n));
 const data=JSON.stringify(release,null,2)+'\n';
 await writeFile(join(stage,'module.json'),data);await writeFile(join(out,'module.json'),data);
 return {manifest:release,stage,out};
}
function arg(n){const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1]}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 prepareRelease({repository:arg('--repo')||process.env.GITHUB_REPOSITORY,tag:arg('--tag')||process.env.GITHUB_REF_NAME})
  .then(({manifest})=>process.stdout.write('Prepared '+manifest.url+' version '+manifest.version+'\n'))
  .catch(e=>{console.error(e);process.exitCode=1});
}
