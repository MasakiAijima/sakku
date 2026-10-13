import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = createServer(async (request,response) => {
  try {
    const file = new URL('../public'+request.url,import.meta.url);
    response.setHeader('Content-Type',file.pathname.endsWith('.js')?'text/javascript':'text/html');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
try {
  const page = await browser.newPage({viewport:{width:320,height:800}});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  const assets = ['01','32','54'].map(id=>({kouId:'kou-'+id,name:'検証候'+id,width:512,height:512,anchor:{x:0.5,y:0.5},initial:id+'/initial.png',completed:id+'/completed.png',transition:id+'/transition.webp',idle:id+'/idle.webp'}));
  await page.route('**/manifest.json',route=>route.fulfill({json:{version:'poc-v1',status:'draft',assets}}));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1kAAAAASUVORK5CYII=','base64');
  await page.route(/\.(png|webp)$/,route=>route.fulfill({contentType:'image/png',body:png}));
  await page.goto(`http://127.0.0.1:${server.address().port}/seasonal-assets/poc.html`);
  await page.locator('.asset').last().waitFor();
  assert.equal(await page.locator('.asset').count(),3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
  await page.selectOption('#state','idle');
  assert.deepEqual(await page.locator('.asset img').evaluateAll(nodes=>nodes.map(node=>new URL(node.src).pathname.split('/').slice(-2).join('/'))),['01/idle.webp','32/completed.png','54/completed.png']);
  await page.locator('.asset').nth(1).focus();
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.locator('.asset img').evaluateAll(nodes=>nodes.map(node=>new URL(node.src).pathname.split('/').slice(-2).join('/'))),['01/completed.png','32/idle.webp','54/completed.png']);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>[...document.images].every(image=>image.src.endsWith('/completed.png')));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.route('**/32/transition.webp',route=>route.abort());
  await page.selectOption('#state','transition');
  await page.waitForFunction(()=>document.images[1].src.endsWith('/completed.png'));
  assert.match(await page.locator('#status').innerText(),/完成静止画/);
  assert.deepEqual(errors,[]);
  console.log('PoC browser checks passed (fixture assets, 320px, selection, reduced motion, failed animation fallback)');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
