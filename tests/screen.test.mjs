import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',dialog=>dialog.accept());
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
const screenshotDir=process.env.SCREENSHOT_DIR;
const settings={name:'Fixture',style:'自由詩に近いHaiku',expression:'simple',appLanguage:'日本語'};
let rows=[{id:'00000000-0000-4000-8000-000000000001',record_date:'2024-02-29',scene_text:'Private scene',haiku_text:'one\ntwo\nthree',event_text:'',emotion_text:'Private feeling',status:'completed',revision:1}];
rows.push({...rows[0],id:'00000000-0000-4000-8000-000000000004',record_date:'2024-03-01'});
let queries=[],failGeneration=false,failArchive=false,paginate=false,saves=[];
await page.route('**/api/**',async route=>{
 const req=route.request(),url=new URL(req.url());let data;
 if(url.pathname==='/api/settings'){
  if(req.method()==='PUT')Object.assign(settings,req.postDataJSON());data={settings};
 }else if(url.pathname==='/api/haiku/translate')data={translation:{title:'訳',lines:['一','二','三'],keyTerms:[{term:'one',meaning:'一'}],nuance:'静かな表現'}};
 else if(url.pathname==='/api/haiku'){
  if(failGeneration)return route.fulfill({status:503,json:{error:'Fixture generation failure'}});
  data={jobId:'00000000-0000-4000-8000-000000000003',candidates:Array.from({length:3},(_,i)=>({title:'Candidate '+i,lines:['line '+i,'second','third']}))};
 }else if(url.pathname.startsWith('/api/records')){
  if(req.method()==='GET'){
   queries.push(url);
   if(failArchive)return route.fulfill({status:500,json:{error:'Fixture archive failure'}});
   const from=url.searchParams.get('from'),to=url.searchParams.get('to');
   const scoped=rows.filter(r=>(!from||r.record_date>=from)&&(!to||r.record_date<to));
   data={records:paginate&&!url.searchParams.has('cursor')?scoped.slice(0,1):paginate?scoped.slice(1):scoped,nextCursor:paginate&&!url.searchParams.has('cursor')?'fixture + cursor':null};
  }else{
   const input=req.postDataJSON();saves.push(input);
   const r={id:'00000000-0000-4000-8000-000000000002',record_date:input.recordDate,scene_text:input.sceneText,haiku_text:input.haikuText,event_text:input.eventText,emotion_text:input.emotionText,status:input.status,revision:2};
   rows=rows.filter(x=>x.id!==r.id).concat(r);data={record:r};
  }
 }else throw Error('Unexpected fixture request '+url.pathname);
 await route.fulfill({json:data});
});
async function submit(){await page.locator('#period-form button[type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#period-kind').disabled)}
async function home(){await page.locator('nav [data-go=home]').click();await page.locator('#period-kind').waitFor()}
function luminance(hex){const values=hex.trim().replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return values[0]*.2126+values[1]*.7152+values[2]*.0722}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (values[1]+.05)/(values[0]+.05)}
async function overflow(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'page has horizontal overflow')}
try{
 await page.goto(base);await page.locator('#period-kind').waitFor();
 const colors=await page.locator('body').evaluate(n=>Object.fromEntries(['muted','paper','soft','green'].map(k=>[k,getComputedStyle(n).getPropertyValue('--'+k)])));for(const bg of [colors.paper,colors.soft,'#fcfbf7'])assert.ok(contrast(colors.muted,bg)>=4.5,'muted text contrast');assert.ok(contrast('#ffffff',colors.green)>=4.5);
 const before=queries.length;
 await page.locator('#period-kind').selectOption('kou');
 assert.equal(queries.length,before);assert.equal(await page.locator('.empty').count(),0);assert.equal(await page.locator('.card').count(),0);
 assert.match(await page.locator('#period-form').innerText(),/暦未確定/);
 await page.locator('#period-from').fill('2024-02-29');await page.locator('#period-to').fill('2024-03-01');await submit();
 assert.equal(await page.locator('[data-detail]').count(),1);
 await page.locator('[data-detail]').first().click();await page.locator('#share-record').click();
 assert.equal(await page.locator('.share-card').innerText().then(x=>x.includes('Private')),false);
 await page.locator('#back-detail').click();await page.locator('main [data-go=home]').click();
 assert.equal(await page.locator('#period-kind').inputValue(),'kou');assert.equal(await page.locator('#period-from').inputValue(),'2024-02-29');
 await page.locator('#period-kind').selectOption('day');await page.locator('#period-date').fill('2024-02-29');await submit();
 assert.equal(queries.at(-1).searchParams.get('to'),'2024-03-01');
 await page.locator('#period-kind').selectOption('year');await page.locator('#period-year').fill('2024');paginate=true;await submit();
 await page.locator('#more').click();await page.waitForFunction(()=>!document.querySelector('#period-kind').disabled);
 assert.equal(await page.locator('[data-detail]').count(),2,'next page appends its record');assert.equal(queries.at(-1).searchParams.get('cursor'),'fixture + cursor');assert.equal(queries.at(-1).searchParams.get('from'),'2024-01-01');assert.equal(queries.at(-1).searchParams.get('to'),'2025-01-01');paginate=false;
 await page.locator('#period-kind').selectOption('sekki');await page.locator('#period-from').fill('2025-01-01');await page.locator('#period-to').fill('2025-02-01');await submit();
 assert.match(await page.locator('.empty').innerText(),/書かなかった日/);
 failArchive=true;await submit();assert.equal(await page.locator('.empty').count(),0);assert.match(await page.locator('main').innerText(),/Fixture archive failure/);failArchive=false;
 await page.locator('#new').click();assert.equal(await page.locator('.helper-inputs').getAttribute('open'),null);
 await page.locator('#scene').fill('My own scene');await page.locator('#date').fill('2024-03-02');await page.locator('.helper-inputs summary').click();await page.locator('#event').fill('private event');await page.locator('.helper-inputs summary').click();await page.locator('.helper-inputs summary').click();assert.equal(await page.locator('#event').inputValue(),'private event');
 await page.locator('#to-result').click();await page.locator('[data-candidate]').first().waitFor();await page.locator('[data-candidate="0"]').click();await page.waitForFunction(()=>!document.querySelector('#save').disabled);
 const edited='edited line\nsecond line\nthird line';await page.locator('#poem').fill(edited);
 await page.locator('[data-candidate="0"]').click();assert.equal(await page.locator('#poem').inputValue(),edited);
 await page.locator('[data-candidate="0"]').click();assert.equal(await page.locator('#poem').inputValue(),edited);
 failGeneration=true;await page.locator('#regenerate').click();await page.waitForFunction(()=>!document.querySelector('#regenerate').disabled);assert.equal(await page.locator('#poem').inputValue(),edited);failGeneration=false;
 await page.locator('main [data-go=edit]').click();await page.locator('#scene').fill('Changed scene');await page.locator('#to-result').click();assert.equal(await page.locator('#save').isDisabled(),true);
 await page.locator('[data-candidate="0"]').click();assert.equal(await page.locator('#poem').inputValue(),edited);
 await page.locator('#draft-save').click();await page.waitForFunction(()=>!document.querySelector('#draft-save').disabled);assert.equal(saves.at(-1).status,'draft');
 await page.locator('#save').click();await page.locator('#share-record').waitFor();assert.equal(saves.at(-1).status,'completed');assert.equal(saves.at(-1).haikuText,edited);
 await home();assert.equal(await page.locator('[data-detail]').count(),0,'out-of-range save must not appear in scoped archive');
 await page.locator('#period-kind').selectOption('kou');const unreadyQueries=queries.length;await page.locator('#new').click();await page.locator('#scene').fill('Unready period draft');await page.locator('#draft-save').click();await page.waitForFunction(()=>!document.querySelector('#draft-save').disabled);await home();assert.equal(queries.length,unreadyQueries);assert.equal(await page.locator('[data-detail]').count(),0);assert.equal(await page.locator('.empty').count(),0);
 await page.locator('#period-kind').selectOption('all');await page.waitForFunction(()=>!document.querySelector('#period-kind').disabled);
 await page.locator('.visual-comparison summary').click();assert.equal(await page.locator('.visual-sample').count(),6);
 assert.equal(await page.locator('header').count(),1);await page.locator('#toast').waitFor({state:'hidden'});
 if(screenshotDir){await mkdir(screenshotDir,{recursive:true});await page.screenshot({path:screenshotDir+'/archive-desktop.png',fullPage:true})}
 await page.setViewportSize({width:320,height:900});await overflow();
 const smallTargets=await page.locator('button:visible,summary:visible,select:visible,a:visible').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().height<44).map(n=>n.textContent));assert.deepEqual(smallTargets,[]);
 if(screenshotDir)await page.screenshot({path:screenshotDir+'/archive-320.png',fullPage:true});
 await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>document.body.style.zoom='2');await overflow();await page.evaluate(()=>document.body.style.zoom='');await page.setViewportSize({width:320,height:900});await page.addStyleTag({content:'html{font-size:200%}'});await overflow();
 await page.locator('#new').click();await overflow();await page.locator('#to-result').click();await overflow();
 await home();await page.locator('nav [data-go=setting]').click();await page.locator('#app-language').selectOption('English');await page.locator('#save-settings').click();await page.waitForFunction(()=>document.documentElement.lang==='en');await home();
 assert.equal(await page.locator('label[for=period-kind]').innerText(),'Browse by');await page.locator('#period-kind').selectOption('kou');assert.match(await page.locator('#period-form').innerText(),/Manual period prototype/);
 assert.deepEqual(errors,[]);console.log('PASS screen: periods, pagination, empty/error, edit/translation, draft/save, privacy, visual comparison, 320px/root rem 200%/CSS zoom 200%, English. API fixtures; no real AI or production data.');
}finally{await browser.close()}
