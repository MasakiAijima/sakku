import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/aijimamasaki/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const screenshotDir=process.env.SCREENSHOT_DIR||'output/compose-wf-review';
await mkdir(screenshotDir,{recursive:true});
const pointer=JSON.parse(await readFile(new URL('../data/calendar/current.json',import.meta.url)));
const calendar=JSON.parse(await readFile(new URL('../'+pointer.path,import.meta.url)));
const year=calendar.years.find(value=>value.year===2026);
const index=year.entries.findLastIndex(value=>value.date<='2026-10-17');
const manifest=JSON.parse(await readFile(new URL('../public/seasonal-assets/releases/c-v2/manifest.json',import.meta.url)));
const image=await readFile(new URL('../public/seasonal-assets/releases/c-v2/'+manifest.assets[index].completed,import.meta.url));
const id=number=>`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
const settings={name:'Poet',appLanguage:'日本語',style:'自由詩に近いHaiku',expression:'simple'};
const record=(number,date,extra={})=>({id:id(number),record_date:date,haiku_text:`Poem ${number}\na breeze at the window\ncarrying your breeze`,scene_text:`Scene ${number}. The morning light reaches the table.`,photo_id:'',photo_ids:[],event_text:'',emotion_text:'',status:'completed',revision:1,generation_job_id:null,selected_candidate_index:null,created_at:date+'T03:00:00Z',updated_at:date+'T03:00:00Z',...extra});
let rows=[],failSecond=true,uploads=0;
const errors=[],generations=[],saves=[],patches=[],created=new Map();
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
await page.clock.install({time:new Date('2026-10-17T03:00:00Z')});
await page.route('**/api/**',async route=>{
 const request=route.request(),url=new URL(request.url()),method=request.method();
 if(url.pathname==='/api/settings'){
  if(method==='PUT')Object.assign(settings,request.postDataJSON());
  return route.fulfill({json:{settings}});
 }
 if(url.pathname==='/api/haiku/translate')return route.fulfill({json:{translation:{title:'訳',lines:['窓に風','朝の静けさ','運ぶ声'],keyTerms:[{term:'breeze',meaning:'そよ風。穏やかな空気の動き。'}],nuance:'静かな印象。'}}});
 if(url.pathname==='/api/haiku'){
  generations.push(request.postDataJSON());
  return route.fulfill({json:{jobId:id(90+generations.length),candidates:[0,1,2].map(index=>({title:'Candidate '+index,lines:['A breeze '+index,'at the window','carrying a voice']}))}});
 }
 if(url.pathname==='/api/photos'&&method==='POST')return route.fulfill({json:{photo:{id:id(50+uploads++),url:'/api/photos/'+id(49+uploads)}}});
 if(url.pathname.startsWith('/api/photos/'))return route.fulfill({contentType:'image/png',body:image});
 if(url.pathname==='/api/records'&&method==='GET')return route.fulfill({json:{records:rows,nextCursor:null}});
 if(url.pathname==='/api/records'&&method==='POST'){
  const input=request.postDataJSON();saves.push(input);
  if(saves.length===2&&failSecond){failSecond=false;return route.fulfill({status:503,json:{error:'Fixture second post failed'}});}
  let row=created.get(input.createKey);
  if(!row){row=record(100+created.size,input.recordDate,{scene_text:input.sceneText,haiku_text:input.haikuText,photo_ids:input.photoIds,photo_id:input.photoIds[0]||'',generation_job_id:input.generationJobId,selected_candidate_index:input.selectedCandidateIndex});created.set(input.createKey,row);rows.push(row);}
  return route.fulfill({json:{record:row}});
 }
 if(url.pathname.startsWith('/api/records/')&&method==='GET')return route.fulfill({json:{record:rows.find(row=>row.id===url.pathname.split('/').at(-1))}});
 if(url.pathname.startsWith('/api/records/')&&method==='PATCH'){
  const input=request.postDataJSON(),recordId=url.pathname.split('/').at(-1),existing=rows.find(row=>row.id===recordId);patches.push(input);
  if(input.revision!==existing.revision)return route.fulfill({status:409,json:{error:'Fixture revision conflict'}});
  rows=rows.map(row=>row.id===recordId?{...row,revision:row.revision+1,scene_text:input.sceneText,haiku_text:input.haikuText,photo_ids:input.photoIds,record_date:input.recordDate,status:input.status,generation_job_id:input.generationJobId,selected_candidate_index:input.selectedCandidateIndex}:row);
  return route.abort('failed');
 }
 throw Error('Unexpected request '+method+' '+url.pathname);
});
async function mode(name){await page.getByRole('button',{name,exact:true}).click();}
async function swipe(index,dx){
 const box=await page.locator('.elaboration-candidate').nth(index).boundingBox();
 const x=dx>0?box.x+20:box.x+box.width-20,y=box.y+60;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+3,{steps:8});await page.mouse.up();
 await page.waitForFunction(({index,selected})=>document.querySelector(`[data-candidate="${index}"]`)?.getAttribute('aria-pressed')===String(selected),{index,selected:dx>0});
}
async function noOverflow(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Page must not overflow horizontally');}
try{
 await page.goto(base+'/signin-with-chatgpt?return_to=%2F');
 await page.locator('.orbit-svg[data-ready=true]').waitFor();
 assert.equal(await page.locator('#signout').count(),0);
 await mode('Haiku view');await page.getByRole('button',{name:/tap to compose/i}).click();
 await page.locator('#scene').fill('Free scene kept separately.');
 const back=await page.locator('.compose-back').boundingBox(),gear=await page.locator('.settings-gear').boundingBox();
 assert.ok(Math.abs(back.y+back.height/2-gear.y-gear.height/2)<12,'Back and settings share the header row');
 assert.match(await page.locator('#app').innerText(),/こころの風景を書き出します/);
 assert.equal(await page.locator('#date').count(),0);
 await mode('guided');
 const fields=page.locator('textarea[data-guided]');
 assert.equal(await fields.count(),5);
 await fields.nth(0).fill('At the window');await fields.nth(3).fill('A gentle breeze stayed with me.');
 await mode('free');assert.equal(await page.locator('#scene').inputValue(),'Free scene kept separately.');
 await mode('guided');assert.equal(await fields.nth(3).inputValue(),'A gentle breeze stayed with me.');
 await page.locator('#photo').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:image},{name:'two.png',mimeType:'image/png',buffer:image}]);
 await page.waitForFunction(()=>document.querySelectorAll('[data-remove-photo]').length===2);
 await page.screenshot({path:screenshotDir+'/guided-390.png',fullPage:true});
 await page.locator('#to-result').click();await page.locator('.elaboration-candidate').first().waitFor();
 assert.equal(generations.length,1);assert.match(generations[0].sceneText,/At the window/);assert.match(generations[0].sceneText,/gentle breeze/);assert.doesNotMatch(generations[0].sceneText,/Free scene/);
 assert.equal(await page.locator('.elaboration-candidate').count(),3);
 const first=page.locator('.elaboration-candidate').first(),card=first.locator('.haiku-card');
 await first.locator('.keyword-annotation').first().click();assert.match(await page.getByRole('tooltip').innerText(),/そよ風/);await page.keyboard.press('Escape');
 await card.click({position:{x:10,y:10}});assert.equal(await card.getAttribute('data-card-face'),'translation');
 await card.click({position:{x:10,y:10}});assert.equal(await card.getAttribute('data-card-face'),'scene');
 assert.equal(await first.locator('.haiku-thumbnails button').count(),2);
 await first.locator('.haiku-thumbnails button').first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('ArrowRight');
 assert.match(await page.locator('dialog[open] img').getAttribute('src'),new RegExp(id(51)+'$'));await page.keyboard.press('Escape');
 await card.click({position:{x:10,y:10}});assert.equal(await card.getAttribute('data-card-face'),'poem');
 assert.equal(await card.evaluate(node=>!node.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true}))),true,'Native text drag must not take over a card swipe');
 await swipe(0,140);assert.equal(await first.locator('[data-candidate]').getAttribute('aria-pressed'),'true');assert.equal(await card.getAttribute('data-card-face'),'poem','Swipe must not also cycle the card');
 await swipe(0,-140);assert.equal(await first.locator('[data-candidate]').getAttribute('aria-pressed'),'false');
 const edge=await first.boundingBox(),start=edge.x+edge.width-80;
 await page.mouse.move(start,edge.y+60);await page.mouse.down();await page.mouse.move(start+90,edge.y+62,{steps:8});await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('[data-candidate="0"]')?.getAttribute('aria-pressed')==='true');
 assert.equal(await first.locator('[data-candidate]').getAttribute('aria-pressed'),'true','A swipe ending outside the card still selects');
 await swipe(0,-140);
 await first.locator('[data-candidate]').click();await page.locator('[data-candidate="1"]').click();
 await page.screenshot({path:screenshotDir+'/elaboration-selected-390.png',fullPage:true});
 await page.locator('#save').click();await page.getByRole('alert').filter({hasText:/Fixture second/}).waitFor();
 assert.equal(created.size,1);assert.equal(saves.length,2);await page.locator('#save').click();
 await page.waitForFunction(()=>document.documentElement.dataset.sakkuScreen==='home');
 assert.equal(created.size,2);assert.equal(saves.length,3);assert.equal(saves[1].createKey,saves[2].createKey);assert.notEqual(saves[0].createKey,saves[1].createKey);
 assert.deepEqual(saves.map(input=>input.selectedCandidateIndex),[0,1,1]);
 for(const input of saves){assert.equal(input.sceneText,generations[0].sceneText);assert.deepEqual(input.photoIds,[id(50),id(51)]);assert.equal(input.recordDate,'2026-10-17');}
 await page.locator('.haiku-timeline button[data-record-id="'+id(100)+'"]').click();
 await page.getByRole('button',{name:'作句しなおす',exact:true}).click();await page.locator('#scene').fill('A second scene for the existing poem.');
 await page.locator('#to-result').click();await page.locator('[data-candidate="1"]').waitFor();
 await page.locator('[data-candidate="1"]').click();await page.locator('[data-candidate="2"]').click();
 await page.locator('#save').click();await page.waitForFunction(()=>document.documentElement.dataset.sakkuScreen==='home');
 assert.equal(patches.length,1,'Lost PATCH response must reconcile the saved record without repeating the write');
 assert.equal(patches[0].selectedCandidateIndex,1);assert.equal(saves.at(-1).selectedCandidateIndex,2);
 assert.equal(rows.length,3,'Recompose updates the original and creates only the additional selection');
 await page.locator('.compose-fab').click();await page.locator('#scene').fill('Mobile free scene');
 await mode('guided');const generationCount=generations.length;
 await page.locator('[data-guided="0"]').fill('   ');await page.locator('#to-result').click();
 assert.equal(generations.length,generationCount,'Blank guided fields must not generate');
 await page.locator('[data-guided="0"]').fill('A single scene is enough.');await page.locator('#to-result').click();
 await page.locator('[data-candidate="0"]:not([disabled])').waitFor();
 assert.equal(generations.length,generationCount+1);assert.match(generations.at(-1).sceneText,/A single scene is enough/);
 await page.locator('[data-candidate="0"]').focus();await page.keyboard.press('Space');
 assert.equal(await page.locator('[data-candidate="0"]').getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'情景に戻る',exact:true}).click();await mode('free');
 assert.equal(await page.locator('#scene').inputValue(),'Mobile free scene','Result round trip retains both buffers');
 for(const width of [320,390,768]){await page.setViewportSize({width,height:844});await noOverflow();}
 await page.setViewportSize({width:320,height:844});await page.addStyleTag({content:'html{font-size:200%}'});await noOverflow();
 await page.screenshot({path:screenshotDir+'/free-320-text200.png',fullPage:true});
 await page.locator('.compose-back').click();await page.waitForFunction(()=>document.documentElement.dataset.sakkuScreen==='home');
 assert.deepEqual(errors,[]);
 console.log('PASS Compose WF: separate buffers, five guided fields, photos, shared cards/notes/gallery, swipe multi-select, partial retry without duplicates, mobile widths and text200. Fixture API only.');
}catch(error){
 await page.screenshot({path:screenshotDir+'/failure.png',fullPage:true});
 console.error('Browser errors',errors);console.error(await page.locator('#__vinext_dev_error_overlay_root').innerText({timeout:500}).catch(()=>''));throw error;
}finally{await browser.close();}
