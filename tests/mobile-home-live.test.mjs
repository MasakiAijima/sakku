import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/aijimamasaki/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const screenshotDir=process.env.SCREENSHOT_DIR||'output/mobile-home-review';
await mkdir(screenshotDir,{recursive:true});
const pointer=JSON.parse(await readFile(new URL('../data/calendar/current.json',import.meta.url)));
const calendar=JSON.parse(await readFile(new URL('../'+pointer.path,import.meta.url)));
const dates=calendar.years.find(value=>value.year===2026);
const now='2026-10-17T03:00:00.000Z';
const currentIndex=dates.entries.findLastIndex(value=>value.date<='2026-10-17');
const current=dates.entries[currentIndex],previous=dates.entries[currentIndex-1],future=dates.entries[currentIndex+1];
const manifest=JSON.parse(await readFile(new URL('../public/seasonal-assets/releases/c-v2/manifest.json',import.meta.url)));
const row=(number,date,poem,status='completed')=>({id:`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`,record_date:date,scene_text:'A private moment',haiku_text:poem,event_text:'',emotion_text:'',status,revision:1,photo_id:'',generation_job_id:null,selected_candidate_index:null,created_at:date+'T03:00:00Z',updated_at:date+'T03:00:00Z'});
let rows=[row(1,previous.date,'Old first\nwind on the water\na quiet morning'),row(2,previous.date,'Old second\na leaf at the window\nlight through the rain'),row(3,current.date,'Current first\nclouds drift above us\na letter arrives'),row(4,current.date,'Current second\nthe last cup of tea\nstill warm in my hands'),row(5,future.date,'Future poem\nshould not be shown\nuntil its season'),row(6,current.date,'Draft poem\nnot complete\nyet','draft')];
const settings={name:'Fixture Poet',style:'自由詩に近いHaiku',expression:'simple',appLanguage:'日本語'};
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[],seasonQueries=[],saves=[],generationRequests=[];
let failSeason=false,pagesDelivered=0;

async function open(time=now,{freeze=false}={}){
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.accept());
 await page.clock.install({time:new Date(time)});
 if(freeze)await page.clock.pauseAt(new Date(Date.parse(time)+1));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/api/settings'){
   if(request.method()==='PUT')Object.assign(settings,request.postDataJSON());
   return route.fulfill({json:{settings}});
  }
  if(url.pathname==='/api/haiku/translate')return route.fulfill({json:{translation:{title:'訳',lines:['一','二','三'],keyTerms:[{term:'Current',meaning:'いまの情景'}],nuance:'静かな言葉'}}});
  if(url.pathname==='/api/haiku'){
   generationRequests.push(request.method());
   return route.fulfill({json:{jobId:'00000000-0000-4000-8000-000000000099',candidates:[0,1,2].map(i=>({title:`Candidate ${i}`,lines:['A new poem','the rain has stopped','a bird calls']}))}});
  }
  if(url.pathname==='/api/records'&&request.method()==='GET'){
   const seasonal=url.searchParams.has('from');
   if(seasonal){seasonQueries.push(url);if(failSeason)return route.fulfill({status:503,json:{error:'Fixture seasonal unavailable'}});}
   const from=url.searchParams.get('from'),to=url.searchParams.get('to');
   const scoped=rows.filter(r=>(!from||r.record_date>=from)&&(!to||r.record_date<to)).sort((a,b)=>b.record_date.localeCompare(a.record_date)||b.id.localeCompare(a.id));
   if(!seasonal)return route.fulfill({json:{records:scoped.slice(0,1),nextCursor:null}});
   pagesDelivered++;
   return route.fulfill({json:{records:url.searchParams.has('cursor')?scoped.slice(2):scoped.slice(0,2),nextCursor:url.searchParams.has('cursor')?null:'fixture + cursor'}});
  }
  if(url.pathname==='/api/records'&&request.method()==='POST'){
   const input=request.postDataJSON();saves.push(input);
   const record={...row(6+saves.length,input.recordDate,input.haikuText,input.status),scene_text:input.sceneText,generation_job_id:input.generationJobId||null,selected_candidate_index:input.selectedCandidateIndex??null};
   rows.push(record);return route.fulfill({json:{record}});
  }
  if(url.pathname.startsWith('/api/records/')){
   const record=rows.find(r=>r.id===url.pathname.split('/').at(-1));
   return route.fulfill({status:record?200:404,json:record?{record}:{error:'Not found'}});
  }
  throw Error('Unexpected fixture request '+url.pathname);
 });
 await page.goto(base+'/signin-with-chatgpt?return_to=%2F');
 await page.locator('.mobile-home').waitFor();
 await page.locator('.orbit-svg[data-ready=true]').waitFor();
 return page;
}

async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Document should fit the viewport');}
const haiku=page=>page.getByRole('button',{name:'Haiku view',exact:true});
const orbit=page=>page.getByRole('button',{name:'Orbit view',exact:true});
const icons=page=>page.locator('.haiku-timeline button');

try{
 const page=await open();
 await page.locator('.orbit-svg[data-ready=true]').waitFor();
 assert.equal(await page.locator('.orbit-viewport').isVisible(),true);
 const asset=manifest.assets.find(a=>a.kouId===current.kouId);
 await page.waitForFunction(point=>{
  const svg=document.querySelector('.orbit-svg'),viewport=document.querySelector('.orbit-viewport').getBoundingClientRect();
  const center=new DOMPoint(point.x,point.y).matrixTransform(svg.getScreenCTM());
  return Math.abs(center.x-(viewport.left+viewport.width/2))<2&&Math.abs(center.y-(viewport.top+viewport.height/2))<2;
 },asset.placement);
 const geometry=await page.locator('.orbit-svg').boundingBox(),viewport=await page.locator('.orbit-viewport').boundingBox();
 assert.ok(geometry.width>viewport.width&&geometry.height>viewport.height,'Orbit must be enlarged beyond the viewport');
 await noOverflow(page);
 await page.screenshot({path:screenshotDir+'/orbit-390.png',fullPage:true});
 await haiku(page).click();
 await page.locator('.haiku-poem').waitFor();
 assert.ok(pagesDelivered>=2,'Seasonal query must drain pagination');
 assert.ok(seasonQueries.some(url=>url.searchParams.get('cursor')==='fixture + cursor'));
 assert.equal(await icons(page).count(),currentIndex+3,'Each arrived slot plus one extra icon for each duplicated candidate');
 assert.equal(await page.locator(`.haiku-timeline button[data-kou-id="${previous.kouId}"]`).count(),2);
 assert.equal(await page.locator(`.haiku-timeline button[data-kou-id="${current.kouId}"]`).count(),2);
 assert.equal(await page.locator(`.haiku-timeline button[data-kou-id="${future.kouId}"]`).count(),0);
 assert.match(await page.locator('.haiku-poem').innerText(),/Current second/);
 const selectedIcon=await page.locator('.haiku-timeline button[aria-pressed=true]').boundingBox();
 assert.ok(selectedIcon.x>=0&&selectedIcon.x+selectedIcon.width<=390,'Latest icon must be visible when entering from Orbit');
 assert.match(await page.locator('.mobile-home').innerText(),/Fixture Poet/);
 await page.getByRole('button',{name:'作句しなおす',exact:true}).click();
 await page.locator('#scene').waitFor();
 assert.equal(await page.locator('#scene').inputValue(),rows[3].scene_text,'Recompose opens the existing record even when outside the archive first page');
 await page.locator('[data-go=home]:visible').first().click();await haiku(page).click();
 await page.locator('.haiku-timeline button[data-record-id="'+rows[0].id+'"]').click();
 assert.match(await page.locator('.haiku-poem').innerText(),/Old first/);
 await haiku(page).click();
 assert.match(await page.locator('.haiku-poem').innerText(),/Current second/);
 await icons(page).last().focus();await page.keyboard.press('Home');
 await page.getByRole('button',{name:/tap to compose/i}).waitFor();
 await page.screenshot({path:screenshotDir+'/empty-390.png',fullPage:true});
 await page.getByRole('button',{name:/tap to compose/i}).click();
 await page.locator('#scene').waitFor();
 assert.equal(await page.locator('#date').count(),0,'Compose date field must not be rendered');
 await page.locator('#scene').fill('A new scene');
 await page.locator('#draft-save').click();await page.waitForFunction(()=>!document.querySelector('#draft-save').disabled);
 assert.equal(saves.at(-1).recordDate,dates.entries[0].date,'Past empty candidate keeps its date internally');
 await page.getByRole('button',{name:'設定',exact:true}).first().click();
 await page.locator('#name').waitFor();
 await page.locator('[data-go=home]:visible').first().click();
 await haiku(page).click();
 assert.equal(await page.locator('.resume-draft').count(),0);
 await page.getByRole('button',{name:'設定',exact:true}).first().click();await page.locator('[data-go=archive]').click();await page.locator('#new').click();
 await page.locator('#scene').waitFor();
 assert.equal(await page.locator('#scene').inputValue(),'A new scene','Resume returns to the existing draft');
 assert.equal(await page.locator('#date').count(),0);
 await page.locator('[data-go=home]:visible').first().click();await haiku(page).click();
 page.removeAllListeners('dialog');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('.compose-fab').click();
 assert.equal(await page.locator('#scene').isVisible(),false,'Canceling discard keeps the top view');
 let discardPrompt=false;
 page.once('dialog',dialog=>{discardPrompt=true;void dialog.accept();});
 await page.locator('.compose-fab').click();
 await page.locator('#scene').waitFor();
 assert.equal(discardPrompt,true,'Canceled discard must retain the dirty draft');
 assert.equal(await page.locator('#scene').inputValue(),'','Only an explicit accepted discard resets the draft');
 await page.locator('#scene').fill('A new scene');
 assert.equal(await page.locator('#date').count(),0);
 await page.locator('#to-result').click();await page.locator('[data-candidate="0"]').waitFor();
 await page.locator('[data-candidate="0"]').click();
 await page.waitForFunction(()=>!document.querySelector('#save').disabled);
 await page.locator('#save').click();await page.locator('#share-record').waitFor();
 assert.equal(saves.at(-1).recordDate,'2026-10-17');
 await page.locator('[data-go=home]:visible').first().click();await haiku(page).click();
 await page.waitForFunction(()=>document.querySelectorAll('.haiku-timeline button[data-record-id="00000000-0000-4000-8000-000000000008"]').length===1);
 assert.equal(await page.locator(`.haiku-timeline button[data-kou-id="${current.kouId}"]`).count(),3,'Save invalidates seasonal records');
 await haiku(page).click();
 await page.screenshot({path:screenshotDir+'/haiku-390.png',fullPage:true});
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:844});await noOverflow(page);
  const short=await page.locator('.mobile-home button:visible,header button:visible').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height<44).map(n=>n.getAttribute('aria-label')||n.textContent));
  assert.deepEqual(short,[],'Touch targets must be at least 44px high');
 }
 await page.setViewportSize({width:320,height:844});
 await page.addStyleTag({content:'html{font-size:200%}'});await noOverflow(page);
 await page.waitForFunction(()=>{
  const fab=document.querySelector('.compose-fab').getBoundingClientRect(),nav=document.querySelector('.home-switch').getBoundingClientRect();
  return fab.bottom<=nav.top;
 });
 const fabBox=await page.locator('.compose-fab').boundingBox(),navBox=await page.locator('.home-switch').boundingBox();
 assert.ok(fabBox.y+fabBox.height<=navBox.y,'FAB must stay above the fixed view switch at text 200%');
 await page.screenshot({path:screenshotDir+'/haiku-320-text200.png',fullPage:true});
 await orbit(page).click();await noOverflow(page);
 await page.getByRole('button',{name:'設定',exact:true}).first().click();
 await page.locator('#app-language').selectOption('English');await page.locator('#save-settings').click();
 await page.waitForFunction(()=>document.documentElement.lang==='en');
 await page.locator('[data-go=home]:visible').first().click();await haiku(page).click();
 assert.equal(await page.getByRole('button',{name:'Compose a haiku',exact:true}).count(),1);
 await page.close();

 failSeason=true;
 const failure=await open();await haiku(failure).click();
 await failure.getByRole('alert').filter({hasText:/Fixture seasonal unavailable|読み込|load/i}).waitFor();
 assert.equal(await failure.getByRole('button',{name:/tap to compose/i}).count(),0,'An error must not be shown as an empty candidate');
 failSeason=false;
 await failure.getByRole('button',{name:/retry|try again|再試行|もう一度/i}).click();
 await failure.locator('.haiku-poem').waitFor();await failure.close();

 const boundary=Date.parse(`${future.date}T00:00:00+09:00`);
 const rollover=await open(new Date(boundary-1000).toISOString(),{freeze:true});
 assert.equal(await rollover.locator('[data-current-kou]').getAttribute('data-current-kou'),current.kouId);
 await rollover.clock.fastForward(1001);
 await rollover.waitForFunction(id=>document.querySelector('[data-current-kou]')?.dataset.currentKou===id,future.kouId);
 await haiku(rollover).click();
 await rollover.locator(`.haiku-timeline button[data-kou-id="${future.kouId}"]`).waitFor();
 assert.match(await rollover.locator('.haiku-poem').innerText(),/Future poem/);
 await rollover.clock.setSystemTime(new Date('2040-10-17T03:00:00Z'));
 await rollover.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await rollover.getByRole('status').filter({hasText:/unavailable|利用できません/i}).waitFor();
 assert.equal(await rollover.locator('.haiku-timeline button').count(),0,'Unavailable calendar must not invent candidates');
 await rollover.close();
 assert.deepEqual(errors,[]);
 assert.deepEqual(generationRequests,['POST'],'Only the explicit editor generation action calls the model endpoint');
 console.log('PASS mobile home: current anchor crop, arrived-only duplicate icons, pagination, latest reselect, keyboard, historic compose, draft preservation, save refresh, settings/English, 320–1280px, text 200%, error/retry. API fixtures only.');
}finally{await browser.close();}
