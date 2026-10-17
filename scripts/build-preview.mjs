import {mkdir,copyFile,readFile,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {build} from 'vite';
const source=resolve('public'),target=resolve('.preview-public');
await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
async function copy(path){const destination=resolve(target,path);if(!destination.startsWith(target+'/'))throw Error('Invalid public asset path');await mkdir(resolve(destination,'..'),{recursive:true});await copyFile(resolve(source,path),destination);}
for(const path of ['archive.js','favicon.svg','seasonal-assets/current.json'])await copy(path);
await copyFile(resolve('preview/screen.js'),resolve(target,'screen.js'));
const pointer=JSON.parse(await readFile(resolve(source,'seasonal-assets/current.json'),'utf8'));
if(!/^releases\/[a-z0-9-]+\/manifest.json$/.test(pointer.manifest))throw Error('Invalid release manifest path');
const manifestPath='seasonal-assets/'+pointer.manifest;
await copy(manifestPath);
const manifest=JSON.parse(await readFile(resolve(source,manifestPath),'utf8'));
for(const asset of manifest.assets)for(const kind of ['initial','completed','transition','idle']){
 const path=asset[kind];if(typeof path!=='string'||!/^kou-\d{2}\/[a-z0-9.-]+$/.test(path))throw Error('Invalid release asset path');
 await copy(relative(source,resolve(source,manifestPath,'..',path)));
}
await build({configFile:resolve('vite.preview.config.ts')});
