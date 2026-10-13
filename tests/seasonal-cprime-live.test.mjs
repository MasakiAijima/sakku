import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from '/Users/aijimamasaki/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=resolve('public/seasonal-assets');const out=resolve('output/seasonal-assets/color-study-cprime72/review/browser');await mkdir(out,{recursive:true});
const original=JSON.parse(await readFile(root+'/color-study-c72/layout.json','utf8'));const prime=JSON.parse(await readFile(root+'/color-study-cprime72/layout.json','utf8'));
assert.deepEqual(prime.entries,original.entries);assert.equal(prime.commonVisibleLongEdge,original.commonVisibleLongEdge);
for(const [id,source]of Object.entries(original.sources))for(const field of ['canvas','visibleBounds','visibleCenter','visibleLongEdge'])assert.deepEqual(prime.sources[id][field],source[field]);
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8789/seasonal-assets/cprime-gallery.html');await page.waitForSelector('.card');assert.equal(await page.locator('.card').count(),72);
const sizes=await page.locator('.card img').evaluateAll(async ims=>{ims.forEach(im=>im.loading='eager');await Promise.all(ims.map(im=>im.decode()));return ims.map(im=>[im.naturalWidth,im.naturalHeight])});assert.ok(sizes.every(([w,h])=>w===512&&h===512));
await page.screenshot({path:out+'/gallery-desktop.png'});for(const season of ['春','夏','秋','冬']){await page.getByRole('button',{name:season,exact:true}).click();assert.equal(await page.locator('.card').count(),18)}
await page.getByRole('button',{name:'すべて',exact:true}).click();await page.getByRole('button',{name:'並べて比較',exact:true}).click();assert.equal(await page.locator('.card img').count(),144);
await page.locator('#search').fill('楓蔦黄ばむ');assert.equal(await page.locator('.card').count(),1);await page.locator('.art').click();assert.equal(await page.locator('dialog').isVisible(),true);assert.equal(await page.locator('dialog img').count(),2);await page.keyboard.press('Escape');await page.locator('#search').fill('');
await page.setViewportSize({width:320,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/gallery-mobile.png'});
await page.goto('http://127.0.0.1:8789/seasonal-assets/cprime-fixed.html');await page.waitForSelector('#fixed72[data-ready=true]');assert.equal(await page.locator('#fixed72 image').count(),72);
const rects=()=>page.locator('#fixed72 image').evaluateAll(ims=>ims.map(im=>['x','y','width','height'].map(key=>im.getAttribute(key))));const before=await rects();await page.screenshot({path:out+'/fixed-mobile.png'});
await page.locator('#toggle').click();await page.waitForSelector('#fixed72[data-variant="C"]');assert.deepEqual(await rects(),before);await page.locator('#toggle').click();await page.waitForSelector('#fixed72[data-variant="C′"]');assert.deepEqual(await rects(),before);
await page.route('**/color-study-c72/layout.json',async route=>{await new Promise(r=>setTimeout(r,250));await route.continue()});
await page.locator('#toggle').click();await page.locator('#toggle').click();await new Promise(r=>setTimeout(r,700));assert.equal(await page.locator('#fixed72').getAttribute('data-variant'),'C′');assert.ok((await page.locator('#fixed72 image').first().getAttribute('href')).includes('color-study-cprime72/'));assert.deepEqual(await rects(),before);
await page.setViewportSize({width:1100,height:900});await page.screenshot({path:out+'/fixed-desktop.png'});assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,images:72,comparisonImages:144,filters:true,search:true,modal:true,mobile:true,frameTransformsUnchanged:true,rapidToggle:true}));
}finally{await browser.close()}
