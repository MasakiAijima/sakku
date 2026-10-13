'use client';

import {useEffect,useRef,useState} from 'react';
import {seasonalYear,type SeasonalOrbit} from '../shared/seasonal-orbit';
import {watchSeasonalOrbit} from '../shared/seasonal-orbit-browser';
import type {SeasonalArt} from '../shared/seasonal-art';
import {mountSeasonalArt,type SeasonalArtController} from '../shared/seasonal-art-runtime.js';

type KouName={id:string;name:string;reading:string;sekki:string};
const statusNames={upcoming:'未到来',current:'いまの候',visited:'訪問済み'};
export default function SeasonalOrbitView({calendar,names,years,art}:{calendar:unknown;names:KouName[];years:number[];art:SeasonalArt|null}) {
  const [view,setView]=useState({home:true,english:false});
  useEffect(()=>{
    const refresh=()=>setView({home:document.documentElement.dataset.sakkuScreen==='home',english:document.documentElement.dataset.sakkuLanguage==='English'});
    refresh();window.addEventListener('sakku-view-change',refresh);
    return ()=>window.removeEventListener('sakku-view-change',refresh);
  },[]);
  const text=(ja:string,en:string)=>view.english?en:ja;
  const status=(kind:keyof typeof statusNames)=>view.english?{upcoming:'Upcoming',current:'Current',visited:'Visited'}[kind]:statusNames[kind];
  const [year,setYear]=useState('current');
  const [orbit,setOrbit]=useState<SeasonalOrbit|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const svgRef=useRef<SVGSVGElement>(null);
  const controller=useRef<SeasonalArtController|null>(null);
  const labels=useRef({names,english:view.english});
  useEffect(()=>{labels.current={names,english:view.english};},[names,view.english]);
  const [reducedMotion,setReducedMotion]=useState(false);
  const [visible,setVisible]=useState(true);
  const [offlineReady,setOfflineReady]=useState(false);
  const [artStatus,setArtStatus]=useState('');
  useEffect(()=>{
    if(!art||!('serviceWorker' in navigator))return;
    let active=true;
    const message=(event:MessageEvent)=>{if(active&&event.data?.type==='offline-ready'&&event.data.version===art.version)setOfflineReady(true);};
    navigator.serviceWorker.addEventListener('message',message);
    void navigator.serviceWorker.register('/seasonal-art-worker.js',{type:'module',scope:'/'}).then(async registration=>{
      await navigator.serviceWorker.ready;
      if(active)(registration.active??navigator.serviceWorker.controller)?.postMessage({type:'prepare-current'});
    }).catch(()=>{});
    return ()=>{active=false;navigator.serviceWorker.removeEventListener('message',message);};
  },[art]);
  useEffect(()=>{
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const refresh=()=>{setReducedMotion(media.matches);setVisible(!document.hidden);};
    refresh();media.addEventListener('change',refresh);document.addEventListener('visibilitychange',refresh);
    return ()=>{media.removeEventListener('change',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  const ready=orbit?.kind==='ready';
  useEffect(()=>{
    if(!art||!ready||!svgRef.current)return;
    const instance=mountSeasonalArt({svg:svgRef.current,manifest:art,assetBase:new URL(`/seasonal-assets/releases/${art.version}/`,location.href).href,onSelect:setSelected,onStatus:setArtStatus,label:(id,kind)=>{
      const item=labels.current.names.find(value=>value.id===id);
      const state=labels.current.english?{upcoming:'Upcoming',current:'Current',visited:'Visited'}[kind]:statusNames[kind];
      return `${Number(id.slice(4))} ${item?.name}（${item?.reading}） · ${item?.sekki} · ${state}`;
    }});
    controller.current=instance;
    return ()=>{instance.dispose();controller.current=null;};
  },[art,ready]);
  useEffect(()=>{
    if(orbit?.kind==='ready')controller.current?.update({year:orbit.year,slots:orbit.slots,reducedMotion,visible:visible&&view.home});
  },[orbit,reducedMotion,visible,view.home,view.english,art]);
  useEffect(()=>controller.current?.select(selected),[selected,ready,art]);
  useEffect(()=>{
    let stop=()=>{};
    let activeYear:number|null=null;
    function refreshYear(){
      const resolved=year==='current'?seasonalYear({calendar,now:new Date()}):Number(year);
      if(resolved===activeYear && resolved!==null)return;
      stop();activeYear=resolved;
      if(resolved===null){setOrbit({kind:'unavailable',reason:'missing-year',year:0});return;}
      stop=watchSeasonalOrbit({calendar,year:resolved,onChange:next=>{
        if(year==='current' && seasonalYear({calendar,now:new Date()})!==resolved){refreshYear();return;}
        setOrbit(next);
      }});
    }
    refreshYear();
    window.addEventListener('focus',refreshYear);
    window.addEventListener('pageshow',refreshYear);
    document.addEventListener('visibilitychange',refreshYear);
    return ()=>{stop();window.removeEventListener('focus',refreshYear);window.removeEventListener('pageshow',refreshYear);document.removeEventListener('visibilitychange',refreshYear);};
  },[calendar,year]);
  const slots=orbit?.kind==='ready'?orbit.slots:[];
  const details=slots.find(slot=>slot.id===selected);
  const name=names.find(item=>item.id===selected);

  return <section hidden={!view.home} className="seasonal-orbit" aria-labelledby="orbit-heading">
    <div className="orbit-heading"><div><p className="eyebrow">SEASONAL ORBIT</p><h2 id="orbit-heading">{text('季節のめぐり','Seasonal orbit')}</h2></div>
      <label>{text('季節年','Seasonal year')}<select aria-label={text('季節年','Seasonal year')} value={year} onChange={event=>setYear(event.target.value)}><option value="current">{text('現在の季節年','Current seasonal year')}</option>{years.map(value=><option key={value} value={value}>{value} · {text("立春から","from Risshun")}</option>)}</select></label></div>
    <p className="hint">{text('訪れた候は、記録の有無にかかわらず色づきます。これからの候はアクセントのかけらで待っています。','Microseasons gain color as they arrive, whether you write or not. Upcoming ones wait as small accents.')}</p>
    {offlineReady&&<p className="hint">{text('季節の表示をオフラインで利用できます。','Seasonal artwork is available offline.')}</p>}
    {!orbit?<p role="status">{text('季節暦を読み込んでいます…','Loading the seasonal calendar…')}</p>:orbit.kind==='unavailable'?<p role="status">{text('この季節年の暦を利用できません。対応する年を選択してください。','Calendar unavailable for this seasonal year. Choose a supported year.')}</p>:<>
      {artStatus&&artStatus!=='七十二候の画像を読み込みました。'&&<p role="status">{text(artStatus,'Some seasonal images are unavailable; showing available still artwork.')}</p>}
      <p className="orbit-progress">{slots.filter(slot=>slot.completed).length} / 72 {text('候が到来','microseasons arrived')} · {text('いまの候','Current')}: {names.find(item=>item.id===slots.find(slot=>slot.kind==='current')?.id)?.name??'—'}</p>
      {art?<svg ref={svgRef} className="orbit-svg" viewBox="0 0 700 700" role="group" aria-label={text(`${orbit.year}年の72候。候の選択には下の一覧も使えます。`,`${orbit.year}: 72 microseasons. You can also choose a microseason from the list below.`)}/>:<p role="status">{text('承認済みの季節画像を利用できません。','Approved seasonal artwork is unavailable.')}</p>}
      <label className="orbit-select-label" htmlFor="orbit-selection">{text('候を選ぶ（一覧）','Choose a microseason (list)')}</label>
      <select id="orbit-selection" value={selected??''} onChange={event=>setSelected(event.target.value||null)}><option value="">{text('72候から選択','Choose from 72 microseasons')}</option>{slots.map(slot=>{
        const title=names.find(value=>value.id===slot.id);
        return <option key={slot.id} value={slot.id}>{slot.order} · {title?.name}（{title?.reading}） · {status(slot.kind)}</option>;
      })}</select>
      <p role="status" className="orbit-detail" data-selected-id={details?.id??''}>{details&&name?`${name.name}（${name.reading}） · ${name.sekki} · ${details.startDate} → ${details.endDate} (${text("終了日を含まない","end excluded")}) · ${status(details.kind)}`:text('図または一覧から候を選ぶと、候名と期間を表示します。','Choose a microseason on the orbit or list to see its name and dates.')}</p>

    </>}
  </section>;
}
