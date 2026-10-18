'use client';

import {useEffect,useRef,useState} from 'react';
import {z} from 'zod';
import HaikuCard from './haiku-card';

const snapshotSchema=z.object({visible:z.boolean(),english:z.boolean(),username:z.string(),haikuLanguage:z.string(),busy:z.boolean(),error:z.string(),locked:z.boolean(),valid:z.boolean(),scene:z.string(),photos:z.array(z.string()),job:z.string(),candidates:z.array(z.object({index:z.number().int().nonnegative(),poem:z.string(),selected:z.boolean(),saved:z.boolean()}))});
type Snapshot=z.infer<typeof snapshotSchema>;
function command(detail:{kind:'publish'|'back'|'regenerate'}|{kind:'select';index:number;selected:boolean}){window.dispatchEvent(new CustomEvent('sakku-elaboration-command',{detail}));}
function Candidate({candidate,snapshot}:{candidate:Snapshot['candidates'][number];snapshot:Snapshot}){
  const element=useRef<HTMLElement>(null);
  const gesture=useRef<{x:number;y:number;pointer:number}|null>(null);
  const suppressClick=useRef(false);
  const [visible,setVisible]=useState(false);
  const english=snapshot.english;
  const disabled=snapshot.busy||snapshot.locked||!snapshot.valid;
  useEffect(()=>{
    const node=element.current;if(!node)return;
    const observer=new IntersectionObserver(entries=>setVisible(entries.some(entry=>entry.isIntersecting)),{rootMargin:'100px'});
    observer.observe(node);return ()=>observer.disconnect();
  },[]);
  return <article ref={element} className="elaboration-candidate" data-selected={candidate.selected} onPointerDown={event=>{
    suppressClick.current=false;
    if(disabled||!event.isPrimary||event.button!==0||event.target instanceof Element&&event.target.closest('button,a,input,textarea,dialog,[role="tooltip"]'))return;
    gesture.current={x:event.clientX,y:event.clientY,pointer:event.pointerId};
  }} onPointerMove={event=>{
    const start=gesture.current;if(!start||start.pointer!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.4)event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerCancel={()=>{gesture.current=null;}} onPointerUp={event=>{
    const start=gesture.current;gesture.current=null;if(!start||start.pointer!==event.pointerId)return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.4)return;
    suppressClick.current=true;command({kind:'select',index:candidate.index,selected:dx>0});
  }} onClickCapture={event=>{if(suppressClick.current){suppressClick.current=false;event.preventDefault();event.stopPropagation();}}}>
    <HaikuCard record={{id:`${snapshot.job}-${candidate.index}`,haiku_text:candidate.poem,scene_text:snapshot.scene,photo_ids:snapshot.photos}} english={english} username={snapshot.username} haikuLanguage={snapshot.haikuLanguage} active={snapshot.visible&&visible}/>
    <button className="candidate-select secondary" data-candidate={candidate.index} disabled={disabled} aria-pressed={candidate.selected} onClick={()=>command({kind:'select',index:candidate.index,selected:!candidate.selected})}>{candidate.saved?(english?'Posted':'投稿済み'):candidate.selected?(english?'✓ Selected':'✓ 選択済み'):(english?'Select':'選択する')}</button>
  </article>;
}
export default function ElaborationView(){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  useEffect(()=>{
    const receive=(event:Event)=>{if(!(event instanceof CustomEvent))return;const value=snapshotSchema.safeParse(event.detail);if(value.success)setSnapshot(value.data);};
    window.addEventListener('sakku-elaboration-state',receive);window.dispatchEvent(new Event('sakku-elaboration-ready'));
    return ()=>window.removeEventListener('sakku-elaboration-state',receive);
  },[]);
  if(!snapshot?.visible)return null;
  const english=snapshot.english;
  return <section className="elaboration-view" data-react-elaboration="true">
    <button className="compose-back" disabled={snapshot.busy||snapshot.locked} aria-label={english?'Back to scene':'情景に戻る'} onClick={()=>command({kind:'back'})}>←</button>
    <h1>{english?'Choose your haiku':'選びます'}</h1>
    <p className="elaboration-instructions">{english?'Swipe right to select, left to deselect. You can select more than one.':'右にスワイプで選択、左で解除。複数選べます。'}</p>
    {snapshot.busy&&<p role="status">{english?'Working…':'処理中…'}</p>}
    <div className="elaboration-candidates">{snapshot.candidates.map(candidate=><Candidate key={`${snapshot.job}-${candidate.index}`} candidate={candidate} snapshot={snapshot}/>)}</div>
    <p className="error" role="alert">{snapshot.error}</p>
    <button id="save" className="primary compose-submit" disabled={snapshot.busy||!snapshot.valid||!snapshot.candidates.some(candidate=>candidate.selected)} onClick={()=>command({kind:'publish'})}>{snapshot.locked?(english?'Retry remaining':'残りを投稿する'):'compose'}</button>
    <button id="regenerate" className="compose-draft" disabled={snapshot.busy||snapshot.locked} onClick={()=>command({kind:'regenerate'})}>{english?'Generate new haiku':'新しく詠む'}</button>
  </section>;
}
