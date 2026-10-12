import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyRecordDate} from '../../shared/calendar.mjs';
import {recordDateToday} from '../../public/archive.js';

const root = new URL('../../', import.meta.url);
const pointer = JSON.parse(await readFile(new URL('data/calendar/current.json', root), 'utf8'));
const calendar = JSON.parse(await readFile(new URL(pointer.path, root), 'utf8'));
assert.equal(calendar.version, pointer.version);
let days = 0;
for (let instant = Date.parse('2024-01-01'); instant < Date.parse('2028-01-01'); instant += 86400000) {
  const date = new Date(instant).toISOString().slice(0, 10);
  const matches = calendar.boundaries.filter((entry, index, entries) => entry.date <= date && date < entries[index + 1]?.date);
  assert.equal(matches.length, 1, date);
  const result = classifyRecordDate({date, calendar, version: pointer.version});
  assert.equal(result.kind, 'ready', date);
  assert.equal(result.kou.id, matches[0].kouId, date);
  assert.equal(result.startDate, matches[0].date, date);
  assert.equal(result.calendarYear, Number(date.slice(0, 4)), date);
  assert.equal(result.sekki.id, `sekki-${String(Math.ceil(result.kou.order / 3)).padStart(2, '0')}`, date);
  assert.ok(result.startDate <= date && date < result.endDate, date);
  days++;
}
let boundaries = 0;
for (const entry of calendar.boundaries.filter(entry => entry.date >= '2024-01-01' && entry.date < '2028-01-01')) {
  const midnight = Date.parse(`${entry.date}T00:00:00+09:00`);
  const date = recordDateToday(new Date(midnight));
  assert.equal(date, entry.date);
  assert.equal(classifyRecordDate({date, calendar}).kou.id, entry.kouId);
  const previous = recordDateToday(new Date(midnight - 1));
  if (previous >= '2024-01-01') assert.notEqual(classifyRecordDate({date: previous, calendar}).kou.id, entry.kouId);
  boundaries++;
}
for (const year of calendar.years) {
  const first = classifyRecordDate({date: year.entries[0].date, calendar});
  assert.equal(first.seasonalYear, year.year);
  assert.equal(first.kou.id, 'kou-01');
  const before = new Date(Date.parse(year.entries[0].date) - 86400000).toISOString().slice(0, 10);
  assert.equal(classifyRecordDate({date: before, calendar}).seasonalYear, year.year - 1);
}
assert.equal(classifyRecordDate({date: '2024-02-29', calendar}).kou.id, 'kou-06');
assert.equal(classifyRecordDate({date: '2026-01-01', calendar}).startDate, '2025-12-31');
assert.equal(classifyRecordDate({date: '2028-01-01', calendar}).reason, 'missing-range');
assert.equal(classifyRecordDate({date: '2026-01-01', calendar, version: 'unknown'}).reason, 'version-mismatch');
console.log(JSON.stringify({version: pointer.version, days, boundaries, seasonalYears: calendar.years.map(year => year.year)}, null, 2));
