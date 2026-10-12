import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const manifest=JSON.parse(await readFile(new URL('../data/calendar/manifest.json',import.meta.url)));
const server=createServer(async(req,res)=>{
 if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"></head><body><header><button class="logo" data-go="home">sakku</button><nav><button data-go="home">記録</button><button data-go="setting">設定</button><a id="signout" href="/logout">ログアウト</a></nav></header><main id="app"></main><footer><span></span></footer><div id="toast"></div><script src="/screen.js"></script></body></html>');return;}
 if(req.url.startsWith('/api/')){res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/api/settings'?{settings:{name:'',style:'自由詩に近いHaiku',expression:'',appLanguage:'日本語'}}:{records:[]}));return;}
 const file=req.url==='/globals.css'?'../app/globals.css':'../public'+req.url;
 res.setHeader('content-type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(await readFile(new URL(file,import.meta.url)));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
try{
 const page=await browser.newPage({viewport:{width:320,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#period-kind').waitFor();
 await page.locator('nav [data-go=setting]').click();await page.locator('[data-go=sources]').click();
 const text=await page.locator('main').innerText();assert.match(text,/本朝七十二候・伊勢神宮略本暦準拠/);
 const years=manifest.coverage.calendarYears;assert.ok(text.includes(`暦年${years[0]}年〜${years.at(-1)}年`));assert.deepEqual(manifest.coverage.seasonalYears,years);
 assert.deepEqual(await page.locator('main a').evaluateAll(nodes=>nodes.map(n=>[n.href,n.target,n.rel])),[['https://koyomi8.com/sub/72kou.html','_blank','noopener noreferrer'],['https://eco.mtk.nao.ac.jp/koyomi/faq/24sekki.html','_blank','noopener noreferrer']]);
 for(const fontSize of ['100%','200%']){await page.addStyleTag({content:`html{font-size:${fontSize}}`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.ok(text.includes(`季節年${years[0]}年〜${years.at(-1)}年`));await page.reload();await page.locator('main h1').waitFor();assert.equal(await page.locator('main h1').innerText(),'暦の出典');await page.locator('[data-go=setting].back').click();await page.locator('#save-settings').waitFor();assert.equal(await page.locator('#save-settings').isDisabled(),false);assert.deepEqual(errors,[]);await page.locator('[data-go=sources]').click();await page.screenshot({path:'/tmp/sakku-issue11-sources-320.png',fullPage:true});
 console.log('PASS sources: settings round trip, adopted edition, manifest coverage, external links, 320px and 200% text. API fixtures.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
