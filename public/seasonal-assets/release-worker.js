import {parseManifest} from './poc-loader.js';
const PREFIX = 'sakku-seasonal-release-', META = PREFIX + 'selection-v1';
const ROOT = new URL('/seasonal-assets/', self.location.origin);
const shell = ['release-review.html', 'release-review.js', 'poc-loader.js', 'offline-home.html', 'offline-home.js', 'seasonal-art-runtime.js', 'offline-calendar.json'];
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value => value.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event => event.waitUntil(self.clients.claim()));
let preparing;
async function selected() {
  const meta = await caches.open(META);
  const response = await meta.match(new URL('offline-selection',ROOT));
  return response ? response.json() : null;
}
async function prepare() {
  const pointerResponse = await fetch(new URL('current.json',ROOT),{cache:'no-store'});
  if (!pointerResponse.ok) throw Error('pointer');
  const pointer = await pointerResponse.clone().json();
  if (pointer.schemaVersion !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(pointer.version) || pointer.manifest !== `releases/${pointer.version}/manifest.json` || !/^[a-f0-9]{64}$/.test(pointer.sha256)) throw Error('pointer');
  const manifestResponse = await fetch(new URL(pointer.manifest,ROOT),{cache:'no-store'});
  if (!manifestResponse.ok) throw Error('manifest');
  const bytes = await manifestResponse.clone().arrayBuffer();
  if (await hash(bytes) !== pointer.sha256) throw Error('hash');
  const manifest = await manifestResponse.json();
  if (manifest.schemaVersion !== 2 || manifest.status !== 'approved' || manifest.version !== pointer.version) throw Error('manifest');
  parseManifest(manifest,new URL(pointer.manifest,ROOT).href);
  const previous = await selected();
  const previousCache = previous ? await caches.open(previous.name) : null;
  // Each scope prepares privately; concurrent root/assets workers cannot delete or mutate one another's selected cache.
  const name = PREFIX + pointer.version + '-' + pointer.sha256 + '-' + crypto.randomUUID();
  const cache = await caches.open(name);
  try {
    await cache.put(new URL(pointer.manifest,ROOT),new Response(bytes,{headers:{'Content-Type':'application/json'}}));
    await cache.put(new URL('current.json',ROOT),pointerResponse);
    for (const file of shell) {
      const url = new URL(file,ROOT), response = await fetch(url,{cache:'reload'});
      if (!response.ok) throw Error('shell');
      if (file === 'offline-calendar.json') {
        const calendar = await response.clone().json();
        if (calendar.timeZone !== 'Asia/Tokyo' || !Array.isArray(calendar.years) || !calendar.years.length || calendar.years.some(year => year.entries?.length !== 72)) throw Error('calendar');
      }
      await cache.put(url,response);
    }
    const jobs = [];
    for (const asset of manifest.assets) {
      for (const state of ['initial','completed','idle','transition']) {
        jobs.push({url:new URL('releases/' + pointer.version + '/' + asset[state],ROOT),sha:asset.hashes[state],optional:state==='transition'});
      }
    }
    let next = 0;
    await Promise.all(Array.from({length:4},async () => {
      while (next < jobs.length) {
        const job = jobs[next++], existing = previousCache ? await previousCache.match(job.url) : null;
        if (existing && await hash(await existing.clone().arrayBuffer()) === job.sha) {
          await cache.put(job.url,existing);
          continue;
        }
        if(job.optional)continue;
        const response = await fetch(job.url);
        if (!response.ok || await hash(await response.clone().arrayBuffer()) !== job.sha) throw Error('asset');
        await cache.put(job.url,response);
      }
    }));
    const meta = await caches.open(META);
    await meta.put(new URL('offline-selection',ROOT),Response.json({name,version:pointer.version}));
    if (self.navigator.locks) {
      const obsolete=(await caches.keys()).filter(key=>key.startsWith(PREFIX)&&key!==META&&key!==name&&key!==previous?.name);
      await Promise.allSettled(obsolete.map(key=>caches.delete(key)));
    }
    return pointer.version;
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
}
self.addEventListener('message',event => {
  if (event.data?.type !== 'prepare-current') return;
  preparing ??= (self.navigator.locks ? self.navigator.locks.request(PREFIX+'prepare',prepare) : prepare()).finally(() => {preparing=null;});
  event.waitUntil(preparing.then(version => event.source?.postMessage({type:'offline-ready',version})).catch(() => event.source?.postMessage({type:'offline-error'})));
});
self.addEventListener('fetch',event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== ROOT.origin) return;
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith((async () => {
      try { return await fetch(event.request); }
      catch {
        const selection = await selected();
        const cache = selection ? await caches.open(selection.name) : null;
        return cache && await cache.match(new URL('offline-home.html',ROOT)) || Response.error();
      }
    })());
    return;
  }
  if (!url.pathname.startsWith(ROOT.pathname)) return;
  const relative = url.pathname.slice(ROOT.pathname.length);
  if (relative !== 'current.json' && !shell.includes(relative) && !relative.startsWith('releases/')) return;
  event.respondWith((async () => {
    const selection = await selected();
    const cache = selection ? await caches.open(selection.name) : null;
    const cached = cache ? await cache.match(event.request) : null;
    if (relative === 'current.json') {
      try {const response=await fetch(event.request);if(response.ok)return response;}catch{}
      return cached || Response.error();
    }
    if (cached) return cached;
    try {
      const response=await fetch(event.request);
      if(response.ok&&cache&&!url.search&&relative.startsWith(`releases/${selection.version}/`)){
        const manifestResponse=await cache.match(new URL(`releases/${selection.version}/manifest.json`,ROOT));
        const manifest=manifestResponse?await manifestResponse.json():null;
        const file=relative.slice(`releases/${selection.version}/`.length);
        const asset=manifest?.assets.find(asset=>asset.transition===file);
        if(asset){
          if(await hash(await response.clone().arrayBuffer())!==asset.hashes.transition)return Response.error();
          await cache.put(event.request,response.clone());
        }
      }
      return response;
    }catch{return Response.error();}
  })());
});
