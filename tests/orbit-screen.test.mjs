import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const pointer=JSON.parse(await readFile(new URL('../data/calendar/current.json',import.meta.url)));
const calendar=JSON.parse(await readFile(new URL('../'+pointer.path,import.meta.url)));
const dates=calendar.years.find(value=>value.year===2026);
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
const dir=process.env.SCREENSHOT_DIR||'/private/tmp/sakku-issue13';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const errors=[];
async function open(now,viewport={width:390,height:844},language='日本語'){
 const page=await browser.newPage({viewport});page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install({time:new Date(now)});
 await page.route('**/api/**',route=>route.fulfill({json:route.request().url().endsWith('/settings')?{settings:{name:'',style:'自由詩に近いHaiku',expression:'',appLanguage:language}}:{records:[]}}));
 await page.goto(base);await page.waitForFunction(()=>document.querySelector('#orbit-selection')||document.querySelector('.seasonal-orbit')?.textContent?.includes('暦を利用できません'));await page.locator('#period-kind').waitFor();return page;
}
try{
 let anchorSnapshot,geometryImage;
 for(const count of [0,12,42,72]){
  const instant=count===0?new Date(Date.parse(dates.entries[0].date+'T00:00:00Z')-86400000).toISOString():count===72?dates.nextRisshunDate+'T00:00:00Z':dates.entries[count-1].date+'T00:00:00Z';
  const page=await open(instant);await page.getByLabel('季節年',{exact:true}).selectOption('2026');
  const nodes=page.locator('[data-orbit-id]');assert.equal(await nodes.count(),72);
  assert.equal(await nodes.evaluateAll(nodes=>nodes.filter(node=>node.dataset.kind!=='upcoming').length),count);
  const anchors=await nodes.evaluateAll(nodes=>nodes.map(node=>[node.dataset.orbitId,node.dataset.anchor,node.dataset.z,node.getAttribute('transform')]));
  if(anchorSnapshot)assert.deepEqual(anchors,anchorSnapshot);else anchorSnapshot=anchors;
  await writeFile(`${dir}/anchors-${count}.json`,JSON.stringify(anchors,null,2));
  await page.locator('.orbit-svg').screenshot({path:`${dir}/orbit-${count}-390.png`});
  await page.addStyleTag({content:'.orbit-svg text,.orbit-svg [data-kind=current]>circle{display:none}.orbit-svg [data-orbit-id] rect,.orbit-svg [data-orbit-id] path{fill:#222!important;stroke:none!important;opacity:1!important}'});
  const geometry=await page.locator('.orbit-svg').screenshot({path:`${dir}/geometry-${count}-390.png`});
  if(geometryImage){
   const difference=await page.evaluate(async images=>{
    const pixels=await Promise.all(images.map(async src=>{
     const image=new Image();image.src=src;await image.decode();
     const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
     const context=canvas.getContext('2d');context.drawImage(image,0,0);
     return context.getImageData(0,0,image.width,image.height).data;
    }));
    if(pixels[0].length!==pixels[1].length)return 1;
    let changed=0;
    for(let index=0;index<pixels[0].length;index+=4)if([0,1,2,3].some(channel=>Math.abs(pixels[0][index+channel]-pixels[1][index+channel])>10))changed++;
    return changed/(pixels[0].length/4);
   },[geometryImage,geometry].map(bytes=>'data:image/png;base64,'+bytes.toString('base64')));
   assert.ok(difference<=0.001,`geometry image differs by ${difference*100}% at ${count} completed microseasons`);
  }else geometryImage=geometry;
  await page.close();
 }
 const page=await open('2026-10-12T03:00:00Z');
 await page.locator('#orbit-selection').selectOption('kou-42');assert.equal(await page.locator('.orbit-detail').getAttribute('data-selected-id'),'kou-42');
 assert.match(await page.locator('[data-orbit-id=kou-42]').getAttribute('aria-label'),new RegExp(calendar.master.kou[41].name));
 assert.equal(await page.locator('[data-orbit-id]').last().getAttribute('data-orbit-id'),'kou-42');
 await page.locator('#orbit-selection').selectOption('');await page.locator('[data-orbit-id=kou-01]').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.orbit-detail')?.dataset.selectedId==='kou-01',null,{timeout:5000});
 assert.equal(await page.locator('.orbit-detail').getAttribute('data-selected-id'),'kou-01');
 await page.locator('[data-orbit-id=kou-12]').click({force:true});assert.equal(await page.locator('.orbit-detail').getAttribute('data-selected-id'),'kou-12');
 await page.locator('.seasonal-orbit summary').click();await page.locator('.seasonal-orbit input[type=checkbox]').check();assert.match(await page.locator('.seasonal-orbit details').innerText(),/完全遮蔽のサンプル検出: 0/);
 for(const width of [320,390,412,768,1280]){
  await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.ok(await page.locator('#orbit-selection').evaluate(node=>node.getBoundingClientRect().height>=44));
  await page.screenshot({path:`${dir}/screen-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:320,height:844});await page.evaluate(()=>{for(const node of document.querySelectorAll('.seasonal-orbit *:not(svg):not(svg *)'))node.style.fontSize=parseFloat(getComputedStyle(node).fontSize)*2+'px'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${dir}/screen-320-text200.png`,fullPage:true});
 await page.locator('nav [data-go=setting]').click();await page.locator('.seasonal-orbit').waitFor({state:'hidden'});assert.equal(await page.locator('.seasonal-orbit').isVisible(),false);
 await page.locator('nav [data-go=home]').click();await page.locator('.seasonal-orbit').waitFor({state:'visible'});assert.equal(await page.locator('.seasonal-orbit').isVisible(),true);await page.close();
 const english=await open('2026-10-12T03:00:00Z',undefined,'English');await english.waitForFunction(()=>document.querySelector('#orbit-heading')?.textContent==='Seasonal orbit');assert.equal(await english.locator('#orbit-heading').innerText(),'Seasonal orbit');await english.close();
 const rolloverDate=dates.nextRisshunDate;
 const rollover=await open(new Date(Date.parse(rolloverDate+'T00:00:00+09:00')-1000).toISOString());
 assert.match(await rollover.locator('.orbit-svg').getAttribute('aria-label'),/2026/);
 await rollover.clock.fastForward(1001);await rollover.waitForFunction(()=>document.querySelector('.orbit-svg')?.getAttribute('aria-label')?.includes('2027'));
 await rollover.getByLabel('季節年',{exact:true}).selectOption('2026');assert.equal(await rollover.locator('[data-kind=visited]').count(),72);
 await rollover.clock.fastForward(1000);assert.match(await rollover.locator('.orbit-svg').getAttribute('aria-label'),/2026/);await rollover.close();
 const missing=await open('2040-10-12T03:00:00Z');assert.equal(await missing.locator('.orbit-svg').count(),0);assert.match(await missing.locator('.seasonal-orbit').innerText(),/暦を利用できません/);await missing.close();
 assert.deepEqual(errors,[]);console.log(`PASS orbit: 0/12/42/72 exact anchors and geometry image comparison, IDs, order, keyboard, widths, 200% text, language, home-only, year lifecycle. Screenshots: ${dir}`);
}finally{await browser.close()}
