import {classifyRecordDate,isDate} from '../shared/calendar.mjs';
import {createHash} from 'node:crypto';

export const NORMALIZER_VERSION = 1;
export const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index+1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field || closed) fail('Unexpected quote');
      quoted = true;
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(field); field = ''; closed = false;
      if (char !== ',') { if (row.some(Boolean)) rows.push(row); row = []; if (char === '\r' && text[index+1] === '\n') index++; }
    } else { if (closed) fail('Characters after closing quote'); field += char; }
  }
  if (quoted) fail('Unclosed quoted CSV field');
  if (field || row.length || closed) { row.push(field); rows.push(row); }
  return rows;
}
const columns = ['二十四節気','候','候(通番)','年月日','七十二候','読みの一例'];
export function normalizeCsv(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header || columns.some(name => !header.includes(name)) || new Set(header).size !== header.length) fail('Missing or duplicate CSV columns');
  let sekki = ''; let previous;
  return rows.map((row, index) => {
    if (row.length !== header.length) fail(`CSV row ${index+2}: wrong column count`);
    const get = name => row[header.indexOf(name)].trim();
    sekki = get('二十四節気') || sekki;
    const order = Number(get('候(通番)').replace(/候$/, ''));
    const phase = get('候');
    const position = ['初候','次候','末候'].indexOf(phase)+1;
    const rawDate = get('年月日');
    const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(rawDate) ?? /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(rawDate);
    const date = match ? `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}` : rawDate;
    if (!Number.isInteger(order) || order < 1 || order > 72 || !position || position !== (order-1)%3+1 || !sekki || !get('七十二候') || !get('読みの一例') || !isDate(date)) fail(`CSV row ${index+2}: invalid calendar entry`);
    const value = {id:`kou-${String(order).padStart(2,'0')}`,order,sekkiId:`sekki-${String(Math.ceil(order/3)).padStart(2,'0')}`,sekki,position,name:get('七十二候'),reading:get('読みの一例'),date};
    if (previous && (date <= previous.date || order !== previous.order%72+1)) fail(`CSV row ${index+2}: sequence gap or non-increasing date`);
    previous = value;
    return value;
  });
}
export function validateManifest(manifest) {
  if (manifest.schemaVersion !== 1 || manifest.normalizerVersion !== String(NORMALIZER_VERSION) || manifest.sourceTimeZone !== 'Asia/Tokyo') fail('Unsupported manifest schema, normalizer version or source time zone');
  if (!Array.isArray(manifest.sources) || !manifest.sources.length || manifest.sources.some(source=>!source || typeof source.path !== 'string' || !source.path.startsWith('data/calendar/raw/') || typeof source.url !== 'string')) fail('Invalid manifest sources');
  for (const source of manifest.sources) {
    if (!/^[a-f0-9]{64}$/.test(source.sha256 ?? '') || !Number.isInteger(source.rowCount) || source.rowCount < 1 || !isDate(source.firstDate) || !isDate(source.lastDate) || source.firstDate > source.lastDate) fail('Missing or invalid source integrity metadata');
  }
  validateCoverage(manifest.coverage);
}
function validateCoverage(coverage) {
  for (const name of ['calendarYears','seasonalYears']) {
    const years=coverage?.[name];
    if (!Array.isArray(years) || !years.length || years.some((year,index)=>!Number.isInteger(year) || year < 1952 || year > 9997 || (index > 0 && year !== years[index-1]+1))) fail(`Invalid ${name} coverage`);
  }
}
export function buildCalendar({sources, coverage}) {
  validateCoverage(coverage);
  if (!sources.length) fail('No calendar sources');
  const masters = new Map(), dates = new Map();
  const metadata = sources.map(({bytes, ...source}) => {
    const rows=normalizeCsv(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if (source.sha256 && source.sha256 !== sha256(bytes)) fail(`Source hash mismatch: ${source.path}`);
    if (source.rowCount !== undefined && source.rowCount !== rows.length) fail(`Source row count mismatch: ${source.path}`);
    if ((source.firstDate && source.firstDate !== rows[0]?.date) || (source.lastDate && source.lastDate !== rows.at(-1)?.date)) fail(`Source date range mismatch: ${source.path}`);
    for (const {date, ...kou} of rows) {
      if (masters.has(kou.id) && canonical(masters.get(kou.id)) !== canonical(kou)) fail(`Conflicting master ${kou.id}`);
      masters.set(kou.id,kou);
      if (dates.has(date) && dates.get(date).kouId !== kou.id) fail(`Conflicting date ${date}`);
      dates.set(date,{date,kouId:kou.id});
    }
    return {path:source.path,url:source.url,requestedYear:source.requestedYear,rowCount:rows.length,firstDate:rows[0]?.date,lastDate:rows.at(-1)?.date,sha256:sha256(bytes)};
  });
  const kou = [...masters.values()].sort((a,b)=>a.order-b.order);
  if (kou.length !== 72 || kou[0].sekki !== '立春') fail('Expected 72 kou beginning at Risshun');
  const sekkiNames='立春 雨水 啓蟄 春分 清明 穀雨 立夏 小満 芒種 夏至 小暑 大暑 立秋 処暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至 小寒 大寒'.split(' ');
  for (let index=0; index<72; index+=3) if (kou.slice(index,index+3).some(value=>value.sekki !== sekkiNames[index/3])) fail('Inconsistent sekki group or order');
  const boundaries = [...dates.values()].sort((a,b)=>a.date.localeCompare(b.date));
  for (let index=1; index<boundaries.length; index++) {
    const previous=boundaries[index-1], current=boundaries[index];
    if (Number(current.kouId.slice(4)) !== Number(previous.kouId.slice(4))%72+1) fail(`Missing boundary before ${current.date}`);
    const days=(Date.parse(current.date)-Date.parse(previous.date))/86400000;
    if (days < 4 || days > 7) fail(`Implausible boundary interval before ${current.date}`);
  }
  const master = {version:sha256(canonical(kou)),risshunId:'kou-01',kou};
  const years=[];
  for (let index=0; index<boundaries.length; index++) {
    if (boundaries[index].kouId !== 'kou-01' || boundaries[index+72]?.kouId !== 'kou-01') continue;
    if (!coverage.seasonalYears.includes(Number(boundaries[index].date.slice(0,4)))) continue;
    years.push({year:Number(boundaries[index].date.slice(0,4)),masterVersion:master.version,entries:boundaries.slice(index,index+72),nextRisshunDate:boundaries[index+72].date});
  }
  const content={normalizerVersion:NORMALIZER_VERSION,timeZone:'Asia/Tokyo',master,years,boundaries,sources:metadata,coverage};
  const calendar={version:sha256(canonical(content)),...content};
  for (const year of coverage.seasonalYears) if (!years.some(value=>value.year === year)) fail(`Missing seasonal year ${year}`);
  for (const year of coverage.calendarYears) for (const date of [`${year}-01-01`,`${year}-12-31`]) if (classifyRecordDate({date,calendar}).kind !== 'ready') fail(`Missing calendar coverage ${date}`);
  return calendar;
}
export function requireCoverage(calendar, year) {
  for (const required of [year,year+1]) {
    if (!calendar.years.some(value=>value.year === required)) fail(`Missing seasonal year ${required}`);
    for (const date of [`${required}-01-01`,`${required}-12-31`]) if (classifyRecordDate({date,calendar}).kind !== 'ready') fail(`Missing calendar coverage ${date}`);
  }
}
