import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseManifest, sourceFor} from '../public/seasonal-assets/poc-loader.js';
const url = 'https://example.test/seasonal-assets/poc-v1/manifest.json';
const entry = {kouId:'kou-01',name:'東風解凍',width:512,height:512,anchor:{x:0.5,y:0.5},initial:'kou-01/initial.png',completed:'kou-01/completed.png',transition:'kou-01/transition.webp',idle:'kou-01/idle.webp'};
const manifest = assets => ({version:'poc-v1',status:'draft',assets});
test('loads local static and animation paths with a shared anchor', () => {
  const [asset] = parseManifest(manifest([entry]),url);
  assert.equal(sourceFor({asset,state:'initial',selected:false,reducedMotion:false}),'https://example.test/seasonal-assets/poc-v1/kou-01/initial.png');
  assert.equal(sourceFor({asset,state:'idle',selected:true,reducedMotion:false}),'https://example.test/seasonal-assets/poc-v1/kou-01/idle.webp');
  for (const state of ['idle','transition']) {
    assert.equal(sourceFor({asset,state,selected:false,reducedMotion:false}),asset.urls.completed);
    assert.equal(sourceFor({asset,state,selected:true,reducedMotion:true}),asset.urls.completed);
  }
});
test('missing animations use completed image', () => {
  const [asset] = parseManifest(manifest([{...entry,idle:null,transition:undefined}]),url);
  assert.equal(sourceFor({asset,state:'transition',selected:true,reducedMotion:false}),asset.urls.completed);
  assert.equal(sourceFor({asset,state:'idle',selected:true,reducedMotion:false}),asset.urls.completed);
});
test('rejects unsafe paths, invalid dimensions, duplicate IDs and unknown manifest', () => {
  for (const path of ['../escape.png','/escape.png','https://other.test/a.png','https://example.test/seasonal-assets/poc-v1/a.png','x.png?secret=1','x.svg']) {
    assert.throws(() => parseManifest(manifest([{...entry,initial:path}]),url));
  }
  for (const patch of [{width:200},{anchor:{x:0,y:0.5}},{kouId:'kou-73'},{completed:null}]) assert.throws(() => parseManifest(manifest([{...entry,...patch}]),url));
  assert.throws(() => parseManifest(manifest([entry,entry]),url));
  assert.throws(() => parseManifest({version:'other',assets:[entry]},url));
});
