'use client';

import {useEffect,useId,useRef,useState} from 'react';
import Image from 'next/image';
import {browserPhoto} from './browser-assets';
import {z} from 'zod';

const translationSchema=z.object({translation:z.object({title:z.string().min(1),lines:z.tuple([z.string().min(1),z.string().min(1),z.string().min(1)]),keyTerms:z.array(z.object({term:z.string().min(1),meaning:z.string().min(1)})).min(1).max(3),nuance:z.string().min(1)})});
type Translation=z.infer<typeof translationSchema>['translation'];
type TranslationState={kind:'idle'}|{kind:'loading'}|{kind:'ready';value:Translation}|{kind:'error'};
type Face='poem'|'translation'|'scene';
const translations=new Map<string,Translation>();
const pending=new Map<string,Promise<Translation>>();
function loadTranslation(key:string,poem:string){
  const existing=pending.get(key);if(existing)return existing;
  const request=(async()=>{
    const response=await fetch('/api/haiku/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Haiku',lines:poem.trim().split(/\r?\n/).map(line=>line.trim())})});
    if(!response.ok)throw Error('Translation failed');
    const value=translationSchema.parse(await response.json()).translation;
    translations.set(key,value);return value;
  })().finally(()=>pending.delete(key));
  pending.set(key,request);return request;
}
export default function HaikuCard({record,english,username,date,onRecompose}:{record:{id:string;haiku_text:string;scene_text:string;photo_ids:string[]};english:boolean;username:string;date:string;onRecompose:()=>void}){
  const contentId=useId();
  const [face,setFace]=useState<Face>('poem');
  const key=JSON.stringify([record.id,record.haiku_text,english?'English':'日本語']);
  const [translation,setTranslation]=useState<TranslationState>(()=>{const value=translations.get(key);return value?{kind:'ready',value}:{kind:'idle'};});
  const [gallery,setGallery]=useState<number|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  const alive=useRef(true);
  const text=(ja:string,en:string)=>english?en:ja;
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;};},[]);
  useEffect(()=>{if(gallery!==null&&!dialog.current?.open)dialog.current?.showModal();},[gallery]);
  const translate=()=>{
    setTranslation({kind:'loading'});
    void loadTranslation(key,record.haiku_text).then(value=>{if(alive.current)setTranslation({kind:'ready',value});},()=>{if(alive.current)setTranslation({kind:'error'});});
  };
  const cycle=()=>{if(face==='poem'){setFace('translation');if(translation.kind==='idle')translate();}else setFace(face==='translation'?'scene':'poem');};
  const close=()=>{dialog.current?.close();setGallery(null);};
  const move=(step:number)=>setGallery(index=>index===null?null:(index+step+record.photo_ids.length)%record.photo_ids.length);
  return <>
    <div className="haiku-card" data-card-face={face} role="button" tabIndex={0} aria-describedby={contentId} aria-label={text('Haikuカード。タップして翻訳、情景、原文を切り替える','Haiku card. Tap to cycle translation, scene, and poem')} onClick={cycle} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();cycle();}}}>
      {face==='poem'?<div id={contentId}><p className="haiku-poem">{record.haiku_text}</p><p className="haiku-byline">– {username||text('あなた','You')}<br/>– {date}</p></div>:face==='translation'?<div id={contentId} className="haiku-translation" aria-live="polite">
        {translation.kind==='ready'?<><p className="haiku-poem">{translation.value.lines.join('\n')}</p><div className="translation-notes"><h2>{text('ことば','Key words')}</h2>{translation.value.keyTerms.map(term=><p key={term.term}><strong>{term.term}</strong><br/>{term.meaning}</p>)}<h2>{text('訳のニュアンス','Translation nuance')}</h2><p>{translation.value.nuance}</p></div></>:translation.kind==='error'?<div role="alert"><p>{text('翻訳できませんでした。もう一度お試しください。','Could not translate. Please try again.')}</p><button className="secondary" onClick={event=>{event.stopPropagation();translate();}}>{text('もう一度試す','Try again')}</button></div>:<p role="status">{text('翻訳中…','Translating…')}</p>}
      </div>:<div id={contentId} className="haiku-scene"><p>{record.scene_text||text('情景は記録されていません。','No scene was recorded.')}</p>{record.photo_ids.length>0&&<div className="haiku-thumbnails">{record.photo_ids.map((id,index)=><button key={id} aria-label={text(`写真${index+1}を拡大`,`Enlarge photo ${index+1}`)} onClick={event=>{event.stopPropagation();setGallery(index);}}><Image unoptimized width={120} height={120} src={browserPhoto(id)} alt={text(`情景の写真${index+1}`,`Scene photo ${index+1}`)}/></button>)}</div>}</div>}
      <div className="haiku-card-pages" aria-hidden="true">{(['poem','translation','scene'] satisfies Face[]).map(page=><span key={page} data-active={page===face}/>)}</div>
    </div>
    <button className="recompose back" onClick={onRecompose}>{text('作句しなおす','Compose again')}</button>
    <dialog ref={dialog} className="photo-gallery" aria-label={text('写真ギャラリー','Photo gallery')} onCancel={()=>setGallery(null)} onClose={()=>setGallery(null)} onClick={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}}}>
      <div className="gallery-toolbar"><span aria-live="polite">{gallery===null?'':`${gallery+1} / ${record.photo_ids.length}`}</span><button autoFocus aria-label={text('閉じる','Close')} onClick={close}>×</button></div>
      {gallery!==null&&record.photo_ids[gallery]&&<Image unoptimized width={1400} height={1400} src={browserPhoto(record.photo_ids[gallery])} alt={text(`情景の写真${gallery+1}`,`Scene photo ${gallery+1}`)}/>}
      {record.photo_ids.length>1&&<div className="gallery-navigation"><button aria-label={text('前の写真','Previous photo')} onClick={()=>move(-1)}>←</button><button aria-label={text('次の写真','Next photo')} onClick={()=>move(1)}>→</button></div>}
    </dialog>
  </>;
}
