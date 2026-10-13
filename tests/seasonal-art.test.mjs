import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {approvedSeasonalArt} from '../.sites-runtime/test-lib/shared/seasonal-art.js';
const pointer=JSON.parse(await readFile(new URL('../public/seasonal-assets/current.json',import.meta.url)));
const source=await readFile(new URL('../public/seasonal-assets/'+pointer.manifest,import.meta.url),'utf8');
const checksum=async value=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');
test('home uses the approved exact manifest with 72 saved placements and static idle',async()=>{
 const art=await approvedSeasonalArt({pointer,source});assert.ok(art);assert.equal(art.assets.length,72);
 assert.deepEqual(art.assets.map(asset=>asset.kouId),Array.from({length:72},(_,i)=>`kou-${String(i+1).padStart(2,'0')}`));
 assert.equal(art.animation.durationMs,720);assert.equal(art.animation.staggerMs,45);assert.equal(art.animation.idle,'static');
});
test('unapproved, tampered, missing, reordered and unsafe releases cannot enter the home',async()=>{
 assert.equal(await approvedSeasonalArt({pointer,source:undefined}),null);
 assert.equal(await approvedSeasonalArt({pointer,source:source+' '}),null);
 assert.equal(await approvedSeasonalArt({pointer:{...pointer,manifest:'../manifest.json'},source}),null);
 for(const change of [art=>{art.status='reviewed'},art=>art.assets.pop(),art=>art.assets.reverse(),art=>{art.assets[0].initial='../initial.png'},art=>{art.assets[0].placement.visibleCenter[0]++},art=>{art.animation.idle='sway'}]){
  const art=JSON.parse(source);change(art);const edited=JSON.stringify(art);
  assert.equal(await approvedSeasonalArt({pointer:{...pointer,sha256:await checksum(edited)},source:edited}),null);
 }
});
test('offline renderer and calendar are exact public copies of the adopted sources',async()=>{
 const publicRoot=new URL('../public/seasonal-assets/',import.meta.url);
 assert.equal(await readFile(new URL('seasonal-art-runtime.js',publicRoot),'utf8'),await readFile(new URL('../shared/seasonal-art-runtime.js',import.meta.url),'utf8'));
 const calendarPointer=JSON.parse(await readFile(new URL('../data/calendar/current.json',import.meta.url)));
 assert.deepEqual(JSON.parse(await readFile(new URL('offline-calendar.json',publicRoot))),JSON.parse(await readFile(new URL('../'+calendarPointer.path,import.meta.url))));
});
