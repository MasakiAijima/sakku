import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=resolve('public');
const output=process.env.GALLERY_ARTIFACT_ROOT||'/tmp/sakku-seasonal-gallery';
await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(root,'seasonal-assets/poc-v3/gallery.json'),'utf8'));
assert.equal(manifest.entries.length,72);
assert.ok(manifest.entries.every(row=>row.status==='succeeded'&&row.image));
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/seasonal-assets/gallery.html`);
 await page.waitForSelector('.card');
 assert.equal(await page.locator('.card').count(),72);
 assert.match(await page.locator('#summary').textContent(),/生成済み 72 \/ 72候/);
 const decoded=await page.locator('.art-button img').evaluateAll(async images=>{for(const image of images)image.loading='eager';await Promise.all(images.map(image=>image.decode()));return images.map(image=>[image.naturalWidth,image.naturalHeight]);});
 assert.ok(decoded.every(([width,height])=>width===512&&height===512));
 await page.screenshot({path:output+'/desktop.png'});
 for(const season of ['春','夏','秋','冬']){await page.getByRole('button',{name:season,exact:true}).click();assert.equal(await page.locator('.card').count(),18);}
 await page.getByRole('button',{name:'すべて',exact:true}).click();
 await page.locator('#search').fill('楓蔦黄ばむ');assert.equal(await page.locator('.card').count(),1);
 assert.match(await page.locator('.color-reason').first().textContent(),/黄/);
 await page.locator('.art-button').click();assert.equal(await page.locator('#detail-dialog').isVisible(),true);
 assert.equal(await page.locator('#detail-title').textContent(),'楓蔦黄ばむ');
 const href=await page.locator('.download').getAttribute('href');assert.match(href,/kou-54\/full\.png$/);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#detail-dialog').isVisible(),false);
 await page.locator('#search').fill('');await page.locator('.art-button').first().click();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#detail-title').textContent(),manifest.entries[1].name);await page.keyboard.press('Escape');
 await page.setViewportSize({width:320,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:output+'/mobile.png'});
 await page.locator('.art-button').first().click();assert.equal(await page.locator('#detail-dialog').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:output+'/mobile-detail.png'});
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,generated:72,seasonFilters:true,search:true,modal:true,keyboard:true,mobile:true}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
