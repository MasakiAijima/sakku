import test from 'node:test';
import assert from 'node:assert/strict';
import {validDate, periodRange, recordsQuery} from '../public/archive.js';

test('day includes exactly one civil date across leap and year boundaries', () => {
  assert.deepEqual(periodRange({kind:'day',date:'2024-02-29'}), {from:'2024-02-29',to:'2024-03-01'});
  assert.deepEqual(periodRange({kind:'day',date:'2025-12-31'}), {from:'2025-12-31',to:'2026-01-01'});
  for (const date of ['2023-02-29','2024-02-30','2024-2-01','0000-01-01','9999-12-31','']) assert.throws(() => periodRange({kind:'day',date}));
  assert.equal(validDate('2024-02-29'),true);
});
test('year is Gregorian and carries into the next year', () => {
  assert.deepEqual(periodRange({kind:'year',year:'2024'}), {from:'2024-01-01',to:'2025-01-01'});
  assert.deepEqual(periodRange({kind:'year',year:'0099'}), {from:'0099-01-01',to:'0100-01-01'});
  for (const year of ['0','0000','9999','2024x','']) assert.throws(() => periodRange({kind:'year',year}));
});
test('unresolved calendar ranges require explicit valid boundaries', () => {
  for (const kind of ['kou','sekki']) {
    assert.throws(() => periodRange({kind,from:'',to:''}));
    assert.throws(() => periodRange({kind,from:'2024-02-03',to:'2024-02-03'}));
    assert.throws(() => periodRange({kind,from:'2024-03-03',to:'2024-02-03'}));
    assert.deepEqual(periodRange({kind,from:'2024-02-03',to:'2024-02-08'}), {from:'2024-02-03',to:'2024-02-08'});
  }
  assert.deepEqual(periodRange({kind:'all'}), {});
});
test('every pagination query binds the same range and encodes cursor', () => {
  const range={from:'2024-02-03',to:'2024-02-08'};
  for (const cursor of [null,'2024-02-04|abc & def']) {
    const url=new URL(recordsQuery(range,cursor),'https://example.test');
    assert.equal(url.searchParams.get('from'),range.from);
    assert.equal(url.searchParams.get('to'),range.to);
    assert.equal(url.searchParams.get('cursor'),cursor);
  }
});
