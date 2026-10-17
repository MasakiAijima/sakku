'use client';

import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import Image from 'next/image';
import {browserAsset} from './browser-assets';
import HaikuCard from './haiku-card';
import type {OrbitSlot} from '../../shared/seasonal-orbit';
import type {SeasonalArt} from '../../shared/seasonal-art';

const recordSchema=z.object({id:z.string().min(1),record_date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const parsed=new Date(`${value}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;}),haiku_text:z.string(),status:z.enum(['draft','completed']),scene_text:z.string().optional().default(''),photo_id:z.union([z.string().uuid(),z.literal('')]).nullable().optional(),photo_ids:z.array(z.string().uuid()).max(12).optional()});
const pageSchema=z.object({records:z.array(recordSchema),nextCursor:z.string().nullable()});
type HaikuRecord=z.infer<typeof recordSchema>;
type Query={kind:'loading'}|{kind:'error';message:string}|{kind:'ready';records:HaikuRecord[]};
type Entry={key:string;slot:OrbitSlot;record:HaikuRecord|null};
export type HomeCommand={kind:'settings'}|{kind:'resume'}|{kind:'compose';date:string}|{kind:'recompose';id:string};
export function homeCommand(command:HomeCommand){window.dispatchEvent(new CustomEvent('sakku-home-command',{detail:command}));}
export function todayInTokyo(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(type=>parts.find(part=>part.type===type)?.value??'').join('-');}
export function inclusiveEnd(date:string){return new Date(Date.parse(`${date}T00:00:00Z`)-86400000).toISOString().slice(0,10);}
export function displayDate(date:string){const instant=new Date(`${date}T00:00:00Z`);const day=instant.getUTCDate();const ending=day%100>=11&&day%100<=13?'th':day%10===1?'st':day%10===2?'nd':day%10===3?'rd':'th';return `${day}${ending}, ${new Intl.DateTimeFormat('en',{month:'long',timeZone:'UTC'}).format(instant)}, ${instant.getUTCFullYear()}`;}

export default function HaikuView({slots,names,art,english,username,latestRequest,active,hasDraft}:{slots:OrbitSlot[];names:{id:string;name:string}[];art:SeasonalArt|null;english:boolean;username:string;latestRequest:number;active:boolean;hasDraft:boolean}){
  const [snapshot,setSnapshot]=useState<{request:string;result:Query}>({request:'',result:{kind:'loading'}});
  const [revision,setRevision]=useState(0);
  const [selection,setSelection]=useState<{key:string|null;request:number}>({key:null,request:latestRequest});
  const timeline=useRef<HTMLDivElement>(null);
  const first=slots[0]?.startDate,last=slots.at(-1)?.endDate;
  const request=`${first}/${last}/${revision}`;
  const query:Query=snapshot.request===request?snapshot.result:{kind:'loading'};
  const select=(key:string)=>setSelection({key,request:latestRequest});
  useEffect(()=>{const invalidate=()=>setRevision(value=>value+1);window.addEventListener('sakku-records-change',invalidate);return ()=>window.removeEventListener('sakku-records-change',invalidate);},[]);
  useEffect(()=>{
    if(!first||!last)return;
    const abort=new AbortController();
    async function load(){
      const records:HaikuRecord[]=[];
      const seen=new Set<string>();
      let cursor:string|null=null;
      do{
        const params=new URLSearchParams({from:first??'',to:last??''});
        if(cursor)params.set('cursor',cursor);
        const response=await fetch(`/api/records?${params}`,{signal:abort.signal,cache:'no-store'});
        if(!response.ok)throw Error('Could not load haiku');
        const page=pageSchema.parse(await response.json());
        records.push(...page.records.filter(record=>record.status==='completed'&&record.haiku_text.trim()));
        cursor=page.nextCursor;
        if(cursor&&seen.has(cursor))throw Error('Invalid pagination');
        if(cursor)seen.add(cursor);
      }while(cursor);
      records.sort((a,b)=>a.record_date.localeCompare(b.record_date)||a.id.localeCompare(b.id));
      if(!abort.signal.aborted)setSnapshot({request,result:{kind:'ready',records}});
    }
    void load().catch(()=>{if(!abort.signal.aborted)setSnapshot({request,result:{kind:'error',message:'Haikuを読み込めませんでした。'}});});
    return ()=>abort.abort();
  },[first,last,request]);
  const entries:Entry[]=query.kind==='ready'?slots.filter(slot=>slot.completed).flatMap<Entry>(slot=>{
    const matches=query.records.filter(record=>record.record_date>=slot.startDate&&record.record_date<slot.endDate);
    return matches.length?matches.map(record=>({key:record.id,slot,record})):[{key:`empty-${slot.startDate}-${slot.id}`,slot,record:null}];
  }):[];
  const entry=(selection.request===latestRequest?entries.find(value=>value.key===selection.key):undefined)??entries.at(-1);
  useEffect(()=>{if(!active)return;timeline.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'center',behavior:'auto'});},[entry?.key,active]);
  const text=(ja:string,en:string)=>english?en:ja;
  const compose=()=>{if(entry)homeCommand({kind:'compose',date:entry.slot.kind==='current'?todayInTokyo():entry.slot.startDate});};
  return <section className="haiku-view" aria-label="Haiku view">
    {query.kind==='loading'?<p className="home-status" role="status">{text('Haikuを読み込んでいます…','Loading haiku…')}</p>:query.kind==='error'?<div className="home-status" role="alert"><p>{text(query.message,'Could not load haiku.')}</p><button className="secondary" onClick={()=>setRevision(value=>value+1)}>{text('もう一度読み込む','Try again')}</button></div>:<>
      <div className="haiku-timeline" ref={timeline} aria-label={text('訪れた候のHaiku','Haiku from arrived microseasons')} onKeyDown={event=>{
        const index=entries.findIndex(value=>value.key===entry?.key);
        const next=event.key==='ArrowLeft'?index-1:event.key==='ArrowRight'?index+1:event.key==='Home'?0:event.key==='End'?entries.length-1:null;
        if(next===null)return;event.preventDefault();const target=entries[Math.max(0,Math.min(entries.length-1,next))];if(target){select(target.key);timeline.current?.querySelector<HTMLButtonElement>(`[data-entry-index="${Math.max(0,Math.min(entries.length-1,next))}"]`)?.focus();}
      }}>{entries.map((value,index)=>{
        const name=names.find(item=>item.id===value.slot.id)?.name??value.slot.id;
        const asset=art?.assets.find(item=>item.kouId===value.slot.id);
        return <button key={value.key} data-entry-index={index} data-kou-id={value.slot.id} data-record-id={value.record?.id??''} aria-pressed={value.key===entry?.key} aria-label={`${name}${value.record?` · ${value.record.record_date}`:text(' · Haikuなし',' · No haiku')}`} onClick={()=>select(value.key)}>{asset?<Image width={64} height={64} unoptimized src={browserAsset(`seasonal-assets/releases/${art?.version}/${asset.completed}`)} alt=""/>:<span aria-hidden="true">◯</span>}</button>;
      })}</div>
      {entry&&<div className="haiku-page" key={entry.key}>
        {entry.record?<HaikuCard key={JSON.stringify([entry.record.id,english,entry.record.haiku_text])} record={{...entry.record,photo_ids:entry.record.photo_ids??(entry.record.photo_id?[entry.record.photo_id]:[])}} english={english} username={username} date={displayDate(entry.record.record_date)} onRecompose={()=>entry.record&&homeCommand({kind:'recompose',id:entry.record.id})}/>:<button className="compose-empty" onClick={compose}><span aria-hidden="true">＋</span><span>tap to compose</span></button>}
      </div>}
      {entry&&<button className="compose-fab" aria-label={text('Haikuを書く','Compose a haiku')} onClick={compose}>＋</button>}
      {hasDraft&&<button className="resume-draft secondary" onClick={()=>homeCommand({kind:'resume'})}>{text('書きかけを続ける','Resume draft')}</button>}
    </>}
  </section>;
}
