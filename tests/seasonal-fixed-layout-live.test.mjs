import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('public');
const output=process.env.LAYOUT_ARTIFACT_ROOT||'/tmp/sakku-fixed-layout';
await mkdir(output,{recursive:true});
const layout=JSON.parse(await readFile(resolve(root,'seasonal-assets/poc-v3/layout.json'),'utf8'));
const previous=JSON.parse(await readFile(resolve(root,'seasonal-assets/poc-v2/layout.json'),'utf8'));
const gallery=JSON.parse(await readFile(resolve(root,'seasonal-assets/poc-v3/gallery.json'),'utf8'));
assert.deepEqual(layout.entries.map(({id,x,y})=>({id,x,y})),previous.entries.map(({id,x,y})=>({id,x,y})));
assert.equal(Object.keys(layout.sources).length,72);
for(const entry of layout.entries){assert.equal(entry.sourceId,entry.id);assert.equal(entry.placeholder,false);assert.equal(layout.sources[entry.id].path,gallery.entries.find(row=>row.id===entry.id).image.split('?')[0]);}
assert.deepEqual(layout.entries.map(x=>x.id),Array.from({length:72},(_,i)=>`kou-${String(i+1).padStart(2,'0')}`));
for(const source of Object.values(layout.sources)){const data=await readFile(resolve(root,'seasonal-assets/poc-v3',source.path));assert.equal(createHash('sha256').update(data).digest('hex'),source.sha256);}
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.json':'application/json','.png':'image/png'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
const page=await browser.newPage({viewport:{width:1100,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/seasonal-assets/revision-review.html#filled-preview`);
await page.waitForSelector('#filled-circle[data-ready="true"]',{timeout:60000});
assert.equal(await page.locator('#filled-circle [data-kou-id]').count(),72);
assert.equal(await page.locator('#filled-circle image').count(),72);

assert.equal(await page.locator('#filled-circle clipPath').count(),0);
assert.equal(await page.locator('#filled-circle line, #filled-circle circle, #filled-circle text').count(),0);
const sizes=await page.locator('#filled-circle image').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('width')));assert.equal(new Set(sizes).size,1);
const positions=await page.locator('#filled-circle image').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.kouId,x:Number(n.dataset.centerX),y:Number(n.dataset.centerY)})));
assert.deepEqual(positions,layout.entries.map(({id,x,y})=>({id,x,y})));
await page.reload();await page.waitForSelector('#filled-circle[data-ready="true"]');
assert.deepEqual(await page.locator('#filled-circle image').evaluateAll(nodes=>nodes.map(n=>({id:n.dataset.kouId,x:Number(n.dataset.centerX),y:Number(n.dataset.centerY)}))),positions);
const result=await page.locator('#filled-circle').evaluate(async svg=>{
 const nodes=[...svg.querySelectorAll('image')],canvas=document.createElement('canvas');canvas.width=700;canvas.height=700;const ctx=canvas.getContext('2d',{willReadFrequently:true}),occupied=new Uint8Array(490000);let overlap=0,outside=0;
 for(const node of nodes){const image=new Image();image.src=node.getAttribute('href');await image.decode();ctx.clearRect(0,0,700,700);ctx.drawImage(image,...['x','y','width','height'].map(k=>Number(node.getAttribute(k))));const data=ctx.getImageData(0,0,700,700).data;
 for(let p=0;p<occupied.length;p++)if(data[p*4+3]){if(occupied[p])overlap++;occupied[p]=1;if(Math.hypot(p%700+.5-350,Math.floor(p/700)+.5-350)>285)outside++;}}
 return {overlap,outside};});
assert.deepEqual(result,{overlap:0,outside:0});
await page.locator('#filled-circle').screenshot({path:output+'/desktop.png'});
await page.setViewportSize({width:320,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.locator('#filled-circle').screenshot({path:output+'/mobile.png'});
assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,...result}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
