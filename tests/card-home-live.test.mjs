import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'/Users/aijimamasaki/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const screenshotDir=process.env.SCREENSHOT_DIR||'output/card-home-review';
await mkdir(screenshotDir,{recursive:true});
const pointer=JSON.parse(await readFile(new URL('../data/calendar/current.json',import.meta.url)));
const calendar=JSON.parse(await readFile(new URL('../'+pointer.path,import.meta.url)));
const year=calendar.years.find(value=>value.year===2026);
const index=year.entries.findLastIndex(value=>value.date<='2026-10-17');
const current=year.entries[index],previous=year.entries[index-1];
const manifest=JSON.parse(await readFile(new URL('../public/seasonal-assets/releases/c-v2/manifest.json',import.meta.url)));
const image=await readFile(new URL('../public/seasonal-assets/releases/c-v2/'+manifest.assets[index].completed,import.meta.url));
const id=number=>`00000000-0000-4000-8000-${String(number).padStart(12,'0')}`;
const settings={name:'Poet',appLanguage:'日本語',style:'自由詩に近いHaiku',expression:'simple'};
const record=(number,date,extra={})=>({id:id(number),record_date:date,haiku_text:`Poem ${number}\na breeze at the window\ncarrying your breeze`,scene_text:`Scene ${number}. The morning light reaches the table.`,photo_id:'',photo_ids:[],event_text:'',emotion_text:'',status:'completed',revision:1,generation_job_id:null,selected_candidate_index:null,created_at:date+'T03:00:00Z',updated_at:date+'T03:00:00Z',...extra});
let rows=[record(1,previous.date),record(2,current.date,{photo_id:id(10),photo_ids:[id(10),id(11)]})];
let translations=0,failTranslation=false,holdTranslation=false,releaseTranslation=()=>{},uploads=0;
const saves=[],errors=[];
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
page.on('pageerror',error=>errors.push(error.message));
page.on('dialog',dialog=>dialog.accept());
await page.clock.install({time:new Date('2026-10-17T03:00:00Z')});
await page.route('**/api/**',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.pathname==='/api/settings'){
  if(request.method()==='PUT')Object.assign(settings,request.postDataJSON());
  return route.fulfill({json:{settings}});
 }
 if(url.pathname==='/api/haiku/translate'){
  translations++;
  const language=settings.appLanguage;
  if(holdTranslation&&request.postDataJSON().lines[0]==='Poem 2')await new Promise(resolve=>{releaseTranslation=resolve;});
  if(failTranslation)return route.fulfill({status:503,json:{error:'Fixture translation unavailable'}});
  return route.fulfill({json:{translation:{title:'Translated '+language,lines:language==='日本語'?['窓に風','あなたの言葉を','朝が運ぶ']:['A window breeze','carries what you said','into the morning'],keyTerms:[{term:'breeze',meaning:language==='日本語'?'そよ風。穏やかな空気の動きを表す。':'A gentle movement of air.'}],nuance:language==='日本語'?'「運ぶ」という訳語で、言葉が風に届く柔らかな印象を残す。':'The translated verb carries keeps the image gentle.'}}});
 }
 if(url.pathname==='/api/photos'&&request.method()==='POST'){
  const photoId=id(20+uploads++);return route.fulfill({json:{photo:{id:photoId,url:'/api/photos/'+photoId}}});
 }
 if(url.pathname.startsWith('/api/photos/'))return route.fulfill({contentType:'image/png',body:image});
 if(url.pathname==='/api/records'&&request.method()==='GET')return route.fulfill({json:{records:rows,nextCursor:null}});
 if(url.pathname.startsWith('/api/records/')){
  const existing=rows.find(value=>value.id===url.pathname.split('/').at(-1));
  if(request.method()==='GET')return route.fulfill({json:{record:existing}});
  const input=request.postDataJSON();saves.push(input);
  const updated={...existing,scene_text:input.sceneText,haiku_text:input.haikuText,photo_id:input.photoIds[0]||'',photo_ids:input.photoIds,status:input.status,revision:existing.revision+1};
  rows=rows.map(value=>value.id===updated.id?updated:value);return route.fulfill({json:{record:updated}});
 }
 throw Error('Unexpected fixture request '+url.pathname);
});
const card=()=>page.locator('.haiku-card');
async function tapCard(){await card().click({position:{x:12,y:12}});}
async function face(value){await page.waitForFunction(value=>document.querySelector('.haiku-card')?.dataset.cardFace===value,value);}
const haiku=()=>page.getByRole('button',{name:'Haiku view',exact:true});
const orbit=()=>page.getByRole('button',{name:'Orbit view',exact:true});
try{
 await page.goto(base+'/signin-with-chatgpt?return_to=%2F');
 await page.locator('.orbit-svg[data-ready=true]').waitFor();
 assert.equal(await page.locator('.current-kou .eyebrow,.kou-period>span,.home-switch-label').count(),0,'Removed Orbit labels must not be rendered');
 assert.equal(await page.locator('.home-switch').innerText(),'','View switch uses only icons');
 const lines=await haiku().locator('svg line').evaluateAll(nodes=>nodes.map(node=>Math.abs(Number(node.getAttribute('x2'))-Number(node.getAttribute('x1')))));
 assert.equal(lines.length,3);assert.equal(lines[0],lines[2]);assert.ok(lines[1]>lines[0],'Haiku icon is short, long, short');
 const before=await page.locator('.orbit-viewport').evaluate(node=>({left:node.scrollLeft,top:node.scrollTop,width:node.clientWidth,height:node.clientHeight,scrollWidth:node.scrollWidth,scrollHeight:node.scrollHeight}));
 assert.ok(before.scrollWidth>before.width&&before.scrollHeight>before.height,'Expanded background must scroll in both axes');
 const fixed=await page.locator('.current-kou').boundingBox();
 await page.mouse.move(300,220);await page.mouse.wheel(90,110);
 await page.waitForFunction(before=>{const node=document.querySelector('.orbit-viewport');return Math.abs(node.scrollLeft-before.left)>50&&Math.abs(node.scrollTop-before.top)>50;},before);
 const after=await page.locator('.current-kou').boundingBox();assert.equal(after.x,fixed.x);assert.equal(after.y,fixed.y);
 await page.screenshot({path:screenshotDir+'/orbit-scrolled.png'});
 assert.equal(translations,0,'Orbit must not request card metadata');
 await haiku().click();await card().waitFor();await face('poem');
 await page.locator('.keyword-annotation').first().waitFor();
 assert.equal(translations,1,'Only the active card loads annotation metadata');
 assert.equal(await page.locator('.haiku-season').count(),0);
 assert.equal(await page.locator('.haiku-timeline .timeline-date').count(),await page.locator('.haiku-timeline button').count());
 assert.notEqual(await page.locator('.haiku-timeline button[data-record-id=\"'+id(2)+'\"] .timeline-date').innerText(),'today');
 assert.doesNotMatch(await page.locator('.haiku-byline').innerText(),/2026|October/);
 assert.equal(await page.locator('.resume-draft').count(),0);
 await page.locator('.keyword-annotation').first().click();
 await page.getByRole('tooltip').waitFor();
 assert.match(await page.getByRole('tooltip').innerText(),/そよ風/);
 assert.equal(await page.locator('.keyword-annotation').count(),2);
 assert.equal(await page.locator('.keyword-annotation[aria-expanded=true]').count(),1);
 await page.locator('.keyword-annotation').last().focus();await page.locator('.keyword-annotation').last().press('Enter');
 await page.getByRole('tooltip').waitFor();
 assert.equal(await page.locator('.keyword-annotation[aria-expanded=true]').count(),1,'Repeated keyword occurrences have independent annotation identities');
 assert.equal(await page.locator('.keyword-annotation').last().getAttribute('aria-expanded'),'true');
 await face('poem');
 await page.screenshot({path:screenshotDir+'/keyword-tooltip.png'});
 await page.keyboard.press('Escape');await page.getByRole('tooltip').waitFor({state:'hidden'});
 assert.match(await page.locator('.haiku-poem').innerText(),/Poem 2/);
 await tapCard();await face('translation');
 await page.waitForFunction(()=>document.querySelector('.haiku-translation')?.textContent.includes('窓に風'));
 assert.equal(await page.locator('.translation-notes').count(),0);
 await page.screenshot({path:screenshotDir+'/translation.png',fullPage:true});
 await card().press('Enter');await face('scene');
 assert.match(await page.locator('.haiku-scene').innerText(),/Scene 2/);
 const thumbnails=page.locator('.haiku-scene button');assert.equal(await thumbnails.count(),2);
 await thumbnails.first().click();
 const gallery=page.getByRole('dialog');await gallery.waitFor();
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(id=>document.querySelector('dialog img')?.getAttribute('src')?.endsWith(id),id(11));
 await page.screenshot({path:screenshotDir+'/gallery.png'});
 await page.keyboard.press('Escape');await gallery.waitFor({state:'hidden'});
 assert.equal(await thumbnails.first().evaluate(node=>node===document.activeElement),true,'Gallery restores thumbnail focus');
 await face('scene');await card().focus();await card().press('Space');await face('poem');
 await tapCard();await face('translation');assert.equal(translations,1,'Cached translation must be reused');
 await tapCard();await face('scene');await tapCard();await face('poem');

 failTranslation=true;await page.locator(`.haiku-timeline button[data-record-id="${id(1)}"]`).click();
 await tapCard();await face('translation');
 await page.getByRole('alert').waitFor();
 failTranslation=false;await page.getByRole('button',{name:/もう一度|再試行|retry|try again/i}).click();
 await page.waitForFunction(()=>document.querySelector('.haiku-translation')?.textContent.includes('窓に風'));await face('translation');
 await tapCard();await face('scene');assert.equal(await page.locator('.haiku-scene button').count(),0,'A record without photos still shows its scene');
 await tapCard();await face('poem');
 await page.getByRole('button',{name:'設定',exact:true}).click();
 await page.locator('#app-language').selectOption('English');await page.locator('#save-settings').click();
 await page.waitForFunction(()=>document.documentElement.lang==='en');
 holdTranslation=true;
 await page.locator('[data-go=home]:visible').first().click();await haiku().click();await face('poem');
 await tapCard();await face('scene');
 assert.equal(await page.locator('.haiku-translation').count(),0,'Matching app and haiku languages skip the translation face');
 assert.equal(await page.locator('.haiku-card-pages span').count(),2);
 await page.locator(`.haiku-timeline button[data-record-id="${id(1)}"]`).click();await face('poem');
 await page.locator('.keyword-annotation').first().waitFor();
 holdTranslation=false;releaseTranslation();
 assert.match(await page.locator('.haiku-poem').innerText(),/Poem 1/,'Late metadata cannot change the selected record or card face');
 await page.locator('.keyword-annotation').first().click();await page.getByRole('tooltip').waitFor();
 assert.match(await page.getByRole('tooltip').innerText(),/gentle movement/);
 await page.keyboard.press('Escape');await page.getByRole('tooltip').waitFor({state:'hidden'});
 await tapCard();await face('scene');await tapCard();await face('poem');

 await page.locator(`.haiku-timeline button[data-record-id="${id(2)}"]`).click();
 await page.getByRole('button',{name:/作句しなおす|recompose|compose again/i}).click();
 await page.locator('#scene').waitFor();assert.match(await page.locator('#scene').inputValue(),/Scene 2/);
 assert.equal(await page.locator('#date,.steps').count(),0);
 assert.doesNotMatch(await page.locator('#app').innerText(),/CAPTURE A MOMENT|いま、何を感じた|見えたもの、聞こえた声|うまく書こうとしなくても/);
 await page.locator('#scene').fill('An unsaved change to this same record');
 await page.locator('[data-go=home]:visible').first().click();await haiku().click();
 page.removeAllListeners('dialog');page.once('dialog',dialog=>dialog.dismiss());
 await page.getByRole('button',{name:/作句しなおす|recompose|compose again/i}).click();
 assert.equal(await page.locator('#scene').isVisible(),false,'Canceling recompose must retain same-record unsaved edits');
 assert.equal(await page.locator('.resume-draft').count(),0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-go=archive]').click();await page.locator('#new').click();
 assert.equal(await page.locator('#scene').inputValue(),'An unsaved change to this same record');
 await page.locator('#scene').fill(rows[1].scene_text);
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#photo').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:image},{name:'two.png',mimeType:'image/png',buffer:image}]);
 await page.waitForFunction(()=>!document.querySelector('#draft-save').disabled);
 await page.locator('#to-result').click();await page.locator('#save').click();await page.locator('#share-record').waitFor();
 assert.deepEqual(saves.at(-1).photoIds,[id(10),id(11),id(20),id(21)],'Recompose and upload keep the full ordered photo list');
 assert.equal(saves.at(-1).recordDate,current.date,'Recompose preserves the internal original date without a date field');
 await page.locator('[data-go=home]:visible').first().click();await haiku().click();
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.setViewportSize({width:320,height:844});await page.addStyleTag({content:'html{font-size:200%}'});
 await card().waitFor();await page.locator('.keyword-annotation').first().waitFor();await page.locator('.keyword-annotation').first().click();await page.getByRole('tooltip').waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const tooltipBox=await page.getByRole('tooltip').boundingBox();assert.ok(tooltipBox.x>=0&&tooltipBox.x+tooltipBox.width<=320,'Tooltip fits the narrow viewport');
 await page.screenshot({path:screenshotDir+'/card-320-text200.png',fullPage:true});
 await page.keyboard.press('Escape');
 await orbit().click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 rows=rows.filter(row=>row.id!==id(2));await page.reload();await page.locator('.orbit-svg[data-ready=true]').waitFor();await haiku().click();
 await page.locator('.compose-empty').waitFor();
 assert.equal(await page.locator('.haiku-timeline button').last().locator('.timeline-date').innerText(),'today','The current empty candidate is labeled today');
 assert.deepEqual(errors,[]);
 console.log('PASS card home: icon-only labels, 5-7-5 icon, independent Orbit scrolling, card cycle/keyboard, inline keyword tooltips/cache/error/race/language skip and timeline dates, gallery/focus, recompose and multi-photo upload/save, mobile/text200. API fixtures only.');
}finally{await browser.close();}
