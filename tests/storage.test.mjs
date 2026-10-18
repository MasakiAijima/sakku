import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {createRecord,getRecord,listRecords,listRecordPage,updateRecord,publicRecord} from "../.sites-runtime/test-lib/lib/records.js";
import {parseRecord} from "../.sites-runtime/test-lib/lib/validation.js";
function database(){
 const sql=new DatabaseSync(":memory:");for(const file of readdirSync(new URL("../drizzle/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())sql.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
 return {sql,prepare(query){let values=[];const stmt=sql.prepare(query);return {bind(...v){values=v;return this},async run(){const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}}},async first(){return stmt.get(...values)??null},async all(){return {results:stmt.all(...values)}}}}};
}
function input(extra={}){return {createKey:crypto.randomUUID(),sceneText:"窓の雨を見ている。",haikuText:"window rain—\ntoday I have\nno words to spare",recordDate:"2026-10-11",status:"completed",...extra};}
test("完成記録には両方が必要で、空白と不正日付を拒否する",()=>{
 for(const v of [input({sceneText:"　"}),input({haikuText:""}),input({haikuText:"one\ntwo"}),input({recordDate:"2026-02-30"})])assert.throws(()=>parseRecord(v));
 assert.equal(parseRecord(input({haikuText:"",status:"draft"})).status,"draft");
});
test("保存して再読み込みし、更新版を取得できる",async()=>{
 const db=database(),r=await createRecord(db,"alice",input());
 assert.equal((await getRecord(db,"alice",r.id)).scene_text,"窓の雨を見ている。");
 const u=await updateRecord(db,"alice",r.id,input({revision:1,sceneText:"雨の音を聞いている。"}));
 assert.equal(u.revision,2);assert.equal((await listRecords(db,"alice"))[0].scene_text,"雨の音を聞いている。");db.sql.close();
});
test("他人の記録を一覧・取得・更新できない",async()=>{
 const db=database(),r=await createRecord(db,"alice",input());
 assert.equal((await listRecords(db,"bob")).length,0);
 await assert.rejects(()=>getRecord(db,"bob",r.id),e=>e.status===404);
 await assert.rejects(()=>updateRecord(db,"bob",r.id,input({revision:1})),e=>e.status===404);db.sql.close();
});
test("再送で重複を作らず、再送中の内容変更を黙って捨てない",async()=>{
 const db=database(),v=input(),a=await createRecord(db,"alice",v),b=await createRecord(db,"alice",v);
 assert.equal(a.id,b.id);assert.equal((await listRecords(db,"alice")).length,1);
 await assert.rejects(()=>createRecord(db,"alice",{...v,sceneText:"変更"}),e=>e.status===409);db.sql.close();
});
test("古い編集の上書きと、不完全な完成稿への変更を防ぐ",async()=>{
 const db=database(),r=await createRecord(db,"alice",input());
 await updateRecord(db,"alice",r.id,input({revision:1,sceneText:"新しい情景"}));
 await assert.rejects(()=>updateRecord(db,"alice",r.id,input({revision:1,sceneText:"古い情景"})),e=>e.status===409);
 await assert.rejects(()=>updateRecord(db,"alice",r.id,input({revision:2,haikuText:""})),e=>e.status===422);
 assert.equal((await getRecord(db,"alice",r.id)).scene_text,"新しい情景");db.sql.close();
});
test("DB制約も完成記録の欠落を拒否する",()=>{
 const db=database();assert.throws(()=>db.sql.prepare("INSERT INTO records(id,owner_id,create_key,scene_text,haiku_text,record_date,status,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)").run(crypto.randomUUID(),"alice",crypto.randomUUID(),"scene","","2026-10-11","completed","now","now"));db.sql.close();
});


import {parseRecordQuery} from "../.sites-runtime/test-lib/lib/record-query.js";
test("補助入力は任意、再読込可能、旧クライアントの更新でも消えない",async()=>{
 const db=database(),r=await createRecord(db,"alice",input({eventText:" 遠い空 ",emotionText:"言葉にできない"}));
 assert.equal(r.event_text," 遠い空 ");
 const u=await updateRecord(db,"alice",r.id,input({revision:1}));assert.equal(u.emotion_text,"言葉にできない");
 const cleared=await updateRecord(db,"alice",r.id,input({revision:2,eventText:"",emotionText:""}));assert.equal(cleared.event_text,"");
 assert.throws(()=>parseRecord(input({sceneText:"",eventText:"補助だけ",status:"completed"})));
 const draft=await createRecord(db,"alice",input({sceneText:"",haikuText:"",eventText:"補助だけ",status:"draft"}));assert.equal(draft.status,"draft");
 db.sql.close();
});
test("期間取得は終了日を含まず、所有者情報を返さない",async()=>{
 const db=database();for(const date of ["2025-12-31","2026-01-01","2026-12-31","2027-01-01"])await createRecord(db,"alice",input({recordDate:date}));
 await createRecord(db,"bob",input({recordDate:"2026-01-01"}));
 const page=await listRecordPage(db,"alice",parseRecordQuery(new URLSearchParams("from=2026-01-01&to=2027-01-01")));
 assert.deepEqual(page.records.map(r=>r.record_date),["2026-12-31","2026-01-01"]);assert.equal(page.nextCursor,null);
 assert.equal("owner_id" in page.records[0],false);assert.equal("create_key" in page.records[0],false);db.sql.close();
});
test("100件超・同じ日時の記録を漏れや重複なく取得できる",async()=>{
 const db=database();for(let i=0;i<105;i++)await createRecord(db,"alice",input());
 db.sql.exec("UPDATE records SET created_at='2026-10-11T00:00:00.000Z'");
 const first=await listRecordPage(db,"alice",parseRecordQuery(new URLSearchParams()));assert.equal(first.records.length,100);
 const second=await listRecordPage(db,"alice",parseRecordQuery(new URLSearchParams({cursor:first.nextCursor})));assert.equal(second.records.length,5);assert.equal(second.nextCursor,null);
 assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,105);db.sql.close();
});
test("期間変更・不正カーソル・不正日付・取得件数を拒否する",()=>{
 for(const q of ["from=2026-02-30","from=2027-01-01&to=2026-01-01","limit=0","limit=101","limit=1.5","cursor=invalid"])assert.throws(()=>parseRecordQuery(new URLSearchParams(q)));
});
test("先行版のデータを残したまま新しい列を追加できる",()=>{
 const db=new DatabaseSync(":memory:");db.exec(readFileSync(new URL("../drizzle/0000_careless_night_nurse.sql",import.meta.url),"utf8"));
 db.prepare("INSERT INTO records VALUES(?,?,?,?,?,?,?,1,?,?)").run(crypto.randomUUID(),"alice",crypto.randomUUID(),"元の情景","one\ntwo\nthree","2026-10-11","completed","now","now");
 db.exec(readFileSync(new URL("../drizzle/0001_adorable_emma_frost.sql",import.meta.url),"utf8"));const r=db.prepare("SELECT * FROM records").get();assert.equal(r.scene_text,"元の情景");assert.equal(r.event_text,"");db.close();
});

test("カーソルは期間に結びつき、他人の権限にはならない",async()=>{
 const db=database();for(let i=0;i<3;i++)await createRecord(db,"alice",input());
 const query="from=2026-01-01&to=2027-01-01&limit=1";
 const first=await listRecordPage(db,"alice",parseRecordQuery(new URLSearchParams(query)));
 const params=new URLSearchParams(query);params.set("cursor",first.nextCursor);
 assert.equal((await listRecordPage(db,"bob",parseRecordQuery(params))).records.length,0);
 params.set("from","2026-02-01");assert.throws(()=>parseRecordQuery(params));db.sql.close();
});
import {canCompleteScene,parseHaikuCandidates} from "../.sites-runtime/test-lib/shared/haiku.js";
test("生成候補は3本・各3行、欠落は補わない",()=>{
 const candidate={title:"Test title",lines:["one","two","three"]};
 assert.equal(parseHaikuCandidates([candidate,candidate,candidate]).length,3);
 for(const value of [undefined,[],[candidate], [candidate,candidate,{title:"Title",lines:["one","two"]}], [candidate,candidate,{title:"Title",lines:["one"," ","three"]}], [candidate,candidate,{title:"Title",lines:["one\nextra","two","three"]}]])assert.throws(()=>parseHaikuCandidates(value));
});
test("情景変更後は再選択するまで完成保存できない",()=>{
 assert.equal(canCompleteScene("元の情景","one\ntwo\nthree","元の情景"),true);
 assert.equal(canCompleteScene("変更した情景","one\ntwo\nthree","元の情景"),false);
 assert.equal(canCompleteScene("変更した情景","one\ntwo\nthree","変更した情景"),true);
 assert.equal(canCompleteScene("情景","",null),false);
});
import {getPreferences,savePreferences} from "../.sites-runtime/test-lib/lib/preferences.js";
import {generateHaiku,listGenerationHistory} from "../.sites-runtime/test-lib/lib/haiku-provider.js";
import {translateHaiku} from "../.sites-runtime/test-lib/lib/haiku-translation.js";
import {parsePhoto} from "../.sites-runtime/test-lib/shared/photo.js";
test("設定を本人別に保存し、他人の設定を返さない",async()=>{
 const db=database();await savePreferences(db,'alice',{name:'A',style:'自由詩に近いHaiku',expression:'simple words',appLanguage:'English'});
 assert.equal((await getPreferences(db,'alice')).appLanguage,'English');assert.equal((await getPreferences(db,'bob')).appLanguage,'日本語');
 await assert.rejects(()=>savePreferences(db,'alice',{name:'A',style:'invalid',expression:''}),e=>e.status===422);db.sql.close();
});
test("翻訳は3行・語句・ニュアンスを検証し、Groq形式を受け取る",async()=>{
 const body={title:'After Rain',lines:['a leaf lets go','one clear drop','the phone stays still'],targetLanguage:'日本語'};let request;
 const transport=async(url,init)=>{request={url,payload:JSON.parse(init.body)};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({title:'雨のあと',lines:['葉が手放す','澄んだ雫ひとつ','電話は静かなまま'],keyTerms:[{term:'lets go',meaning:'手放す'}],nuance:'ためらいを静けさとして残す。'})}}]}),{status:200})};
 const result=await translateHaiku(body,{provider:'groq',key:'fixture',model:'fixture'},transport);
 assert.equal(result.lines.length,3);assert.equal(result.keyTerms[0].term,'lets go');assert.equal(request.url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(request.payload.response_format.type,'json_schema');
});
test("翻訳は不正入力、外部失敗、不正応答を拒否する",async()=>{
 const config={provider:'groq',key:'fixture',model:'fixture'},body={title:'Title',lines:['one','two','three'],targetLanguage:'日本語'};
 await assert.rejects(()=>translateHaiku({...body,lines:['one','two']},config),e=>e.status===422);
 await assert.rejects(()=>translateHaiku(body,config,async()=>new Response('',{status:500})),e=>e.status===502);
 await assert.rejects(()=>translateHaiku(body,config,async()=>new Response(JSON.stringify({choices:[{message:{content:'{"title":"bad"}'}}]}),{status:200})),e=>e.status===502);
});
test("保存できる長い行のHaikuも省略せず翻訳できる",async()=>{
 const poem='a'.repeat(996)+'\nb\nc';
 const saved=parseRecord(input({haikuText:poem}));let submitted;
 const transport=async(_,init)=>{
  submitted=JSON.parse(init.body).messages[1].content;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({title:'訳',lines:['一','二','三'],keyTerms:[{term:'a',meaning:'説明'}],nuance:'訳語の説明'})}}]}));
 };
 const config={provider:'groq',key:'fixture',model:'fixture'};
 const result=await translateHaiku({title:'Haiku',lines:saved.haikuText.split('\n'),targetLanguage:'日本語'},config,transport);
 assert.equal(result.lines.join('\n'),'一\n二\n三');
 assert.equal(JSON.parse(submitted).lines.join('\n'),poem);
 await assert.rejects(()=>translateHaiku({title:'Haiku',lines:['a'.repeat(997),'b','c'],targetLanguage:'日本語'},config,transport),error=>error.status===422);
});
test("他人の写真を記録に紐づけられない",async()=>{
 const db=database(),photo=crypto.randomUUID();db.sql.prepare('INSERT INTO attachments(id,owner_id,object_key,mime_type,size,created_at) VALUES(?,?,?,?,?,?)').run(photo,'alice','photos/'+photo,'image/jpeg',10,'now');
 const r=await createRecord(db,'alice',input({photoId:photo}));assert.equal(r.photo_id,photo);
 await assert.rejects(()=>createRecord(db,'bob',input({photoId:photo})),e=>e.status===404);
 const u=await updateRecord(db,'alice',r.id,input({revision:1}));assert.equal(u.photo_id,photo);db.sql.close();
});
test("写真は許可したバイナリ形式のみ受け付ける",()=>{
 assert.throws(()=>parsePhoto(new Uint8Array([255,216,255])));
 assert.throws(()=>parsePhoto(new TextEncoder().encode('<svg></svg>')));
 assert.throws(()=>parsePhoto(new Uint8Array([])));
});
function responseFixture(){return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({candidates:Array.from({length:3},(_,i)=>({title:'Fixture '+i,lines:['one','two','three']}))})}]}],usage:{input_tokens:10,output_tokens:20}}),{status:200,headers:{'Content-Type':'application/json'}})}
test("前後空白のある生成履歴から保存・更新でき、別の情景と他人の履歴は拒否する",async()=>{
 const db=database(),sceneText=' \n　窓の雨を見ている。\n　 ';
 const generated=await generateHaiku(db,'alice',{sceneText,requestKey:crypto.randomUUID()},{key:'fixture',model:'fixture'},async()=>responseFixture());
 const value=input({sceneText,haikuText:generated.candidates[0].lines.join('\n'),generationJobId:generated.jobId,selectedCandidateIndex:0});
 const record=await createRecord(db,'alice',value);
 assert.equal((await getRecord(db,'alice',record.id)).scene_text,sceneText.trim());
 assert.equal((await updateRecord(db,'alice',record.id,{...value,revision:1})).revision,2);
 assert.equal(JSON.parse(db.sql.prepare('SELECT input_json FROM generation_jobs WHERE id=?').get(generated.jobId).input_json).sceneText,sceneText);
 await assert.rejects(()=>createRecord(db,'alice',{...value,createKey:crypto.randomUUID(),sceneText:'別の情景'}),e=>e.status===409);
 await assert.rejects(()=>createRecord(db,'bob',{...value,createKey:crypto.randomUUID()}),e=>e.status===404);
 const retained=await updateRecord(db,'alice',record.id,input({revision:2,haikuText:value.haikuText}));
 assert.equal(retained.generation_job_id,generated.jobId);
 const detached=await updateRecord(db,'alice',record.id,{...value,revision:3,sceneText:'新しい情景',generationJobId:'',selectedCandidateIndex:null,status:'draft'});
 assert.equal(detached.generation_job_id,null);assert.equal(detached.selected_candidate_index,null);
 assert.equal((await getRecord(db,'alice',record.id)).scene_text,'新しい情景');
 db.sql.close();
});
test("AI未設定なら外部リクエストと履歴を作らない",async()=>{
 const db=database();let calls=0;await assert.rejects(()=>generateHaiku(db,'alice',{sceneText:'情景',requestKey:crypto.randomUUID()},{},async()=>{calls++;return responseFixture()}),e=>e.status===503);
 assert.equal(calls,0);assert.equal(db.sql.prepare('SELECT count(*) AS n FROM generation_jobs').get().n,0);db.sql.close();
});
test("生成の再送は二重課金せず、元の情景と使用量を保持する",async()=>{
 const db=database(),request={sceneText:'本人の情景',requestKey:crypto.randomUUID()},config={key:'test-fixture',model:'test-fixture'};let calls=0;
 const transport=async()=>{calls++;return responseFixture()};const a=await generateHaiku(db,'alice',request,config,transport),b=await generateHaiku(db,'alice',request,config,transport);
 assert.equal(calls,1);assert.deepEqual(a,b);const job=db.sql.prepare('SELECT * FROM generation_jobs').get();assert.equal(JSON.parse(job.input_json).sceneText,'本人の情景');assert.equal(JSON.parse(job.usage_json).output_tokens,20);
 await assert.rejects(()=>generateHaiku(db,'alice',{...request,sceneText:'別の情景'},config,transport),e=>e.status===409);db.sql.close();
});
test("生成失敗は保存を壊さず、同じ操作を勝手に再実行しない",async()=>{
 const db=database(),record=await createRecord(db,'alice',input()),request={sceneText:'情景',requestKey:crypto.randomUUID()},config={key:'test-fixture',model:'test-fixture'};let calls=0;
 const transport=async()=>{calls++;return new Response('',{status:500})};
 await assert.rejects(()=>generateHaiku(db,'alice',request,config,transport),e=>e.status===502);
 await assert.rejects(()=>generateHaiku(db,'alice',request,config,transport),e=>e.status===409);assert.equal(calls,1);assert.equal((await getRecord(db,'alice',record.id)).scene_text,'窓の雨を見ている。');db.sql.close();
});
test("Groqの形式エラーは接続エラーと区別し、非公開の応答を返さず再送もしない",async()=>{
 const db=database(),record=await createRecord(db,'alice',input()),request={sceneText:'本人の情景',requestKey:crypto.randomUUID()},config={provider:'groq',key:'test-fixture',model:'test-fixture'};let calls=0;
 const transport=async()=>{calls++;return Response.json({error:{code:'json_validate_failed',type:'invalid_request_error',message:'private upstream text fixture-secret',failed_generation:'private generated scene'}},{status:400})};
 await assert.rejects(()=>generateHaiku(db,'alice',request,config,transport),e=>{
  assert.equal(e.status,502);assert.equal(e.message,'生成結果の形式を確認できませんでした。情景文は保持されています。新しく詠む操作で再試行してください。');return true;
 });
 const [job]=await listGenerationHistory(db,'alice');assert.equal(job.error_code,'groq_400_json_validate_failed');assert.equal(job.status,'failed');assert.equal(job.input.sceneText,'本人の情景');
 assert.doesNotMatch(JSON.stringify(job),/fixture-secret|private upstream|private generated/);
 await assert.rejects(()=>generateHaiku(db,'alice',request,config,transport),e=>e.status===409);
 assert.equal(calls,1);assert.equal((await getRecord(db,'alice',record.id)).scene_text,'窓の雨を見ている。');db.sql.close();
});
test("GroqのHTTP状態と許可したコードだけで安全な診断を保存する",async t=>{
 for(const fixture of [
  {status:401,code:'invalid_api_key',suffix:'authentication',message:'GroqのAPIキーを確認してください。情景文は保持されています。'},
  {status:403,code:'permission_error',suffix:'access_denied',message:'GroqのAPIキーとモデルの利用権限を確認してください。情景文は保持されています。'},
  {status:404,code:'model_not_found',suffix:'model_not_found',message:'Groqのモデル設定と利用権限を確認してください。情景文は保持されています。'},
  {status:429,code:'rate_limit_exceeded',suffix:'rate_limited',message:'Groqの生成上限に達しました。時間をおいて新しく詠んでください。情景文は保持されています。'},
  {status:429,type:'insufficient_quota',suffix:'quota_exceeded',message:'Groqの利用枠を確認してください。情景文は保持されています。'},
  {status:400,code:'context_length_exceeded',suffix:'context_length_exceeded',message:'生成サービスの文字数・トークン上限を超えました。情景文を短くして新しく詠んでください。'},
  {status:400,code:'max_tokens_exceeded',suffix:'token_limit_exceeded',message:'生成サービスの文字数・トークン上限を超えました。情景文を短くして新しく詠んでください。'},
  {status:503,code:'private unrecognized code',suffix:'service_unavailable',message:'Groqで一時的な障害が発生しています。時間をおいて新しく詠んでください。情景文は保持されています。'},
  {status:422,code:'private unrecognized code',suffix:'http_error',message:'Groqが生成リクエストを受け付けませんでした（HTTP 422）。情景文は保持されています。'},
  {status:400,malformed:true,suffix:'http_error',message:'Groqが生成リクエストを受け付けませんでした（HTTP 400）。情景文は保持されています。'},
  {status:400,code:17,suffix:'http_error',message:'Groqが生成リクエストを受け付けませんでした（HTTP 400）。情景文は保持されています。'},
 ])await t.test(fixture.status+' '+fixture.suffix+' '+String(fixture.code),async()=>{
  const db=database();const transport=async()=>fixture.malformed?new Response('<html>private upstream</html>',{status:fixture.status}):Response.json({error:{code:fixture.code,type:fixture.type,message:'private upstream fixture-secret'}},{status:fixture.status});
  await assert.rejects(()=>generateHaiku(db,'alice',{sceneText:'情景',requestKey:crypto.randomUUID()},{provider:'groq',key:'fixture',model:'fixture'},transport),e=>{assert.equal(e.status,fixture.status===429?429:502);assert.equal(e.message,fixture.message);return true;});
  const [job]=await listGenerationHistory(db,'alice');assert.equal(job.error_code,`groq_${fixture.status}_${fixture.suffix}`);assert.doesNotMatch(JSON.stringify(job),/private|fixture-secret/);db.sql.close();
 });
});
test("Groq診断の追加でOpenAIのエラーとタイムアウトの扱いを変えない",async()=>{
 for(const provider of ['groq','openai']){
  const db=database(),config={provider,key:'fixture',model:'fixture'};
  await assert.rejects(()=>generateHaiku(db,'alice',{sceneText:'情景',requestKey:crypto.randomUUID()},config,async()=>{throw new DOMException('private timeout','TimeoutError')}),e=>{assert.equal(e.status,502);assert.equal(e.message,'生成がタイムアウトしました。情景文は保持されています。');return true;});
  const [job]=await listGenerationHistory(db,'alice');assert.equal(job.status,'timed_out');assert.equal(job.error_code,'timeout');db.sql.close();
 }
 const db=database();await assert.rejects(()=>generateHaiku(db,'alice',{sceneText:'情景',requestKey:crypto.randomUUID()},{provider:'openai',key:'fixture',model:'fixture'},async()=>Response.json({error:{code:'json_validate_failed',message:'private upstream'}},{status:400})),e=>{assert.equal(e.status,502);assert.equal(e.message,'Haikuを生成できませんでした。接続設定をご確認ください。');return true;});
 const [job]=await listGenerationHistory(db,'alice');assert.equal(job.error_code,'provider_error');db.sql.close();
});
test("生成の試用上限を超えると外部呼出しを行わない",async()=>{
 const db=database(),config={key:'test-fixture',model:'test-fixture'};let calls=0;
 const transport=async()=>{calls++;return responseFixture()};
 for(let i=0;i<20;i++)await generateHaiku(db,'alice',{sceneText:'情景',requestKey:crypto.randomUUID()},config,transport);
 await assert.rejects(()=>generateHaiku(db,'alice',{sceneText:'情景',requestKey:crypto.randomUUID()},config,transport),e=>e.status===429);assert.equal(calls,20);db.sql.close();
});
test("Groq互換APIへJSON Schemaで送り、providerとモデルを履歴に残す",async()=>{
 const db=database(),request={sceneText:'夜の風',requestKey:crypto.randomUUID()};let seen;
 const transport=async(url,init)=>{seen={url,body:JSON.parse(init.body)};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({candidates:Array.from({length:3},(_,i)=>({title:'Groq '+i,lines:['night','wind','home']}))})}}],usage:{prompt_tokens:12,completion_tokens:18}}),{status:200})};
 const result=await generateHaiku(db,'alice',request,{provider:'groq',key:'fixture',model:'openai/gpt-oss-20b'},transport);
 assert.equal(seen.url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(seen.body.response_format.type,'json_schema');assert.ok(result.jobId);
 const [job]=await listGenerationHistory(db,'alice');assert.equal(job.provider,'groq');assert.equal(job.model,'openai/gpt-oss-20b');assert.equal(job.usage.completion_tokens,18);assert.equal((await listGenerationHistory(db,'bob')).length,0);db.sql.close();
});
test("サービス上限と有料予算は外部APIを呼ぶ前に停止する",async()=>{
 const db=database();let calls=0,transport=async()=>{calls++;return responseFixture()};
 await assert.rejects(()=>generateHaiku(db,'alice',{sceneText:'情景',requestKey:crypto.randomUUID()},{key:'fixture',model:'paid',paidMode:true},transport),e=>e.status===503);
 await assert.rejects(()=>generateHaiku(db,'alice',{sceneText:'情景',requestKey:crypto.randomUUID()},{key:'fixture',model:'paid',serviceDailyLimit:1,serviceDailyTokenLimit:1},transport),e=>e.status===429);
 assert.equal(calls,0);db.sql.close();
});
import {boundedBody} from "../.sites-runtime/test-lib/lib/bounded-body.js";
test("リクエスト本文を読み込み中に上限で拒否する",async()=>{
 const request=new Request('https://example.test',{method:'POST',body:'12345'});assert.equal((await boundedBody(request,5)).byteLength,5);
 await assert.rejects(()=>boundedBody(new Request('https://example.test',{method:'POST',body:'123456'}),5),e=>e.status===413);
});

function attach(db,owner="alice",count=2){
 const ids=Array.from({length:count},()=>crypto.randomUUID());
 for(const id of ids)db.sql.prepare("INSERT INTO attachments(id,owner_id,object_key,mime_type,size,created_at) VALUES(?,?,?,?,?,?)").run(id,owner,"photos/"+id,"image/jpeg",10,"now");
 return ids;
}
test("複数写真を順番どおり保存し、公開応答は配列と先頭写真だけを返す",async()=>{
 const db=database(),ids=attach(db),r=await createRecord(db,"alice",input({photoIds:ids}));
 assert.deepEqual(publicRecord(await getRecord(db,"alice",r.id)).photo_ids,ids);
 assert.equal(publicRecord(r).photo_id,ids[0]);
 const page=await listRecordPage(db,"alice",parseRecordQuery(new URLSearchParams()));
 assert.deepEqual(page.records[0].photo_ids,ids);
 for(const key of ["owner_id","create_key","photo_ids_json"])assert.equal(key in page.records[0],false);
 assert.deepEqual((await listRecordPage(db,"bob",parseRecordQuery(new URLSearchParams()))).records,[]);
 db.sql.close();
});
test("写真省略と旧クライアントの同じ先頭写真は複数写真を保持する",async()=>{
 const db=database(),ids=attach(db),r=await createRecord(db,"alice",input({photoIds:ids}));
 const omitted=await updateRecord(db,"alice",r.id,input({revision:1}));
 assert.deepEqual(publicRecord(omitted).photo_ids,ids);
 const legacy=await updateRecord(db,"alice",r.id,input({revision:2,photoId:ids[0]}));
 assert.deepEqual(publicRecord(legacy).photo_ids,ids);
 const replaced=await updateRecord(db,"alice",r.id,input({revision:3,photoId:ids[1]}));
 assert.deepEqual(publicRecord(replaced).photo_ids,[ids[1]]);
 const cleared=await updateRecord(db,"alice",r.id,input({revision:4,photoId:""}));
 assert.deepEqual(publicRecord(cleared).photo_ids,[]);assert.equal(cleared.photo_id,"");
 db.sql.close();
});
test("写真の並べ替えと明示解除を保存し、古い版の更新を拒否する",async()=>{
 const db=database(),ids=attach(db),r=await createRecord(db,"alice",input({photoIds:ids}));
 const reordered=await updateRecord(db,"alice",r.id,input({revision:1,photoIds:[...ids].reverse()}));
 assert.deepEqual(publicRecord(reordered).photo_ids,[...ids].reverse());assert.equal(reordered.photo_id,ids[1]);
 await assert.rejects(()=>updateRecord(db,"alice",r.id,input({revision:1,photoIds:ids})),e=>e.status===409);
 assert.deepEqual(publicRecord(await getRecord(db,"alice",r.id)).photo_ids,[...ids].reverse());
 const cleared=await updateRecord(db,"alice",r.id,input({revision:2,photoIds:[]}));
 assert.deepEqual(publicRecord(cleared).photo_ids,[]);assert.equal(cleared.photo_id,"");db.sql.close();
});
test("写真配列の再送は重複せず、順番の変更は競合になる",async()=>{
 const db=database(),ids=attach(db),value=input({photoIds:ids}),r=await createRecord(db,"alice",value);
 assert.equal((await createRecord(db,"alice",value)).id,r.id);
 await assert.rejects(()=>createRecord(db,"alice",{...value,photoIds:[...ids].reverse()}),e=>e.status===409);
 assert.equal((await listRecords(db,"alice")).length,1);db.sql.close();
});
test("写真配列の各所有者と形式・重複・上限・旧先頭指定との一致を検証する",async()=>{
 const db=database(),ids=attach(db),other=attach(db,"bob",1)[0],r=await createRecord(db,"alice",input({photoIds:ids}));
 for(const photoIds of [[ids[0],other],[ids[0],crypto.randomUUID()]]){
  await assert.rejects(()=>createRecord(db,"alice",input({photoIds})),e=>e.status===404);
  await assert.rejects(()=>updateRecord(db,"alice",r.id,input({revision:1,photoIds})),e=>e.status===404);
 }
 for(const photoIds of [null,"bad",["bad"],[ids[0],ids[0]],Array.from({length:13},()=>crypto.randomUUID())])assert.throws(()=>parseRecord(input({photoIds})),e=>e.status===422);
 assert.throws(()=>parseRecord(input({photoIds:ids,photoId:ids[1]})),e=>e.status===422);
 assert.throws(()=>parseRecord(input({photoIds:[],photoId:ids[0]})),e=>e.status===422);
 assert.deepEqual(parseRecord(input({photoIds:ids,photoId:ids[0]})).photoIds,ids);
 const max=attach(db,"alice",12),full=await createRecord(db,"alice",input({photoIds:max}));assert.deepEqual(publicRecord(full).photo_ids,max);
 assert.deepEqual(publicRecord(await getRecord(db,"alice",r.id)).photo_ids,ids);db.sql.close();
});
test("複数写真の移行は既存の写真と写真なし記録を保持する",()=>{
 const sql=new DatabaseSync(":memory:"),id=crypto.randomUUID(),emptyId=crypto.randomUUID(),photo=crypto.randomUUID();
 for(const file of readdirSync(new URL("../drizzle/",import.meta.url)).filter(f=>f.endsWith(".sql")&&f<"0005").sort())sql.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
 for(const [recordId,photoId] of [[id,photo],[emptyId,""]])sql.prepare("INSERT INTO records(id,owner_id,create_key,scene_text,haiku_text,record_date,status,photo_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(recordId,"alice",crypto.randomUUID(),"scene","one\ntwo\nthree","2026-10-17","completed",photoId,"now","now");
 for(const file of ["0005_record_photo_ids.sql"])sql.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
 assert.deepEqual(publicRecord(sql.prepare("SELECT * FROM records WHERE id=?").get(id)).photo_ids,[photo]);
 assert.deepEqual(publicRecord(sql.prepare("SELECT * FROM records WHERE id=?").get(emptyId)).photo_ids,[]);sql.close();
});
