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
 let records=[];
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/settings')return route.fulfill({json:{settings:{name:'',style:'自由詩に近いHaiku',expression:'',appLanguage:language}}});
  if(path==='/api/haiku/translate')return route.fulfill({json:{translation:{title:'雨',lines:['窓に雨','手の中のカップ','静かな部屋'],keyTerms:[],nuance:'情景の翻訳'}}});
  if(path==='/api/haiku')return route.fulfill({json:{jobId:'00000000-0000-4000-8000-000000000003',candidates:Array.from({length:3},(_,i)=>({title:'Candidate '+i,lines:['rain at the window','a cup warms my hands','the room is quiet']}))}});
  if(path==='/api/records'){
   if(route.request().method()==='POST'){
    const input=route.request().postDataJSON();
    const record={id:'00000000-0000-4000-8000-000000000001',record_date:input.recordDate,scene_text:input.sceneText,haiku_text:input.haikuText,event_text:input.eventText,emotion_text:input.emotionText,status:input.status,revision:1};
    records=[record];return route.fulfill({json:{record}});
   }
   return route.fulfill({json:{records}});
  }
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
 assert.deepEqual(generationRequests,[],'Home must never call haiku/image generation');
 await animated.locator('nav [data-go=edit]').click();
 await animated.locator('#scene').fill('窓に雨音がする。カップを両手で持っている。');
 await animated.locator('#to-result').click();
 await animated.locator('[data-candidate="0"]').click();
 await animated.locator('#save').click();
 await animated.locator('#edit-record').waitFor();
 assert.deepEqual(generationRequests.map(url=>new URL(url).pathname),['/api/haiku','/api/haiku/translate'],'Only explicit record actions call fixture generation APIs');
 await animated.locator('nav [data-go=home]').click();
 await countFull(animated,12);
 await animated.clock.fastForward(1000);
 assert.equal(await animated.locator('[data-phase=growing]').count(),0,'Saving a haiku must not replay seasonal growth');
 assert.equal(await animated.locator('.orbit-svg').getAttribute('data-state'),'complete');
 await animated.close();
 const overlapping=await open(instant(24),{reducedMotion:'no-preference'});
 await overlapping.evaluate(async()=>{
  const {mountSeasonalArt}=await import('/seasonal-assets/seasonal-art-runtime.js');
  const manifest=await(await fetch('/seasonal-assets/releases/c-v2/manifest.json')).json();
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='growth-limit-probe';document.body.append(svg);
  const controller=mountSeasonalArt({svg,manifest,assetBase:new URL('/seasonal-assets/releases/c-v2/',location.href).href,onSelect:()=>{}});
  await controller.ready;
  const state=count=>({year:2026,slots:manifest.assets.map((asset,index)=>({id:asset.kouId,kind:index<count?'visited':'upcoming',completed:index<count})),reducedMotion:false,visible:true});
  window.__growthProbe={controller,state};controller.update(state(12));
 });
 await overlapping.clock.fastForward(100);
 await overlapping.evaluate(()=>window.__growthProbe.controller.update(window.__growthProbe.state(24)));
 let peakGrowing=0;
 for(let step=0;step<40;step++){
  await overlapping.clock.fastForward(50);
  peakGrowing=Math.max(peakGrowing,await overlapping.locator('#growth-limit-probe [data-phase=growing]').count());
 }
 assert.ok(peakGrowing<=16,`Expected at most 16 concurrent growing assets, got ${peakGrowing}`);
 assert.equal(await overlapping.locator('#growth-limit-probe [data-phase=full]').count(),24);
 await overlapping.evaluate(()=>window.__growthProbe.controller.update(window.__growthProbe.state(25)));
 await overlapping.clock.fastForward(50);
 assert.equal(await overlapping.locator('#growth-limit-probe [data-phase=full]').count(),24,'Previously completed assets stay static on an additional arrival');
 assert.equal(await overlapping.locator('#growth-limit-probe [data-phase=growing]').count(),1);
 await overlapping.clock.fastForward(800);
 await overlapping.evaluate(()=>window.__growthProbe.controller.update({...window.__growthProbe.state(24),year:2027}));
 assert.equal(await overlapping.locator('#growth-limit-probe [data-phase=prime]').count(),72,'Changing year resets growth before the new stagger starts');
 await overlapping.clock.fastForward(2000);
 assert.equal(await overlapping.locator('#growth-limit-probe [data-phase=full]').count(),24);
 await overlapping.evaluate(()=>window.__growthProbe.controller.update({...window.__growthProbe.state(30),year:2027,visible:false}));
 assert.equal(await overlapping.locator('#growth-limit-probe [data-phase=full]').count(),30,'Hidden artwork completes without animation');
 await overlapping.evaluate(()=>window.__growthProbe.controller.update({...window.__growthProbe.state(30),year:2027,visible:true}));
 await overlapping.clock.fastForward(50);
 assert.equal(await overlapping.locator('#growth-limit-probe [data-phase=growing]').count(),0,'Returning to the foreground must not replay completed growth');
 await overlapping.evaluate(()=>window.__growthProbe.controller.update({...window.__growthProbe.state(24),year:2028,reducedMotion:true}));
 assert.equal(await overlapping.locator('#growth-limit-probe [data-phase=full]').count(),24,'Reduced Motion completes a newly selected year immediately');
 await overlapping.evaluate(()=>{window.__growthProbe.controller.dispose();document.querySelector('#growth-limit-probe').remove();});
 await overlapping.close();
 assert.deepEqual(generationRequests.map(url=>new URL(url).pathname),['/api/haiku','/api/haiku/translate'],'Later home and renderer operations must not generate');
 assert.deepEqual(errors,[]);
 console.log('PASS seasonal home: real C/Cprime frames,0/12/42/72,anchors,selection,keyboard,language,responsive,text200%,visibility,rollover,resume,missing year,organic stagger,concurrent growth limit,save does not replay,no home generation');
}finally{await browser.close();}
