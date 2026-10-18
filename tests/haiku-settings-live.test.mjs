import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
// The static shell runs the production screen script and CSS. API responses are fixtures.
const server=createServer(async(req,res)=>{
 if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"></head><body><header><button class="logo" data-go="home">sakku</button><nav><button data-go="home">記録</button><button data-go="setting">設定</button></nav></header><main id="app"></main><footer><span></span></footer><div id="toast"></div><script src="/screen.js"></script></body></html>');return;}
 try{const file=req.url==='/globals.css'?'../app/globals.css':'../public'+req.url;res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL(file,import.meta.url)));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
try{
 const page=await browser.newPage({viewport:{width:320,height:900}}),errors=[],puts=[];
 let saved={name:'',language:'English',style:'自由詩に近いHaiku',expression:'',appLanguage:'日本語'},failSave=false;
 const defaults={juxtaposition:2,cut_strength:2,ambiguity:2,concreteness:3};
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request();
  if(new URL(request.url()).pathname==='/api/settings'){
   if(request.method()==='PUT'){
    const input=request.postDataJSON();puts.push(input);
    if(failSave){await route.fulfill({status:503,json:{error:'Try again'}});return;}
    saved={...saved,...input};
   }
   await route.fulfill({json:{settings:saved}});return;
  }
  await route.fulfill({json:{records:[],nextCursor:null}});
 });
 const openSettings=async()=>{await page.locator('nav [data-go=setting]').click();await page.locator('#save-settings:not([disabled])').waitFor();};
 const values=()=>page.locator('.parameter-settings select').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.name,Number(node.value)])));
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:'+server.address().port);
 await openSettings();assert.deepEqual(await values(),defaults);
 assert.equal(await page.locator('.parameter-settings select').count(),4);
 for(const key of Object.keys(defaults)){
  const control=page.locator('#parameter-'+key);
  assert.equal(await control.getAttribute('aria-describedby'),'parameter-'+key+'-description parameter-'+key+'-value');
  assert.deepEqual(await control.locator('option').allTextContents(),['0','1','2','3','4']);
 }
 await page.locator('#parameter-juxtaposition').focus();await page.keyboard.press('Tab');
 assert.equal(await page.locator('#parameter-cut_strength').evaluate(node=>node===document.activeElement),true);
 await page.locator('#parameter-juxtaposition').selectOption('0');
 await page.locator('#parameter-cut_strength').selectOption('4');
 await page.locator('#parameter-ambiguity').selectOption('0');
 await page.locator('#parameter-concreteness').selectOption('4');
 assert.match(await page.locator('#parameter-cut_strength-value').innerText(),/離れた二つの部分/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('#save-settings').click();await page.locator('#toast').filter({hasText:'設定を保存しました'}).waitFor();
 const edited={juxtaposition:0,cut_strength:4,ambiguity:0,concreteness:4};
 assert.deepEqual(puts.at(-1).parameters,edited);
 assert.ok(Object.values(puts.at(-1).parameters).every(Number.isInteger));
 await page.reload();await openSettings();assert.deepEqual(await values(),edited);
 await page.locator('#reset-parameters').click();assert.deepEqual(await values(),defaults);assert.equal(puts.length,1);
 await page.reload();await openSettings();assert.deepEqual(await values(),edited);
 failSave=true;await page.locator('#parameter-ambiguity').selectOption('4');await page.locator('#save-settings').click();
 await page.locator('#settings-status').filter({hasText:'設定を保存できませんでした'}).waitFor();
 assert.equal(await page.locator('#parameter-ambiguity').inputValue(),'4');assert.equal(await page.locator('#save-settings').isEnabled(),true);
 failSave=false;await page.locator('#app-language').selectOption('English');await page.locator('#save-settings').click();
 await page.locator('#parameter-heading').filter({hasText:'Haiku generation parameters'}).waitFor();
 assert.equal(await page.getByLabel('Juxtaposition',{exact:true}).count(),1);
 assert.equal(await page.getByLabel('Cut strength',{exact:true}).count(),1);
 assert.equal(await page.getByLabel('Ambiguity',{exact:true}).count(),1);
 assert.equal(await page.getByLabel('Concreteness',{exact:true}).count(),1);
 assert.match(await page.locator('#parameter-ambiguity-value').innerText(),/Substantial interpretive space/);
 await page.locator('#parameter-juxtaposition').selectOption('4');assert.match(await page.locator('#parameter-juxtaposition-value').innerText(),/grounded in your scene/);
 await page.locator('#parameter-concreteness').selectOption('0');assert.equal(await page.locator('#parameter-concreteness-value').innerText(),'Abstract language may dominate.');
 await page.getByRole('button',{name:'Reset parameters to defaults'}).click();assert.deepEqual(await values(),defaults);assert.equal(puts.length,3);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 console.log('PASS haiku settings: old defaults, numeric save, persistence, form-only reset, failure retention, bilingual descriptions, keyboard, 320px. Production screen with mocked API.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
