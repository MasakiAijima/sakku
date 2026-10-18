'use client';

import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import Image from 'next/image';
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
type Annotation={kind:'closed'}|{kind:'open';index:number;term:string;meaning:string;top:number};
function annotatePoem(poem:string,terms:Translation['keyTerms'],render:(text:string,meaning:string,index:number)=>ReactNode){
  const pieces:ReactNode[]=[];
  const sorted=[...terms].sort((a,b)=>b.term.length-a.term.length);
  const word=(value:string)=>/[\p{L}\p{N}_]/u.test(value);
  let cursor=0,plainStart=0;
  while(cursor<poem.length){
    const term=sorted.find(item=>poem.slice(cursor,cursor+item.term.length).toLocaleLowerCase()===item.term.toLocaleLowerCase()&&(!word(item.term[0]??'')||!word(poem[cursor-1]??''))&&(!word(item.term.at(-1)??'')||!word(poem[cursor+item.term.length]??'')));
    if(!term){cursor++;continue;}
    if(cursor>plainStart)pieces.push(poem.slice(plainStart,cursor));
    pieces.push(render(poem.slice(cursor,cursor+term.term.length),term.meaning,cursor));
    cursor+=term.term.length;plainStart=cursor;
  }
  if(plainStart<poem.length)pieces.push(poem.slice(plainStart));
  return pieces;
}
export default function HaikuCard({record,english,username,haikuLanguage,active,onRecompose}:{record:{id:string;haiku_text:string;scene_text:string;photo_ids:string[]};english:boolean;username:string;haikuLanguage:string;active:boolean;onRecompose?:()=>void}){
  const contentId=useId(),tooltipId=useId();
  const [face,setFace]=useState<Face>('poem');
  const key=JSON.stringify([record.id,record.haiku_text,english?'English':'日本語']);
  const [snapshot,setSnapshot]=useState<{key:string;state:TranslationState}>(()=>{const value=translations.get(key);return {key,state:value?{kind:'ready',value}:{kind:'idle'}};});
  const cached=translations.get(key);
  const translation:TranslationState=cached?{kind:'ready',value:cached}:snapshot.key===key?snapshot.state:{kind:'idle'};
  const [retry,setRetry]=useState(0);
  const [annotation,setAnnotation]=useState<Annotation>({kind:'closed'});
  const [gallery,setGallery]=useState<number|null>(null);
  const dialog=useRef<HTMLDialogElement>(null),card=useRef<HTMLDivElement>(null);
  const text=(ja:string,en:string)=>english?en:ja;
  const sameLanguage=haikuLanguage===(english?'English':'日本語');
  const faces:Face[]=sameLanguage?['poem','scene']:['poem','translation','scene'];
  useEffect(()=>{
    if(!active)return;
    let current=true;
    const value=translations.get(key);
    if(value)return;
    void loadTranslation(key,record.haiku_text).then(value=>{if(current)setSnapshot({key,state:{kind:'ready',value}});},()=>{if(current)setSnapshot({key,state:{kind:'error'}});});
    return ()=>{current=false;};
  },[active,key,record.haiku_text,retry]);
  useEffect(()=>{if(gallery!==null&&!dialog.current?.open)dialog.current?.showModal();},[gallery]);
  useEffect(()=>{
    if(annotation.kind==='closed')return;
    const dismiss=(event:PointerEvent)=>{if(event.target instanceof Element&&!event.target.closest('.keyword-annotation,.keyword-tooltip'))setAnnotation({kind:'closed'});};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setAnnotation({kind:'closed'});}};
    document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',escape);
    return ()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',escape);};
  },[annotation.kind]);
  const translate=()=>{setSnapshot({key,state:{kind:'loading'}});setRetry(value=>value+1);};
  const cycle=()=>{setAnnotation({kind:'closed'});setFace(face==='poem'?(sameLanguage?'scene':'translation'):face==='translation'?'scene':'poem');};
  const close=()=>{dialog.current?.close();setGallery(null);};
  const move=(step:number)=>setGallery(index=>index===null?null:(index+step+record.photo_ids.length)%record.photo_ids.length);
  return <>
    <div ref={card} className="haiku-card" data-card-face={face} role="button" tabIndex={0} aria-describedby={contentId} aria-label={sameLanguage?text('Haikuカード。タップして情景、原文を切り替える','Haiku card. Tap to cycle scene and poem'):text('Haikuカード。タップして翻訳、情景、原文を切り替える','Haiku card. Tap to cycle translation, scene, and poem')} onClick={cycle} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==='Enter'||event.key===' ')){event.preventDefault();cycle();}}}>
      {face==='poem'?<div id={contentId}><p className="haiku-poem">{translation.kind==='ready'?annotatePoem(record.haiku_text,translation.value.keyTerms,(term,meaning,index)=><button key={index} className="keyword-annotation" data-term={term} aria-expanded={annotation.kind==='open'&&annotation.index===index} aria-describedby={annotation.kind==='open'&&annotation.index===index?tooltipId:undefined} onClick={event=>{event.stopPropagation();const top=event.currentTarget.getBoundingClientRect().bottom-(card.current?.getBoundingClientRect().top??0)+6;setAnnotation(value=>value.kind==='open'&&value.index===index?{kind:'closed'}:{kind:'open',index,term,meaning,top});}}>{term}</button>):record.haiku_text}</p><p className="haiku-byline">– {username||text('あなた','You')}</p>{translation.kind==='error'&&<button className="annotation-retry" onClick={event=>{event.stopPropagation();translate();}}>{text('ことばの解説を再読み込み','Retry word notes')}</button>}</div>:face==='translation'?<div id={contentId} className="haiku-translation" aria-live="polite">
        {translation.kind==='ready'?<p className="haiku-poem">{translation.value.lines.join('\n')}</p>:translation.kind==='error'?<div role="alert"><p>{text('翻訳できませんでした。もう一度お試しください。','Could not translate. Please try again.')}</p><button className="secondary" onClick={event=>{event.stopPropagation();translate();}}>{text('もう一度試す','Try again')}</button></div>:<p role="status">{text('翻訳中…','Translating…')}</p>}
      </div>:<div id={contentId} className="haiku-scene"><p>{record.scene_text||text('情景は記録されていません。','No scene was recorded.')}</p>{record.photo_ids.length>0&&<div className="haiku-thumbnails">{record.photo_ids.map((id,index)=><button key={id} aria-label={text(`写真${index+1}を拡大`,`Enlarge photo ${index+1}`)} onClick={event=>{event.stopPropagation();setGallery(index);}}><Image unoptimized width={120} height={120} src={`/api/photos/${id}`} alt={text(`情景の写真${index+1}`,`Scene photo ${index+1}`)}/></button>)}</div>}</div>}
      {annotation.kind==='open'&&face==='poem'&&<div id={tooltipId} role="tooltip" className="keyword-tooltip" style={{top:annotation.top}} onClick={event=>event.stopPropagation()}>{annotation.meaning}</div>}
      <div className="haiku-card-pages" aria-hidden="true">{faces.map(page=><span key={page} data-active={page===face}/>)}</div>
    </div>
    {onRecompose&&<button className="recompose secondary" onClick={onRecompose}>{text('作句しなおす','Compose again')}</button>}
    <dialog ref={dialog} className="photo-gallery" aria-label={text('写真ギャラリー','Photo gallery')} onCancel={()=>setGallery(null)} onClose={()=>setGallery(null)} onClick={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}}}>
      <div className="gallery-toolbar"><span aria-live="polite">{gallery===null?'':`${gallery+1} / ${record.photo_ids.length}`}</span><button autoFocus aria-label={text('閉じる','Close')} onClick={close}>×</button></div>
      {gallery!==null&&record.photo_ids[gallery]&&<Image unoptimized width={1400} height={1400} src={`/api/photos/${record.photo_ids[gallery]}`} alt={text(`情景の写真${gallery+1}`,`Scene photo ${gallery+1}`)}/>}
      {record.photo_ids.length>1&&<div className="gallery-navigation"><button aria-label={text('前の写真','Previous photo')} onClick={()=>move(-1)}>←</button><button aria-label={text('次の写真','Next photo')} onClick={()=>move(1)}>→</button></div>}
    </dialog>
  </>;
}
