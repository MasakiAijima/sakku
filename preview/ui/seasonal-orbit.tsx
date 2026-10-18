'use client';

import {useEffect,useRef,useState} from 'react';
import {browserAsset} from './browser-assets';
import HaikuView,{displayDate,inclusiveEnd} from './haiku-view';
import {seasonalYear,type SeasonalOrbit} from '../../shared/seasonal-orbit';
import {watchSeasonalOrbit} from '../../shared/seasonal-orbit-browser';
import type {SeasonalArt} from '../../shared/seasonal-art';
import {mountSeasonalArt,type SeasonalArtController} from '../../shared/seasonal-art-runtime.js';

type KouName={id:string;name:string;reading:string;sekki:string};
const statusNames={upcoming:'未到来',current:'いまの候',visited:'訪問済み'};
export default function SeasonalOrbitView({calendar,names,art}:{calendar:unknown;names:KouName[];years:number[];art:SeasonalArt|null}) {
  const [view,setView]=useState({home:true,english:false,username:'',haikuLanguage:'English'});
  const [mode,setMode]=useState<'orbit'|'haiku'>('orbit');
  const [latestRequest,setLatestRequest]=useState(0);
  useEffect(()=>{
    const refresh=()=>setView({home:document.documentElement.dataset.sakkuScreen==='home',english:document.documentElement.dataset.sakkuLanguage==='English',username:document.documentElement.dataset.sakkuUsername??'',haikuLanguage:document.documentElement.dataset.sakkuHaikuLanguage??'English'});
    refresh();window.addEventListener('sakku-view-change',refresh);window.dispatchEvent(new Event('sakku-home-ready'));
    return ()=>window.removeEventListener('sakku-view-change',refresh);
  },[]);
  const text=(ja:string,en:string)=>view.english?en:ja;
  const year='current';
  const [orbit,setOrbit]=useState<SeasonalOrbit|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const svgRef=useRef<SVGSVGElement>(null);
  const viewportRef=useRef<HTMLDivElement>(null);
  const sceneRef=useRef<HTMLDivElement>(null);
  const switchRef=useRef<HTMLElement>(null);
  useEffect(()=>{
    const element=switchRef.current;
    if(!element)return;
    const observer=new ResizeObserver(()=>element.parentElement?.style.setProperty('--home-switch-height',`${element.getBoundingClientRect().height}px`));
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  const controller=useRef<SeasonalArtController|null>(null);
  const labels=useRef({names,english:view.english});
  useEffect(()=>{labels.current={names,english:view.english};},[names,view.english]);
  const [reducedMotion,setReducedMotion]=useState(false);
  const [visible,setVisible]=useState(true);
  const [offlineReady,setOfflineReady]=useState(false);
  const [artStatus,setArtStatus]=useState('');
  useEffect(()=>{
    if(window.sakkuPreview||!art||!('serviceWorker' in navigator))return;
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
    const instance=mountSeasonalArt({svg:svgRef.current,manifest:art,assetBase:new URL(browserAsset(`seasonal-assets/releases/${art.version}/`),location.href).href,onSelect:setSelected,onStatus:setArtStatus,label:(id,kind)=>{
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
  const current=slots.find(slot=>slot.kind==='current');
  const currentName=names.find(item=>item.id===current?.id);
  const placement=art?.assets.find(item=>item.kouId===current?.id)?.placement;
  useEffect(()=>{
    const viewport=viewportRef.current,scene=sceneRef.current,svg=svgRef.current;
    if(!viewport||!scene||!svg||!view.home||mode!=='orbit')return;
    const center=()=>{
      const width=viewport.clientWidth,height=viewport.clientHeight;
      const scale=Math.max(width,height)/250;
      scene.style.width=`${700*scale+width}px`;scene.style.height=`${700*scale+height}px`;
      svg.style.width=`${700*scale}px`;svg.style.height=`${700*scale}px`;
      svg.style.left=`${width/2}px`;svg.style.top=`${height/2}px`;
      viewport.scrollLeft=(placement?.x??350)*scale;viewport.scrollTop=(placement?.y??350)*scale;
    };
    center();const observer=new ResizeObserver(center);observer.observe(viewport);
    return ()=>observer.disconnect();
  },[current?.id,placement?.x,placement?.y,mode,view.home,art]);
  return <section hidden={!view.home} className="mobile-home" data-home-mode={mode} data-react-home="true">
    <div hidden={mode!=='orbit'} className="orbit-view" aria-label="Orbit view">
      {!orbit?<p className="home-status" role="status">{text('季節暦を読み込んでいます…','Loading the seasonal calendar…')}</p>:orbit.kind==='unavailable'?<p className="home-status" role="status">{text('現在の季節暦を利用できません。','The current seasonal calendar is unavailable.')}</p>:<>
        <div ref={viewportRef} className="orbit-viewport" tabIndex={0} role="region" aria-label={text('72候の円をスクロール','Scroll the 72 microseasons orbit')}>
          <div ref={sceneRef} className="orbit-scene" inert>
          {art?<svg ref={svgRef} className="orbit-svg" viewBox="0 0 700 700" aria-hidden="true" preserveAspectRatio="xMidYMid slice" role="group" aria-label={text(`${orbit.year}年の72候。現在は${currentName?.name??''}。`,`${orbit.year}: 72 microseasons. Current: ${currentName?.name??''}.`)}/>:<p role="status">{text('季節画像を利用できません。','Seasonal artwork is unavailable.')}</p>}
          </div>
        </div>
        {current&&currentName&&<div className="current-kou" data-current-kou={current.id}><h1><span>{currentName.sekki} {current.position===1?'初候':current.position===2?'次候':'末候'}</span>{currentName.name}</h1><p className="kou-reading">{currentName.reading}</p><p className="kou-period">{displayDate(current.startDate)} –<br/>{displayDate(inclusiveEnd(current.endDate))}</p></div>}
        {artStatus&&artStatus!=='七十二候の画像を読み込みました。'&&<p className="art-status" role="status">{text(artStatus,'Some seasonal images are unavailable.')}</p>}
      </>}
    </div>
    <div hidden={mode!=='haiku'}>{orbit?.kind==='ready'?<HaikuView slots={slots} names={names} art={art} english={view.english} username={view.username} latestRequest={latestRequest} active={mode==='haiku'&&view.home} haikuLanguage={view.haikuLanguage}/>:<p className="home-status" role="status">{!orbit?text('季節暦を読み込んでいます…','Loading the seasonal calendar…'):text('現在の季節暦を利用できません。','The current seasonal calendar is unavailable.')}</p>}</div>
    {offlineReady&&<span className="sr-only">{text('季節の表示をオフラインで利用できます。','Seasonal artwork is available offline.')}</span>}
    <nav ref={switchRef} className="home-switch" aria-label={text('表示切り替え','Switch view')}><button aria-label="Orbit view" aria-pressed={mode==='orbit'} onClick={()=>setMode('orbit')}><svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg></button><button aria-label="Haiku view" aria-pressed={mode==='haiku'} onClick={()=>{setMode('haiku');setLatestRequest(value=>value+1);}}><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><line x1="7" y1="6" x2="17" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="7" y1="18" x2="17" y2="18"/></svg></button></nav>
  </section>;
}
