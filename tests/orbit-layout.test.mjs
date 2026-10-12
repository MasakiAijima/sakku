import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {orbitLayout,orderedPlacements,orbitOverlapReview,worldBounds} from '../.sites-runtime/test-lib/shared/orbit-layout.js';
import {seasonalOrbit} from '../.sites-runtime/test-lib/shared/seasonal-orbit.js';
import {exportOrbitCalendar} from '../shared/calendar.mjs';
const pointer=JSON.parse(await readFile(new URL('../data/calendar/current.json',import.meta.url)));
const calendar=JSON.parse(await readFile(new URL('../'+pointer.path,import.meta.url)));
test('adopted calendar progress 0/12/42/72 preserves every anchor, ID and static layer',()=>{
 const year=calendar.years.find(value=>value.year===2026);
 const times=[year.entries[0].date+'T00:00:00Z',year.entries[11].date+'T00:00:00Z',year.entries[41].date+'T00:00:00Z',year.nextRisshunDate+'T00:00:00Z'];
 times[0]=new Date(Date.parse(times[0])-86400000).toISOString();
 for(const [index,completed] of [0,12,42,72].entries()){
  const orbit=seasonalOrbit({calendar:exportOrbitCalendar(calendar),year:2026,now:new Date(times[index])});
  assert.equal(orbit.kind,'ready');assert.equal(orbit.slots.filter(slot=>slot.completed).length,completed);
  assert.deepEqual(orbit.slots.map(slot=>slot.id),orbitLayout.map(item=>item.id));
  assert.deepEqual(orderedPlacements([...orbitLayout].reverse()),orbitLayout);
 }
 assert.equal(orbitLayout[0].angle,-135);assert.equal(orbitLayout[71].angle,220);
});
test('selection alone raises one layer; union sampling finds no complete occlusion',()=>{
 const order=orderedPlacements(orbitLayout,'kou-12');assert.equal(order.at(-1).id,'kou-12');
 assert.deepEqual(order.slice(0,-1),orbitLayout.filter(item=>item.id!=='kou-12'));
 assert.ok(orbitOverlapReview().every(value=>value.visibleSamples>0));
 assert.ok(orbitOverlapReview().some(value=>value.collisions.length>0));
 for(const item of orbitLayout){const bounds=worldBounds(item,item.motionBounds);assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=600&&bounds.y+bounds.height<=600)}
 const covered={...orbitLayout[1],x:orbitLayout[0].x,y:orbitLayout[0].y};
 assert.equal(orbitOverlapReview([orbitLayout[0],covered])[0].visibleSamples,0);
});
