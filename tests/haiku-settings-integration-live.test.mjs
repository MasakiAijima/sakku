import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5174';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const page=await context.newPage(),generations=[],errors=[];page.setDefaultTimeout(15000);
let original;
const output='output/haiku-parameters-review';await mkdir(output,{recursive:true});
async function fixture(target,failSettings=false){
 target.on('pageerror',e=>errors.push(e.message));
 await target.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/settings'){
   if(failSettings&&req.method()==='GET')return route.fulfill({status:503,json:{error:'Fixture settings unavailable'}});
   return route.continue();
  }
  if(path==='/api/haiku'&&req.method()==='POST'){
   generations.push(req.postDataJSON());
   return route.fulfill({json:{jobId:'00000000-0000-4000-8000-000000000001',candidates:[0,1,2].map(i=>({title:'Window '+i,lines:['rain on glass','a cup in my hands','still warm']}))}});
  }
  if(path==='/api/haiku/translate')return route.fulfill({json:{translation:{title:'窓',lines:['窓に雨','手の中のカップ','まだ温かい'],keyTerms:[],nuance:'手触りを残す。'}}});
  if(path==='/api/records'&&req.method()==='GET')return route.fulfill({json:{records:[],nextCursor:null}});
  return route.continue();
 });
}
async function compose(target){
 await target.getByRole('button',{name:'Haiku view',exact:true}).click();
 await target.getByRole('button',{name:/tap to compose/i}).click();
 await target.locator('#scene').fill('窓の雨を見ながら、温かいカップを持っている。');
 await target.locator('#to-result').click();await target.locator('.elaboration-candidate').first().waitFor();
}
try{
 await fixture(page);
 await page.goto(base+'/signin-with-chatgpt?return_to=%2F');
 await page.waitForFunction(()=>document.documentElement.dataset.sakkuScreen==='home');await page.locator('.settings-gear').waitFor();
 const before=await page.request.get(base+'/api/settings');assert.equal(before.status(),200);original=(await before.json()).settings;
 await page.locator('.settings-gear').click();await page.locator('#save-settings:not([disabled])').waitFor();
 for(const [key,value] of Object.entries({juxtaposition:0,cut_strength:4,ambiguity:0,concreteness:4}))await page.locator('#parameter-'+key).selectOption(String(value));
 await page.locator('#save-settings').click();await page.locator('#save-settings:not([disabled])').waitFor();
 const after=await page.request.get(base+'/api/settings');assert.equal(after.status(),200);
 const saved=(await after.json()).settings;assert.deepEqual(saved.parameters,{juxtaposition:0,cut_strength:4,ambiguity:0,concreteness:4});
 await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.sakkuScreen==='home');await page.locator('.settings-gear').click();await page.locator('#save-settings:not([disabled])').waitFor();
 assert.equal(await page.locator('#parameter-juxtaposition').inputValue(),'0');assert.equal(await page.locator('#parameter-cut_strength').inputValue(),'4');
 await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:output+'/settings-desktop.png',fullPage:true});
 await page.setViewportSize({width:320,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:output+'/settings-mobile.png',fullPage:true});
 await page.locator('[data-go=home]').first().click();await compose(page);
 assert.deepEqual(generations.at(-1).parameters,saved.parameters);
 const fallback=await context.newPage();await fixture(fallback,true);await fallback.goto(base+'/');await fallback.waitForFunction(()=>document.documentElement.dataset.sakkuScreen==='home');await fallback.locator('.settings-gear').waitFor();await compose(fallback);
 assert.equal(Object.hasOwn(generations.at(-1),'parameters'),false);
 assert.deepEqual(errors,[]);
 console.log('PASS live settings: real local D1 save/reload, saved generation payload, failed-load fallback, desktop and 320px screenshots. Generation service mocked.');
}catch(e){await page.screenshot({path:output+'/failure.png',fullPage:true});console.log(JSON.stringify({screen:await page.locator('html').getAttribute('data-sakku-screen'),settingsStatus:await page.locator('#settings-status').textContent().catch(()=>null)}));throw e;}finally{
 if(original){const restore=await page.request.put(base+'/api/settings',{data:original});assert.equal(restore.status(),200,'restore original local settings');}
 await browser.close();
}
