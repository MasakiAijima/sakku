import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
const screenshotDir=process.env.SCREENSHOT_DIR||'output/seasonal-assets/home-review';
await mkdir(screenshotDir,{recursive:true});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/aijimamasaki/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const pointer=JSON.parse(await readFile(new URL('../data/calendar/current.json',import.meta.url)));
const calendar=JSON.parse(await readFile(new URL('../'+pointer.path,import.meta.url)));
const dates=calendar.years.find(value=>value.year===2026);
const art=JSON.parse(await readFile(new URL('../public/seasonal-assets/releases/c-v2/manifest.json',import.meta.url)));
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[],generationRequests=[];
const midnight=date=>Date.parse(date+'T00:00:00+09:00');
const instant=count=>count===0?midnight(dates.entries[0].date)-86400000:count===72?midnight(dates.nextRisshunDate):midnight(dates.entries[count-1].date);
async function open(now,{language='日本語',reducedMotion='reduce',unavailable=false}={}){
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion,extraHTTPHeaders:{'oai-authenticated-user-id':'seasonal-e2e','oai-authenticated-user-email':'fixture@example.test'}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(/\/api\/.*(?:haiku|generat)/i.test(request.url()))generationRequests.push(request.url());});
 await page.clock.install({time:new Date(now)});await page.clock.pauseAt(new Date(now+1));
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/settings')return route.fulfill({json:{settings:{name:'',style:'自由詩に近いHaiku',expression:'',appLanguage:language}}});
  if(path==='/api/records')return route.fulfill({json:{records:[]}});
  return route.continue();
 });
 await page.goto(base);
 if(unavailable)await page.waitForFunction(()=>document.querySelector('.seasonal-orbit')?.textContent.includes('暦を利用できません'));
 else await page.locator('.orbit-svg[data-ready=true]').waitFor();
 return page;
}
async function readyYear(page,year='2026'){
 await page.getByLabel('季節年',{exact:true}).selectOption(year);
 await page.waitForFunction(year=>document.querySelector('.orbit-svg[data-ready=true]')?.getAttribute('aria-label')?.includes(year),year);
}
async function countFull(page,count){await page.waitForFunction(count=>document.querySelectorAll('[data-orbit-id][data-phase=full]').length===count,count);}
try{
 let anchors;
 for(const count of [0,12,42,72]){
  const page=await open(instant(count));await readyYear(page);await countFull(page,count);
  const nodes=page.locator('[data-orbit-id]');assert.equal(await nodes.count(),72);
  assert.equal(await nodes.evaluateAll(values=>values.filter(node=>node.dataset.kind!=='upcoming').length),count);
  const geometry=await nodes.evaluateAll(values=>values.map(node=>({id:node.dataset.orbitId,anchor:node.dataset.anchor,z:node.dataset.z,images:[...node.querySelectorAll('image')].map(image=>({layer:image.dataset.layer,x:Number(image.getAttribute('x')),y:Number(image.getAttribute('y')),width:Number(image.getAttribute('width')),height:Number(image.getAttribute('height')),href:image.getAttribute('href')}))})));
  const fixed=geometry.map(({id,anchor,z,images})=>({id,anchor,z,images:images.map(({layer,x,y,width,height})=>({layer,x,y,width,height}))}));
  if(anchors)assert.deepEqual(fixed,anchors);else anchors=fixed;
  for(const [index,node]of geometry.entries()){
   const asset=art.assets[index],scale=art.layout.commonVisibleLongEdge/asset.placement.visibleLongEdge;
   assert.equal(node.id,asset.kouId);assert.equal(node.anchor,`${asset.placement.x},${asset.placement.y}`);
   assert.equal(node.images.length,2);
   for(const image of node.images){
    assert.ok(Math.abs(image.x-(asset.placement.x-asset.placement.visibleCenter[0]*scale))<1e-8);
    assert.ok(Math.abs(image.y-(asset.placement.y-asset.placement.visibleCenter[1]*scale))<1e-8);
    assert.ok(Math.abs(image.width-512*scale)<1e-8);assert.equal(image.width,image.height);
    assert.match(image.href,new RegExp(`releases/c-v2/${asset.kouId}/${image.layer==='prime'?'initial':'completed'}\\.png`));
   }
  }
  if(count>0&&count<72){const current=page.locator('[data-orbit-id][data-kind=current]');assert.equal(await current.count(),1);assert.match(await current.getAttribute('aria-label'),/いまの候/);}
  assert.equal(await page.locator('.orbit-svg circle,.orbit-svg text').count(),0);
  await page.locator('.seasonal-orbit').screenshot({path:`${screenshotDir}/home-${count}-390.png`});
  await page.close();
 }
 const page=await open(instant(42));await readyYear(page);await countFull(page,42);
 await page.locator('#orbit-selection').selectOption('kou-42');
 await page.waitForFunction(()=>document.querySelector('.orbit-detail')?.dataset.selectedId==='kou-42');
 assert.match(await page.locator('.orbit-detail').innerText(),new RegExp(calendar.master.kou[41].name));
 assert.equal(await page.locator('[data-orbit-id]').last().getAttribute('data-orbit-id'),'kou-42');
 await page.locator('#orbit-selection').selectOption('');
 await page.locator('[data-orbit-id=kou-01]').focus();await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('.orbit-detail')?.dataset.selectedId==='kou-02');
 await page.keyboard.press('Enter');assert.equal(await page.locator('.orbit-detail').getAttribute('data-selected-id'),'kou-02');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-orbit-id')),'kou-02');
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.querySelector('.orbit-detail')?.dataset.selectedId==='kou-03');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-orbit-id')),'kou-03');
 await page.locator('[data-orbit-id=kou-03]').focus();await page.keyboard.press('Space');
 await page.waitForFunction(()=>document.querySelector('.orbit-detail')?.dataset.selectedId==='kou-03');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-orbit-id')),'kou-03');
 for(const width of [320,390,412,768,1280]){
  await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await page.locator('#orbit-selection').evaluate(node=>node.getBoundingClientRect().height>=44));
  await page.locator('.seasonal-orbit').screenshot({path:`${screenshotDir}/home-42-${width}.png`});
 }
 await page.setViewportSize({width:320,height:844});
 await page.evaluate(()=>{for(const node of document.querySelectorAll('.seasonal-orbit *:not(svg):not(svg *)'))node.style.fontSize=parseFloat(getComputedStyle(node).fontSize)*2+'px';});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('nav [data-go=setting]').click();await page.locator('.seasonal-orbit').waitFor({state:'hidden'});
 await page.locator('nav [data-go=home]').click();await page.locator('.seasonal-orbit').waitFor({state:'visible'});await countFull(page,42);
 await page.close();
 const english=await open(instant(42),{language:'English'});
 await english.waitForFunction(()=>document.querySelector('#orbit-heading')?.textContent==='Seasonal orbit');
 assert.match(await english.locator('[data-kind=current]').getAttribute('aria-label'),/Current/);await english.close();
 const rollover=await open(midnight(dates.nextRisshunDate)-1000);
 assert.match(await rollover.locator('.orbit-svg').getAttribute('aria-label'),/2026/);
 await rollover.clock.fastForward(1001);
 await rollover.waitForFunction(()=>document.querySelector('.orbit-svg')?.getAttribute('aria-label')?.includes('2027'));
 await readyYear(rollover);await countFull(rollover,72);
 await rollover.evaluate(()=>window.dispatchEvent(new Event('focus')));
 assert.match(await rollover.locator('.orbit-svg').getAttribute('aria-label'),/2026/);await rollover.close();
 const resume=await open(instant(12)-1000);await readyYear(resume);await countFull(resume,11);
 await resume.clock.setSystemTime(new Date(instant(12)+1000));await resume.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await countFull(resume,12);await resume.close();
 const missing=await open(Date.parse('2040-10-12T03:00:00Z'),{unavailable:true});assert.equal(await missing.locator('.orbit-svg').count(),0);await missing.close();
 const animated=await open(instant(12),{reducedMotion:'no-preference'});await readyYear(animated);
 await animated.clock.fastForward(100);
 const phases=await animated.locator('[data-orbit-id]').evaluateAll(nodes=>nodes.map(node=>node.dataset.phase));
 const started=phases.slice(0,12).filter(phase=>phase!=='prime').length;
 assert.ok(started>0&&started<12,`Expected staggered prefix, got ${started}`);
 assert.ok(phases.slice(0,started).every(phase=>phase!=='prime'));
 assert.ok(phases.slice(started).every(phase=>phase==='prime'));
 await animated.clock.fastForward(2000);await countFull(animated,12);
 assert.equal(await animated.locator('[data-phase=full] image[data-layer=full][mask]').count(),0);
 await animated.locator('#orbit-selection').selectOption('kou-03');await animated.clock.fastForward(100);await countFull(animated,12);
 assert.equal(await animated.locator('.orbit-svg').getAttribute('data-state'),'complete');
 await animated.evaluate(()=>{window.__seasonalMutations=0;const observer=new MutationObserver(records=>{window.__seasonalMutations+=records.length;});observer.observe(document.querySelector('.orbit-svg'),{subtree:true,attributes:true,childList:true});});
 await animated.clock.fastForward(1000);
 assert.equal(await animated.evaluate(()=>window.__seasonalMutations),0,'Static idle must leave SVG unchanged');
 await animated.close();
 assert.deepEqual(generationRequests,[],'Home must never call haiku/image generation');assert.deepEqual(errors,[]);
 console.log('PASS seasonal home: real C/Cprime frames,0/12/42/72,anchors,selection,keyboard,language,responsive,text200%,visibility,rollover,resume,missing year,organic stagger,no generation');
}finally{await browser.close();}
