import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,cp,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeCsv,parseCsv,buildCalendar,requireCoverage,canonical,validateManifest} from '../scripts/calendar-normalize.mjs';
import {classifyRecordDate,exportOrbitCalendar} from '../shared/calendar.mjs';
import {generate} from '../scripts/calendar.mjs';
const root=new URL('..',import.meta.url).pathname;
async function inputs() {
  const manifest=JSON.parse(await readFile(new URL('../data/calendar/manifest.json',import.meta.url),'utf8'));
  return {...manifest,sources:await Promise.all(manifest.sources.map(async source=>({...source,bytes:await readFile(join(root,source.path))})))};
}
test('all 96 sekki entry dates agree with NAOJ almanacs for 2024 through 2027',async()=> {
  const reference=JSON.parse(await readFile(new URL('../data/calendar/references/naoj-sekki.json',import.meta.url),'utf8'));
  const calendar=buildCalendar(await inputs());
  let count=0;
  for (const {year,entries} of reference.years) {
    for (const entry of entries) {
      const result=classifyRecordDate({date:entry.date,calendar});
      assert.equal(result.kind,'ready');
      assert.equal(result.kou.position,1,`${year} ${entry.sekki}`);
      assert.equal(result.sekki.name,entry.sekki);
      assert.equal(result.startDate,entry.date);
      count++;
    }
  }
  assert.equal(count,96);
});
test('CSV BOM, quoted commas, escaped quotes and multiline cells',()=> {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x,y","a""b\nc"\r\n'),[['a','b'],['x,y','a"b\nc']]);
  assert.throws(()=>parseCsv('a\n"broken'));
  assert.throws(()=>parseCsv('a\n"closed"extra'));
});
test('original CSV builds a deterministic complete calendar and orbit export',async()=> {
  const input=await inputs(), calendar=buildCalendar(input);
  assert.equal(canonical(buildCalendar(input)),canonical(calendar));
  assert.equal(canonical(buildCalendar({...input,sources:input.sources.map(source=>({...source,retrievedAt:'2030-01-01T00:00:00Z',receivedAt:'2030-01-01T00:00:00Z',acquisition:'manual-page-csv-export'}))})),canonical(calendar));
  assert.equal(calendar.master.kou.length,72);
  assert.equal(calendar.years.find(value=>value.year===2026).entries.length,72);
  const result=classifyRecordDate({date:'2026-01-01',calendar});
  assert.equal(result.kind,'ready'); assert.equal(result.kou.id,'kou-66'); assert.equal(result.startDate,'2025-12-31'); assert.equal(result.seasonalYear,2025); assert.equal(result.calendarYear,2026);
  assert.equal(classifyRecordDate({date:'2024-01-01',calendar}).seasonalYear,2023);
  assert.equal(classifyRecordDate({date:'2026-02-01',calendar}).seasonalYear,2025);
  const leap=classifyRecordDate({date:'2024-02-29',calendar}); assert.equal(leap.kind,'ready'); assert.equal(leap.kou.id,'kou-06');
  const year=calendar.years.find(value=>value.year===2026);
  const risshun=classifyRecordDate({date:year.entries[0].date,calendar}); assert.equal(risshun.kou.id,'kou-01'); assert.equal(risshun.seasonalYear,2026);
  assert.equal(classifyRecordDate({date:'2026-02-30',calendar}).reason,'invalid-date');
  assert.equal(classifyRecordDate({date:'2023-01-01',calendar}).reason,'missing-range');
  assert.equal(classifyRecordDate({date:'2026-01-01',calendar,version:'old'}).reason,'version-mismatch');
  assert.equal(classifyRecordDate({date:'2026-01-01',calendar:{...calendar,boundaries:[...calendar.boundaries].reverse()}}).reason,'invalid-calendar');
  assert.equal(exportOrbitCalendar(calendar).years.length,calendar.years.length);
  assert.throws(()=>requireCoverage(calendar,2027),/2028/);
});
test('overlap is deduplicated; conflicting master and missing ranges fail',async()=> {
  const input=await inputs(); const base=buildCalendar(input);
  const duplicate=buildCalendar({...input,sources:[...input.sources,input.sources[0]]});
  assert.deepEqual(duplicate.boundaries,base.boundaries);
  const bad={...input.sources[0],sha256:undefined,bytes:Buffer.from(input.sources[0].bytes.toString().replace('乃東生ず','違う候'))};
  assert.throws(()=>buildCalendar({...input,sources:[...input.sources,bad]}),/Conflicting master/);
  const firstRaw=input.sources[0].firstDate.replace(/-0?/g,'/');
  const shiftedRaw=new Date(Date.parse(input.sources[0].firstDate)+86400000).toISOString().slice(0,10).replace(/-0?/g,'/');
  const wrongDate={...input.sources[0],sha256:undefined,firstDate:undefined,bytes:Buffer.from(input.sources[0].bytes.toString().replace(firstRaw,shiftedRaw))};
  assert.throws(()=>buildCalendar({...input,sources:[...input.sources,wrongDate]}),/Missing boundary/);
  const rows=input.sources[0].bytes.toString().replace(/^\uFEFF/,'').split(/\r?\n/); rows.splice(5,1);
  assert.throws(()=>normalizeCsv(rows.join('\n')),/sequence gap/);
});
test('CLI is idempotent, checks drift and preserves pointer on validation failure',async()=> {
  const temporary=await mkdtemp(join(tmpdir(),'sakku-calendar-test-'));
  try {
    await cp(join(root,'data/calendar'),join(temporary,'data/calendar'),{recursive:true});
    const calendar=await generate({root:temporary});
    const pointer=join(temporary,'data/calendar/current.json'); const before=await readFile(pointer,'utf8'); const modified=(await stat(pointer)).mtimeMs;
    await generate({root:temporary}); await generate({root:temporary,check:true});
    assert.equal((await stat(pointer)).mtimeMs,modified);
    const manifestPath=join(temporary,'data/calendar/manifest.json'); const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    manifest.sources=manifest.sources.map(source=>({...source,retrievedAt:'2030-01-01T00:00:00Z',receivedAt:'2030-01-01T00:00:00Z'}));
    await writeFile(manifestPath,JSON.stringify(manifest)); await generate({root:temporary,check:true}); await generate({root:temporary});
    assert.equal((await stat(pointer)).mtimeMs,modified);
    manifest.coverage.seasonalYears.push(2028); await writeFile(manifestPath,JSON.stringify(manifest));
    await assert.rejects(generate({root:temporary}),/2028/); assert.equal(await readFile(pointer,'utf8'),before);
    manifest.coverage.seasonalYears.pop(); await writeFile(manifestPath,JSON.stringify(manifest));
    await writeFile(pointer,'changed'); await assert.rejects(generate({root:temporary,check:true}),/differs/);
    assert.ok(calendar.version);
  } finally { await rm(temporary,{recursive:true,force:true}); }
});

test('manifest and UTF-8 errors fail before generating data',async()=> {
  const input=await inputs();
  validateManifest(input);
  for (const field of ['sha256','rowCount','firstDate','lastDate']) {
    const source={...input.sources[0]};delete source[field];
    assert.throws(()=>validateManifest({...input,sources:[source]}),/integrity metadata/);
  }
  for (const patch of [{sourceTimeZone:'UTC'},{schemaVersion:2},{normalizerVersion:'999'},{coverage:{...input.coverage,calendarYears:[2024,2024]}},{coverage:{...input.coverage,seasonalYears:[2024,2026]}}]) assert.throws(()=>validateManifest({...input,...patch}));
  assert.throws(()=>buildCalendar({...input,sources:[{...input.sources[0],bytes:Buffer.from([0xff])}]}),/encoded data/);
  const badSources=input.sources.map(source=>({...source,sha256:undefined,bytes:Buffer.from(source.bytes.toString().replaceAll('雨水','立春'))}));
  assert.throws(()=>buildCalendar({...input,sources:badSources}),/sekki group/);
});
