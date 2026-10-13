import {mountSeasonalArt} from '/seasonal-assets/seasonal-art-runtime.js';
import {parseManifest} from '/seasonal-assets/poc-loader.js';

const root = new URL('/seasonal-assets/', location.origin);
const status = document.querySelector('#seasonal-status');
const select = document.querySelector('#seasonal-year');
const current = document.querySelector('#seasonal-current');
const detail = document.querySelector('#seasonal-detail');
const svg = document.querySelector('#seasonal-orbit');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let art, calendar, slots = [], selected = null, timer;
let english = new URL(location.href).searchParams.get('lang') === 'en' || (!new URL(location.href).searchParams.has('lang') && navigator.language.startsWith('en'));
const words = {
 ja:{home:'接続してホームを開く',title:'季節の庭',intro:'保存した七十二候の庭を表示しています。訪れた候は季節のかたちに、これからの候は小さなきざしに。投稿や個人データはこの画面には保存していません。',year:'立春からの一年',currentYear:'現在の季節年',unavailable:'現在の季節年の暦を利用できません。表示する年を選んでください。',choose:'モチーフを選ぶと候の名前と期間を確認できます。',other:'この年の候を表示しています',failure:'保存済みの季節を読み込めません。接続してホームを開いてください。'},
 en:{home:'Open home when connected',title:'Seasonal garden',intro:'Your saved garden of 72 microseasons. Arrived seasons have their full forms; future seasons remain small signs. Posts and personal data are not saved on this screen.',year:'Year beginning at Risshun',currentYear:'Current seasonal year',unavailable:'The current seasonal year is unavailable. Choose a year to view its garden.',choose:'Select a motif to see its name and dates.',other:'Showing the selected seasonal year',failure:'The saved garden could not be loaded. Connect and open home.'}
};
const text = key => words[english ? 'en' : 'ja'][key];
const kindLabel = kind => (english ? {upcoming:'Upcoming',current:'Current',visited:'Visited'} : {upcoming:'これからの候',current:'いまの候',visited:'訪れた候'})[kind];
function translate() {
 document.documentElement.lang=english?'en':'ja';
 document.title=text('title')+(english?' · Offline':' · オフライン');
 for(const node of document.querySelectorAll('[data-i18n]')) node.textContent=text(node.dataset.i18n);
 document.querySelector('#language').textContent=english?'日本語':'English';
 const option=select.querySelector('[value=current]');if(option)option.textContent=text('currentYear');
 select.setAttribute('aria-label',text('year'));
 svg.setAttribute('aria-label',text('title'));
}
translate();
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2,'0')).join('');
async function get(url) {
  const response = await fetch(url, {cache:'no-store'});
  if (!response.ok) throw Error('読み込みに失敗しました');
  return response;
}
function validDate(value) {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10) === value;
}
function parseCalendar(value) {
  if (value?.timeZone !== 'Asia/Tokyo' || typeof value.version !== 'string' || !Array.isArray(value.master?.kou) || value.master.kou.length !== 72 || !Array.isArray(value.years) || !value.years.length) throw Error('暦が不正です');
  const master = [...value.master.kou].sort((a,b) => a.order-b.order);
  if (master.some((kou,index) => kou.id !== `kou-${String(index+1).padStart(2,'0')}` || kou.order !== index+1 || typeof kou.name !== 'string') || new Set(value.years.map(year => year.year)).size !== value.years.length) throw Error('暦が不正です');
  for (const year of value.years) {
    if (!Number.isInteger(year.year) || year.year < 1952 || year.year > 9998 || year.masterVersion !== value.master.version || !Array.isArray(year.entries) || year.entries.length !== 72 || !validDate(year.nextRisshunDate)) throw Error('暦が不正です');
    const entries = new Map(year.entries.map(entry => [entry.kouId,entry.date]));
    const dates = master.map(kou => entries.get(kou.id));
    if (entries.size !== 72 || dates.some((date,index) => !validDate(date) || date >= (dates[index+1] || year.nextRisshunDate)) || dates[0].slice(0,7) !== `${year.year}-02` || year.nextRisshunDate.slice(0,7) !== `${year.year+1}-02`) throw Error('暦が不正です');
    const next = value.years.find(item => item.year === year.year+1);
    if (next && next.entries.find(entry => entry.kouId === master[0].id)?.date !== year.nextRisshunDate) throw Error('暦が不正です');
  }
  return {...value, master:{...value.master, kou:master}};
}
function today() {
  const parts = new Intl.DateTimeFormat('en', {timeZone:calendar.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const part = kind => parts.find(item => item.type === kind).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function slotsFor(year, day) {
  const data = calendar.years.find(item => item.year === year);
  const dates = new Map(data.entries.map(entry => [entry.kouId,entry.date]));
  return calendar.master.kou.map((kou,index) => {
    const startDate = dates.get(kou.id), endDate = dates.get(calendar.master.kou[index+1]?.id) || data.nextRisshunDate;
    const kind = day < startDate ? 'upcoming' : day < endDate ? 'current' : 'visited';
    return {id:kou.id, name:kou.name, startDate, endDate, kind, completed:kind !== 'upcoming'};
  });
}
function showDetail() {
  const slot = slots.find(item => item.id === selected);
  if (!slot) {
    detail.textContent = text('choose');
    return;
  }
  const title = document.createElement('strong');
  title.textContent = `${slot.name} · ${kindLabel(slot.kind)}`;
  const dates = document.createElement('p');
  dates.textContent = english ? `${slot.startDate} to the day before ${slot.endDate}` : `${slot.startDate} から ${slot.endDate} の前日まで`;
  detail.replaceChildren(title, dates);
}
function refresh() {
  if (!art) return;
  clearTimeout(timer);
  const day=today();
  const activeYear=calendar.years.find(value=>slotsFor(value.year,day).some(slot=>slot.kind==='current'));
  const year=select.value==='current'?activeYear?.year:Number(select.value);
  if(year===undefined){
    slots=[];selected=null;art.select(null);art.update({year:0,slots:[],reducedMotion:true,visible:false});
    svg.style.display='none';svg.dataset.year='unavailable';current.textContent='';
    status.textContent=text('unavailable');showDetail();schedule();return;
  }
  svg.style.display='';
  slots = slotsFor(year,day);
  const active = slots.find(slot => slot.kind === 'current');
  current.textContent = active ? (english?`Current: ${active.name}`:`いまは ${active.name}`) : text('other');
  status.textContent=english?'Showing the saved seasonal garden.':'保存した季節の庭を表示しています。';
  art.update({year, slots, reducedMotion:motion.matches, visible:document.visibilityState !== 'hidden'});
  svg.dataset.year = String(year);
  showDetail();
  schedule();
}
function schedule() {
  // Tokyo's civil-day boundary changes actual supplied calendar intervals.
  const now = Date.now(), nextMidnight = Math.floor((now + 9*3600000)/86400000)*86400000 + 86400000 - 9*3600000;
  timer = setTimeout(refresh,Math.max(1,nextMidnight-now));
}
async function load() {
  try {
    const [pointer, data] = await Promise.all([get(new URL('current.json',root)).then(response => response.json()), get(new URL('offline-calendar.json',root)).then(response => response.json())]);
    if (pointer.schemaVersion !== 1 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(pointer.version) || pointer.manifest !== `releases/${pointer.version}/manifest.json` || !/^[a-f0-9]{64}$/.test(pointer.sha256)) throw Error('採用版が不正です');
    const manifestUrl = new URL(pointer.manifest,root);
    const bytes = await (await get(manifestUrl)).arrayBuffer();
    if (await hash(bytes) !== pointer.sha256) throw Error('採用版が不正です');
    const manifest = JSON.parse(new TextDecoder().decode(bytes));
    if (manifest.status !== 'approved' || manifest.version !== pointer.version) throw Error('採用版が不正です');
    parseManifest(manifest,manifestUrl.href);
    calendar = parseCalendar(data);
    const currentOption=document.createElement('option');currentOption.value='current';currentOption.textContent=text('currentYear');select.append(currentOption);
    for (const year of calendar.years) {
      const option = document.createElement('option');
      option.value = String(year.year);
      option.textContent = english?String(year.year):`${year.year}年`;
      select.append(option);
    }
    select.value = 'current';
    art = mountSeasonalArt({svg, manifest, assetBase:new URL('.',manifestUrl).href,
      onSelect:id => { selected=id; showDetail(); },
      onStatus:message => { status.textContent=english?(message.includes('読み込めない')?'Some artwork is unavailable; available still images are shown.':'Saved artwork loaded.'):message; },
      label:(id,kind) => `${calendar.master.kou.find(kou => kou.id === id).name} · ${kindLabel(kind)}`});
    refresh();
    await art.ready;
    refresh();
    select.disabled = false;
    document.body.dataset.ready = 'true';
    document.body.dataset.version = manifest.version;
  } catch {
    status.textContent = text('failure');
    document.body.dataset.ready = 'error';
  }
}
document.querySelector('#language').addEventListener('click',()=>{english=!english;const url=new URL(location.href);url.searchParams.set('lang',english?'en':'ja');history.replaceState(null,'',url);translate();for(const option of select.options)if(option.value!=='current')option.textContent=english?option.value:`${option.value}年`;refresh();});
select.addEventListener('change', () => { selected=null; art.select(null); refresh(); });
motion.addEventListener('change',refresh);
document.addEventListener('visibilitychange',refresh);
window.addEventListener('pageshow',refresh);
window.addEventListener('focus',refresh);
window.addEventListener('pagehide',event => {if (!event.persisted) {clearTimeout(timer);art?.dispose();}});
load();
