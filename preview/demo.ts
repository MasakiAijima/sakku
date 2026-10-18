import {z} from 'zod';
import {haikuParametersSchema} from '../lib/haiku-prompt';
import type {RecordView} from '../shared/contracts';
import type {HaikuCandidate} from '../shared/haiku';

const recordSchema=z.object({id:z.string().uuid(),scene_text:z.string(),haiku_text:z.string(),record_date:z.string(),event_text:z.string(),emotion_text:z.string(),status:z.enum(['draft','completed']),revision:z.number().int(),photo_id:z.string(),photo_ids:z.array(z.string().uuid()),generation_job_id:z.string().nullable(),selected_candidate_index:z.number().nullable(),created_at:z.string(),updated_at:z.string()});
const settingsSchema=z.object({name:z.string(),style:z.string(),expression:z.string(),appLanguage:z.enum(['日本語','English']),language:z.literal('English').default('English'),parameters:haikuParametersSchema.default({})});
const candidateSchema=z.object({id:z.string(),title:z.string(),lines:z.tuple([z.string(),z.string(),z.string()])});
const jobSchema=z.object({id:z.string(),requestKey:z.string(),status:z.literal('succeeded'),created_at:z.string(),provider:z.literal('demo'),model:z.literal('fixed-samples'),input:z.object({sceneText:z.string()}),output:z.object({candidates:z.array(candidateSchema)})});
const stateSchema=z.object({version:z.literal(1),records:z.array(recordSchema),settings:settingsSchema,jobs:z.array(jobSchema),photos:z.record(z.string()),creates:z.record(z.string())});
type DemoState=z.infer<typeof stateSchema>;
const recordInput=z.object({sceneText:z.string().max(10000),haikuText:z.string().max(1000),recordDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),eventText:z.string().default(''),emotionText:z.string().default(''),status:z.enum(['draft','completed']),photoIds:z.array(z.string().uuid()).max(12).default([]),generationJobId:z.string().default(''),selectedCandidateIndex:z.number().int().optional(),createKey:z.string().optional(),revision:z.number().optional()});
const candidates:HaikuCandidate[]=[{id:'0',title:'A small pause',lines:['By the open window','one leaf turns in the still air','the day softens here']},{id:'1',title:'Homeward',lines:['Along the quiet road','a little warmth stays with me','past the evening light']},{id:'2',title:'After the rain',lines:['Rain leaves the branches','a clear drop holds the whole sky','before letting go']}];
const storageKey='sakku-ui-preview-v1';
function seed():DemoState {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const now=new Date().toISOString();
 const records=[today,today.slice(0,4)+'-04-15',today.slice(0,4)+'-07-20'].map((date,index)=>({id:`00000000-0000-4000-8000-00000000000${index}`,scene_text:['窓を開けると、涼しい風と遠くの鳥の声が入ってきた。','帰り道、桜の花びらが靴の先にとまった。','夕立のあと、濡れた葉が光っていた。'][index],haiku_text:candidates[index].lines.join('\n'),record_date:date,event_text:'',emotion_text:'穏やか',status:'completed',revision:1,photo_id:'',photo_ids:[],generation_job_id:null,selected_candidate_index:null,created_at:now,updated_at:now} satisfies RecordView & {photo_ids:string[]}));
 return stateSchema.parse({version:1,records,settings:{name:'Demo',style:'自由詩に近いHaiku',expression:'平易な英語に、気の利いた単語や表現をひとつ',appLanguage:'日本語'},jobs:[],photos:{},creates:{}});
}
function readState(){try{return stateSchema.parse(JSON.parse(localStorage.getItem(storageKey)||'null'));}catch{return seed();}}
let state=readState();
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{state=readState();throw Error('ブラウザに保存できませんでした。空き容量を確認するか、デモをリセットしてください。');}}
function json(value:unknown,status=200){return Response.json(value,{status});}
async function body(init?:RequestInit){if(typeof init?.body!=='string')throw Error('JSON body required');return JSON.parse(init.body);}
export function resetDemo(){localStorage.removeItem(storageKey);location.reload();}
export function installDemo(base:string){
 window.sakkuPreview={base,photoUrl:id=>state.photos[id]??''};
 const originalFetch=window.fetch.bind(window);
 window.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input),location.href);
  if(url.origin!==location.origin)throw Error('The UI demo blocks external requests');
  if(!url.pathname.startsWith('/api/')&&!url.pathname.startsWith(base+'api/'))return originalFetch(input,init);
  const path=url.pathname.startsWith(base+'api/')?'/'+url.pathname.slice(base.length):url.pathname;
  const method=init?.method??(input instanceof Request?input.method:'GET');
  try{
   if(path==='/api/settings'){
    if(method==='GET')return json({settings:state.settings});
    if(method==='PUT'){state.settings=settingsSchema.parse(await body(init));persist();return json({settings:state.settings});}
   }
   if(path==='/api/records'&&method==='GET'){
    const from=url.searchParams.get('from'),to=url.searchParams.get('to');
    const rows=state.records.filter(row=>(!from||row.record_date>=from)&&(!to||row.record_date<to)).sort((a,b)=>b.record_date.localeCompare(a.record_date)||b.id.localeCompare(a.id));
    const cursor=Number(url.searchParams.get('cursor')||0),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||20)));
    if(!Number.isInteger(cursor)||cursor<0||!Number.isInteger(limit))return json({error:'Invalid pagination'},400);
    return json({records:rows.slice(cursor,cursor+limit),nextCursor:cursor+limit<rows.length?String(cursor+limit):null});
   }
   if((path==='/api/records'&&method==='POST')||(path.startsWith('/api/records/')&&method==='PATCH')){
    const value=recordInput.parse(await body(init));
    const id=path.split('/')[3];const existing=state.records.find(row=>row.id===id);
    if(method==='PATCH'&&!existing)return json({error:'Record not found'},404);
    if(existing&&existing.revision!==value.revision)return json({error:'記録が更新されました。読み込み直してください。'},409);
    if(method==='POST'&&value.createKey&&state.creates[value.createKey])return json({record:state.records.find(row=>row.id===state.creates[value.createKey??''])});
    if(value.photoIds.some(id=>!state.photos[id]))return json({error:'写真を読み込めませんでした。'},400);
    const now=new Date().toISOString();
    const record=recordSchema.parse({id:existing?.id??crypto.randomUUID(),scene_text:value.sceneText,haiku_text:value.haikuText,record_date:value.recordDate,event_text:value.eventText,emotion_text:value.emotionText,status:value.status,revision:(existing?.revision??0)+1,photo_id:value.photoIds[0]??'',photo_ids:value.photoIds,generation_job_id:value.generationJobId||null,selected_candidate_index:value.selectedCandidateIndex??null,created_at:existing?.created_at??now,updated_at:now});
    if(existing)state.records=state.records.map(row=>row.id===record.id?record:row);else state.records.push(record);
    if(value.createKey)state.creates[value.createKey]=record.id;
    persist();return json({record});
   }
   if(path.startsWith('/api/records/')&&method==='GET'){const record=state.records.find(row=>row.id===path.split('/')[3]);return record?json({record}):json({error:'Record not found'},404);}
   if(path==='/api/haiku'&&method==='GET')return json({jobs:[...state.jobs].reverse().slice(0,50)});
   if(path==='/api/haiku'&&method==='POST'){
    const input=z.object({sceneText:z.string(),requestKey:z.string()}).parse(await body(init));
    let job=state.jobs.find(job=>job.requestKey===input.requestKey);
    if(!job){job={id:crypto.randomUUID(),requestKey:input.requestKey,status:'succeeded',created_at:new Date().toISOString(),provider:'demo',model:'fixed-samples',input:{sceneText:input.sceneText},output:{candidates}};state.jobs.push(job);persist();}
    return json({jobId:job.id,candidates:job.output.candidates});
   }
   if(path==='/api/haiku/translate'&&method==='POST'){
    const input=z.object({title:z.string(),lines:z.array(z.string()).length(3)}).parse(await body(init));
    const english=state.settings.appLanguage==='English';
    return json({translation:{title:english?input.title:'小さなひと休み',lines:english?input.lines:['開いた窓のそば','静かな風に葉がひとつ揺れ','今日がやわらいでゆく'],keyTerms:[{term:'softens',meaning:english?'becomes gentler':'やわらぐ、穏やかになる'}],nuance:english?'A fixed sample translation for trying the card.':'静かな情景を描く、動作確認用の固定訳です。'}});
   }
   if(path==='/api/photos'&&method==='POST'){
    if(!(init?.body instanceof FormData))return json({error:'Photo required'},400);
    const photo=init.body.get('photo');if(!(photo instanceof Blob))return json({error:'Photo required'},400);
    const id=crypto.randomUUID();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(Error('Invalid photo'));reader.onerror=reject;reader.readAsDataURL(photo);});
    state.photos[id]=data;persist();return json({photo:{id,url:data}});
   }
   return json({error:`Demo API does not implement ${method} ${path}`},404);
  }catch(error){return json({error:error instanceof Error?error.message:'Demo operation failed'},400);}
 };
}
