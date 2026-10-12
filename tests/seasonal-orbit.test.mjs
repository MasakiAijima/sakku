import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seasonalOrbit,seasonalYear,nextOrbitBoundary} from '../.sites-runtime/test-lib/shared/seasonal-orbit.js';
import {watchSeasonalOrbit} from '../.sites-runtime/test-lib/shared/seasonal-orbit-browser.js';

// Synthetic fixture only. Dates and IDs are not an adopted Japanese calendar.
function fixture(year=2024) {
  const kou=Array.from({length:72},(_,i)=>({id:`test-${i+1}`,order:i+1,sekkiId:`test-sekki-${Math.floor(i/3)+1}`,position:i%3+1}));
  const start=Date.parse(`${year}-02-04T00:00:00Z`);
  const end=Date.parse(`${year+1}-02-04T00:00:00Z`);
  const entries=kou.map((item,i)=>({kouId:item.id,date:new Date(start+Math.floor((end-start)/86400000*i/72)*86400000).toISOString().slice(0,10)}));
  return {version:'test-calendar-v1',timeZone:'Asia/Tokyo',master:{version:'test-only-v1',risshunId:'test-1',kou},years:[{year,masterVersion:'test-only-v1',entries,nextRisshunDate:`${year+1}-02-04`}]};
}
const orbit=(calendar,instant,year=2024)=>seasonalOrbit({calendar,year,now:new Date(instant)});
test('72 ordered IDs are retained independent of entry and master array ordering',()=>{
  const calendar=fixture(); calendar.master.kou.reverse(); calendar.years[0].entries.reverse();
  const result=orbit(calendar,'2024-02-03T15:00:00Z');
  assert.equal(result.kind,'ready');
  assert.deepEqual(result.slots.map(slot=>slot.id),Array.from({length:72},(_,i)=>`test-${i+1}`));
  assert.deepEqual(result.slots.map(slot=>slot.kind),['current',...Array(71).fill('upcoming')]);
  assert.equal(result.slots[0].completed,true);
  assert.equal(result.slots[1].completed,false);
});
test('local midnight transitions use half-open intervals',()=>{
  const calendar=fixture(),date=calendar.years[0].entries[1].date;
  const boundary=Date.parse(`${date}T00:00:00+09:00`);
  const before=orbit(calendar,new Date(boundary-1));
  const at=orbit(calendar,new Date(boundary));
  assert.equal(before.slots[0].kind,'current'); assert.equal(before.slots[1].kind,'upcoming');
  assert.equal(at.slots[0].kind,'visited'); assert.equal(at.slots[1].kind,'current');
  assert.equal(nextOrbitBoundary({orbit:before,now:new Date(boundary-1)}),boundary);
});
test('February start, prior year, leap day and January follow actual dates',()=>{
  const calendar=fixture(); calendar.years.push(...fixture(2023).years);
  assert.equal(seasonalYear({calendar,now:new Date('2024-02-03T14:59:59Z')}),2023);
  assert.equal(seasonalYear({calendar,now:new Date('2024-02-03T15:00:00Z')}),2024);
  for (const instant of ['2024-02-29T00:00:00Z','2025-01-01T00:00:00Z']) {
    assert.equal(seasonalYear({calendar,now:new Date(instant)}),2024);
    assert.equal(orbit(calendar,instant).slots.filter(slot=>slot.kind==='current').length,1);
  }
  assert.ok(orbit(calendar,'2025-02-03T15:00:00Z').slots.every(slot=>slot.kind==='visited'&&slot.completed));
  assert.ok(orbit(calendar,'2024-02-03T14:59:59Z').slots.every(slot=>slot.kind==='upcoming'&&!slot.completed));
});
test('clock instant and configured TZ matter; host TZ and records do not',()=>{
  const calendar=fixture(); const old=process.env.TZ;
  try {
    process.env.TZ='Pacific/Honolulu'; const a=orbit(calendar,'2024-02-03T15:00:00Z');
    process.env.TZ='Europe/London'; assert.deepEqual(orbit(calendar,'2024-02-03T15:00:00Z'),a);
    assert.notDeepEqual(orbit(calendar,'2024-02-03T14:59:59Z'),a);
    assert.equal(orbit({...calendar,timeZone:'UTC'},'2024-02-03T15:00:00Z').slots[0].kind,'upcoming');
    assert.deepEqual(orbit({...calendar,records:[{haiku:'anything'}],diaryTimeZone:'UTC'},'2024-02-03T15:00:00Z'),a);
  } finally {if(old===undefined) delete process.env.TZ; else process.env.TZ=old;}
});
test('invalid or missing data never creates approximate slots',()=>{
  for (const mutate of [
    c=>{c.years[0].entries.pop();}, c=>{c.years[0].entries[1].kouId='unknown';}, c=>{c.years[0].entries[1].kouId=c.years[0].entries[0].kouId;}, c=>{c.years[0].entries[0].date='0000-02-04';}, c=>{delete c.version;}, c=>{c.years[0].entries[1].date=c.years[0].entries[0].date;},
    c=>{c.years[0].entries[0].date='2024-02-30';}, c=>{delete c.years[0].nextRisshunDate;},
    c=>{c.master.kou[1].id=c.master.kou[0].id;},c=>{c.master.kou[1].order=1;},
    c=>{c.master.kou[1].position=3;},c=>{c.master.risshunId='absent';},c=>{c.timeZone='invalid';},
    c=>{c.years[0].entries[71].date='2025-02-05';}, c=>{c.years.push(c.years[0]);},
  ]) {const calendar=fixture();mutate(calendar);assert.equal(orbit(calendar,'2024-05-01T00:00:00Z').kind,'unavailable');}
  const calendar=fixture();calendar.years[0].masterVersion='missing-version';
  assert.equal(orbit(calendar,'2024-05-01T00:00:00Z').reason,'version-mismatch');
  assert.equal(orbit(fixture(),'2024-05-01T00:00:00Z',2022).reason,'missing-year');
  assert.equal(orbit(fixture(),'bad').reason,'invalid-instant');
  assert.equal(orbit(fixture(),'2024-05-01T00:00:00Z',NaN).reason,'invalid-year');
  assert.equal(seasonalYear({calendar:fixture(),now:new Date('2024-01-01T00:00:00Z')}),null);
});
test('unsupported calendar zones and historical Tokyo data are unavailable',()=>{
  for (const timeZone of ['America/New_York','America/Goose_Bay']) {
    assert.equal(orbit({...fixture(),timeZone},'2024-03-14T23:00:00Z').kind,'unavailable');
  }
  assert.equal(seasonalOrbit({calendar:{...fixture(1988),timeZone:'America/Goose_Bay'},year:1988,now:new Date('1988-10-30T01:59:59Z')}).kind,'unavailable');
  assert.equal(seasonalOrbit({calendar:fixture(1951),year:1951,now:new Date('1951-02-04T00:00:00Z')}).kind,'unavailable');
  assert.ok(orbit(fixture(),'2030-01-01T00:00:00Z').slots.every(slot=>slot.completed));
});
test('browser adapter advances state on boundary and resume, then removes work',context=>{
  context.mock.timers.enable({apis:['Date'], now:Date.parse('2024-02-03T14:59:59Z')});
  const events=new EventTarget(),document=new EventTarget(),timers=new Map();let next=0;
  const host={document,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++next,fn);return next;}};
  const calls=[];const calendar=fixture();
  const stop=watchSeasonalOrbit({calendar,year:calendar.years[0].year,window:host,onChange:value=>calls.push(value)});
  assert.equal(calls.length,1); assert.equal(timers.size,1);
  assert.deepEqual(calls.at(-1).slots.slice(0,2).map(({kind,completed})=>({kind,completed})),[{kind:'upcoming',completed:false},{kind:'upcoming',completed:false}]);
  context.mock.timers.setTime(Date.parse('2024-02-03T15:00:00Z'));
  [...timers.values()][0]();
  assert.equal(calls.at(-1).slots[0].kind,'current');assert.equal(calls.at(-1).slots[0].completed,true);
  context.mock.timers.setTime(Date.parse(`${calendar.years[0].entries[1].date}T00:00:00+09:00`));
  for(const event of ['pageshow','focus']) events.dispatchEvent(new Event(event));
  document.dispatchEvent(new Event('visibilitychange'));assert.equal(calls.length,5);
  assert.equal(calls.at(-1).slots[0].kind,'visited');assert.equal(calls.at(-1).slots[0].completed,true);
  assert.equal(calls.at(-1).slots[1].kind,'current');assert.equal(calls.at(-1).slots[1].completed,true);
  [...timers.values()][0]();assert.equal(calls.length,6);assert.equal(timers.size,1);
  stop();assert.equal(timers.size,0);events.dispatchEvent(new Event('focus'));assert.equal(calls.length,6);
});
test('far future boundaries schedule and inconsistent adjacent years are unavailable',()=>{
  const calendar=fixture(2030),now=new Date('2026-10-12T00:00:00Z');
  const result=seasonalOrbit({calendar,year:2030,now});
  assert.equal(nextOrbitBoundary({orbit:result,now}),Date.parse('2030-02-03T15:00:00Z'));
  calendar.years.push(...fixture(2031).years);
  calendar.years[1].entries[0].date='2031-02-05';
  assert.equal(seasonalOrbit({calendar,year:2030,now}).kind,'unavailable');
});
