import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {performance} from 'node:perf_hooks';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const publicRoot = resolve(process.env.POC_PUBLIC_ROOT || new URL('../public',import.meta.url).pathname);
const artifactRoot = process.env.POC_ARTIFACT_ROOT || '/tmp/sakku-poc-live';
await mkdir(artifactRoot,{recursive:true});
const server = createServer(async (request,response) => {
  try {
    const path = resolve(publicRoot,'.'+new URL(request.url,'http://localhost').pathname);
    if (!path.startsWith(publicRoot+'/')) { response.writeHead(403).end(); return; }
    const types = {'.html':'text/html','.js':'text/javascript','.json':'application/json','.png':'image/png','.webp':'image/webp'};
    response.setHeader('Content-Type',types[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
try {
  const page = await browser.newPage({viewport:{width:1100,height:850}});
  const errors = [];
  const requested = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requested.push(new URL(request.url()).pathname));
  const start = performance.now();
  await page.goto(`http://127.0.0.1:${server.address().port}/seasonal-assets/poc.html`);
  await page.locator('.asset').last().waitFor();
  assert.equal(await page.locator('.asset').count(),3);
  const decode = async () => page.locator('.asset img').evaluateAll(async images=>{
    await Promise.all(images.map(image=>image.decode()));
    return images.map(image=>({width:image.naturalWidth,height:image.naturalHeight,src:image.src}));
  });
  const initial = await decode();
  const desktopFirstLoadMs = Math.round(performance.now()-start);
  for (const image of initial) assert.deepEqual([image.width,image.height],[512,512]);
  assert.ok(initial.every(image=>image.src.endsWith('/initial.png') || image.src.endsWith('/initial.webp')));
  assert.equal(requested.filter(path=>/\/(transition|idle)\.webp$/.test(path)).length,0);
  await page.selectOption('#state','completed');
  const completed = await decode();
  for (const image of completed) assert.deepEqual([image.width,image.height],[512,512]);
  assert.ok(completed.every(image=>/\/completed\.(png|webp)$/.test(image.src)));
  const animatedSources=[];
  for (const state of ['transition','idle']) {
    const before=requested.length;
    await page.selectOption('#state',state);
    const images=await decode();
    assert.ok(images[0].src.endsWith('/'+state+'.webp'));
    assert.deepEqual(images.slice(1).map(image=>image.src),completed.slice(1).map(image=>image.src));
    const animationRequests=requested.slice(before).filter(path=>/\/(transition|idle)\.webp$/.test(path));
    assert.equal(animationRequests.length,1);
    animatedSources.push(images[0].src);
    await page.screenshot({path:`${artifactRoot}/${state}.png`,fullPage:true});
  }
  await page.locator('.asset').nth(1).click();
  const switched=await decode();
  assert.equal(switched[0].src,completed[0].src);
  assert.ok(switched[1].src.endsWith('/idle.webp'));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>[...document.images].every(image=>/\/completed\.(png|webp)$/.test(image.src)));
  assert.deepEqual((await decode()).map(image=>image.src),completed.map(image=>image.src));
  const frames = await page.evaluate(async urls=>{
    if (!('ImageDecoder' in globalThis)) return {supported:false};
    const results=[];
    for (const url of urls) {
      const decoder=new ImageDecoder({data:await (await fetch(url)).arrayBuffer(),type:'image/webp'});
      await decoder.tracks.ready;
      await decoder.completed;
      const count=decoder.tracks.selectedTrack.frameCount;
      const pixels=[];
      for (const frameIndex of [0,count-1]) {
        const {image}=await decoder.decode({frameIndex});
        const canvas=new OffscreenCanvas(image.displayWidth,image.displayHeight);
        const context=canvas.getContext('2d');
        context.drawImage(image,0,0);
        pixels.push(context.getImageData(0,0,canvas.width,canvas.height).data);
        image.close();
      }
      let changed=0;
      for(let index=0;index<pixels[0].length;index++) if(pixels[0][index]!==pixels[1][index]) changed++;
      results.push({url,frames:count,changedChannels:changed});
      decoder.close();
    }
    return {supported:true,results};
  },animatedSources);
  if(frames.supported) for(const result of frames.results) { assert.ok(result.frames>1); assert.ok(result.changedChannels>0); }
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.selectOption('#state','completed');
  await decode();
  await page.screenshot({path:`${artifactRoot}/live-review.png`,fullPage:true});
  await page.setViewportSize({width:320,height:800});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:`${artifactRoot}/live-review-mobile.png`,fullPage:true});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({desktopFirstLoadMs,measurement:'local headless desktop, cold page navigation through three initial image decodes; not a production benchmark',images:initial.length,frames,screenshots:artifactRoot},null,2));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
