'use client';

import {useEffect,useState} from 'react';
import {seasonalYear,type SeasonalOrbit} from '../shared/seasonal-orbit';
import {watchSeasonalOrbit} from '../shared/seasonal-orbit-browser';
import {orbitLayout,orderedPlacements,orbitOverlapReview} from '../shared/orbit-layout';

type KouName={id:string;name:string;reading:string;sekki:string};
const statusNames={upcoming:'未到来',current:'いまの候',visited:'訪問済み'};
const colors=['#e24733','#256aa3','#ee9b3d','#dfb82d','#599170'];
export default function SeasonalOrbitView({calendar,names,years}:{calendar:unknown;names:KouName[];years:number[]}) {
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
  const [debug,setDebug]=useState(false);
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
  const review=debug?orbitOverlapReview():[];
  return <section hidden={!view.home} className="seasonal-orbit" aria-labelledby="orbit-heading">
    <div className="orbit-heading"><div><p className="eyebrow">SEASONAL ORBIT</p><h2 id="orbit-heading">{text('季節のめぐり','Seasonal orbit')}</h2></div>
      <label>{text('季節年','Seasonal year')}<select aria-label={text('季節年','Seasonal year')} value={year} onChange={event=>setYear(event.target.value)}><option value="current">{text('現在の季節年','Current seasonal year')}</option>{years.map(value=><option key={value} value={value}>{value} · {text("立春から","from Risshun")}</option>)}</select></label></div>
    <p className="hint">{text('訪れた候は、記録の有無にかかわらず色づきます。幾何形は仮アートです。72候の完成イラストは制作待ちです。','Visited microseasons gain color whether you write or not. Geometry is provisional artwork; the 72 final illustrations are pending.')}</p>
    {!orbit?<p role="status">{text('季節暦を読み込んでいます…','Loading the seasonal calendar…')}</p>:orbit.kind==='unavailable'?<p role="status">{text('この季節年の暦を利用できません。対応する年を選択してください。','Calendar unavailable for this seasonal year. Choose a supported year.')}</p>:<>
      <svg className="orbit-svg" viewBox="0 0 600 600" role="group" aria-label={text(`${orbit.year}年の72候。候の選択には下の一覧も使えます。`,`${orbit.year}: 72 microseasons. You can also choose a microseason from the list below.`)}>
        <circle cx="300" cy="300" r="275" fill="#f0eadc"/>
        <circle cx="300" cy="300" r="220" fill="none" stroke="#d8cdbb" strokeDasharray="2 8"/>
        <text x="300" y="280" textAnchor="middle" fontSize="22" fill="#514c43">{orbit.year} · {text('季節年','seasonal year')}</text>
        <text x="300" y="315" textAnchor="middle" fontSize="16" fill="#514c43">{slots.filter(slot=>slot.completed).length} / 72 {text('候を訪問','visited')}</text>
        {orderedPlacements(orbitLayout,selected).map(placement=>{
          const slot=slots.find(value=>value.id===placement.id);
          const title=names.find(value=>value.id===placement.id);
          if(!slot||!title)return null;
          const label=`${slot.order} ${title.name}（${title.reading}） · ${title.sekki} · ${status(slot.kind)}`;
          return <g key={slot.id} data-orbit-id={slot.id} data-kind={slot.kind} data-anchor={`${placement.x},${placement.y}`} data-z={placement.staticZ}
            transform={`translate(${placement.x+placement.offsetX} ${placement.y+placement.offsetY}) scale(${placement.scale})`}
            role="button" tabIndex={slot.id===(selected??slots[0]?.id)?0:-1} aria-label={label} aria-pressed={selected===slot.id} onClick={()=>setSelected(slot.id)}
            onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelected(slot.id);}}}>
            <title>{label}</title>
            {placement.artwork.kind==='static'?<image {...placement.artworkBounds} href={slot.completed?placement.artwork.completedSrc:placement.artwork.upcomingSrc}/>:<>
              <rect {...placement.artworkBounds} rx={slot.order%3===0?placement.artworkBounds.width/2:2} fill={slot.completed?colors[(slot.order-1)%colors.length]:'#b6b5aa'} stroke={selected===slot.id?'#222':'#f0eadc'} strokeWidth={selected===slot.id?3:1}/>
              <svg {...placement.artworkBounds} viewBox="-12 -12 24 24"><path d={slot.order%2?'M-10 9 L8 -10 L10 9 Z':'M-10 -8 L10 0 L-10 10 Z'} fill={slot.completed?'#f5d35c':'#d5c9b9'} opacity=".75"/></svg>
            </>}
            {slot.kind==='current'&&<circle r="5" fill="#fff" stroke="#222"/>}
            <rect {...{x:placement.touchBounds.x,y:placement.touchBounds.y,width:placement.touchBounds.width,height:placement.touchBounds.height}} fill="transparent"/>
            {debug&&<><rect {...placement.artworkBounds} fill="none" stroke="blue"/><rect {...placement.motionBounds} fill="none" stroke="red" strokeDasharray="2 2"/><rect {...placement.touchBounds} fill="none" stroke="green"/></>}
          </g>;
        })}
      </svg>
      <label className="orbit-select-label" htmlFor="orbit-selection">{text('候を選ぶ（一覧）','Choose a microseason (list)')}</label>
      <select id="orbit-selection" value={selected??''} onChange={event=>setSelected(event.target.value||null)}><option value="">{text('72候から選択','Choose from 72 microseasons')}</option>{slots.map(slot=>{
        const title=names.find(value=>value.id===slot.id);
        return <option key={slot.id} value={slot.id}>{slot.order} · {title?.name}（{title?.reading}） · {status(slot.kind)}</option>;
      })}</select>
      <p role="status" className="orbit-detail" data-selected-id={details?.id??''}>{details&&name?`${name.name}（${name.reading}） · ${name.sekki} · ${details.startDate} → ${details.endDate} (${text("終了日を含まない","end excluded")}) · ${status(details.kind)}`:text('円環または一覧から候を選ぶと、候名と期間を表示します。','Choose a microseason on the orbit or list to see its name and dates.')}</p>
      <details><summary>{text('重なりレビュー','Overlap review')}</summary><label><input type="checkbox" checked={debug} onChange={event=>setDebug(event.target.checked)}/> {text('アート（青）・最大可動範囲（赤）・タッチ領域（緑）','Artwork (blue), maximum motion (red), touch area (green)')}</label>{debug&&<p className="hint">{text('完全遮蔽のサンプル検出:','Sampled fully occluded:')} {review.filter(item=>item.visibleSamples===0).length} · {text('最大可動範囲の重なり:','Maximum motion overlaps:')} {review.filter(item=>item.collisions.length>0).length}</p>}</details>
    </>}
  </section>;
}
