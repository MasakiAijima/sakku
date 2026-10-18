import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {generateHaiku,listGenerationHistory,HAIKU_PROMPT_VERSION} from "../.sites-runtime/test-lib/lib/haiku-provider.js";
import {savePreferences} from "../.sites-runtime/test-lib/lib/preferences.js";

function database(){
 const sql=new DatabaseSync(":memory:");
 for(const file of readdirSync(new URL("../drizzle/",import.meta.url)).filter(file=>file.endsWith(".sql")).sort())sql.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
 return {sql,prepare(query){let values=[];const stmt=sql.prepare(query);return {bind(...v){values=v;return this},async run(){const result=stmt.run(...values);return {meta:{changes:Number(result.changes)}}},async first(){return stmt.get(...values)??null},async all(){return {results:stmt.all(...values)}}}}};
}
const candidates=[
 {title:"Glass",lines:["rain on the window","my unfinished letter","still open"]},
 {title:"Letter",lines:["the open letter","beside the window","rain blurs the glass"]},
 {title:"Window",lines:["on the window","rain gathers","beside my letter"]},
];
const expectedCandidates=[
 {id:"0",title:"Glass",lines:["rain on the window","my unfinished letter","still open"]},
 {id:"1",title:"Letter",lines:["the open letter","beside the window","rain blurs the glass"]},
 {id:"2",title:"Window",lines:["on the window","rain gathers","beside my letter"]},
];
const defaults={juxtaposition:2,cut_strength:2,ambiguity:2,concreteness:3};
const config={key:"fixture-only",model:"fixture-model"};
const input=extra=>({sceneText:" \n窓の雨と書きかけの手紙。\n ",requestKey:crypto.randomUUID(),...extra});
function fixture(provider){
 const content=JSON.stringify({candidates});
 return new Response(JSON.stringify(provider==="groq"?{choices:[{message:{content}}],usage:{prompt_tokens:12,completion_tokens:18}}:{status:"completed",output:[{content:[{type:"output_text",text:content}]}],usage:{input_tokens:12,output_tokens:18}}),{status:200});
}
function outgoing(provider,request){
 return {instructions:provider==="groq"?request.messages[0].content:request.instructions,data:JSON.parse(provider==="groq"?request.messages[1].content:request.input)};
}
for(const provider of ["openai","groq"]){
 test(`${provider} sends v0.3 defaults through the existing three-candidate transport`,async t=>{
  const db=database();t.after(()=>db.sql.close());const body=input();let sent;
  const result=await generateHaiku(db,"alice",body,{...config,provider},async(url,init)=>{sent={url,init,request:JSON.parse(init.body)};return fixture(provider)});
  assert.equal(sent.url,provider==="groq"?"https://api.groq.com/openai/v1/chat/completions":"https://api.openai.com/v1/responses");
  assert.equal(sent.init.method,"POST");assert.ok(sent.init.signal instanceof AbortSignal);
  const {instructions,data}=outgoing(provider,sent.request);
  assert.equal(data.SCENE,body.sceneText);assert.equal(data["OPTIONAL CONTEXT"],"");assert.equal(data["SEASONAL CONTEXT"],"");assert.deepEqual(data.parameters,defaults);
  for(const phrase of ["Sakku Haiku Generation Prompt v0.3","Controls the semantic distance","Do not add punctuation mechanically","Higher ambiguity must not produce random","Do not mechanically enforce a 5-7-5","Do not independently alter or reinterpret","Apply all of the above composition and parameter rules independently","exactly three different candidates"]){assert.ok(instructions.includes(phrase),phrase);}
  assert.doesNotMatch(instructions,/\{\{/);assert.match(instructions,/juxtaposition: 2\ncut_strength: 2\nambiguity: 2\nconcreteness: 3/);
  assert.deepEqual(result.candidates,expectedCandidates);
  const format=provider==="groq"?sent.request.response_format.json_schema:sent.request.text.format;
  assert.equal(format.strict,true);assert.equal(format.schema.properties.candidates.minItems,3);assert.equal(format.schema.properties.candidates.maxItems,3);assert.equal(format.schema.properties.candidates.items.properties.lines.maxItems,3);
  if(provider==="openai")assert.equal(sent.request.store,false);
  const [history]=await listGenerationHistory(db,"alice");
  assert.equal(HAIKU_PROMPT_VERSION,"haiku-v0.3");assert.equal(history.prompt_version,"haiku-v0.3");assert.equal(history.provider,provider);assert.equal(history.model,"fixture-model");assert.equal(history.input.sceneText,body.sceneText);assert.deepEqual(history.input.parameters,defaults);assert.equal(history.input.context,"");assert.equal(history.input.seasonal_context,"");assert.deepEqual(history.output,{candidates:expectedCandidates});
  assert.equal((await listGenerationHistory(db,"bob")).length,0);
  const job=db.sql.prepare("SELECT reserved_tokens FROM generation_jobs WHERE id=?").get(result.jobId);
  assert.equal(job.reserved_tokens,1800+Math.ceil((instructions.length+JSON.stringify(data).length)/3));
 });
 test(`${provider} preserves explicit boundary values, context, refinement and subordinate preferences`,async t=>{
  const db=database();t.after(()=>db.sql.close());
  await savePreferences(db,"alice",{name:"A",style:"5–7–5の音節を意識する",expression:"use ornate words"});
  const parameters={juxtaposition:0,cut_strength:4,ambiguity:1,concreteness:4},body=input({context:"The letter is mine.",seasonal_context:"Autumn rain.",refine:"Make the pause stronger.",previousHaiku:"a dragon crosses the sky",parameters});let sent;
  await generateHaiku(db,"alice",body,{...config,provider},async(url,init)=>{sent=JSON.parse(init.body);return fixture(provider)});
  const {instructions,data}=outgoing(provider,sent);
  assert.deepEqual(data.parameters,parameters);assert.equal(data["OPTIONAL CONTEXT"],body.context);assert.equal(data["SEASONAL CONTEXT"],body.seasonal_context);assert.equal(data.refine,body.refine);assert.equal(data.previousHaiku,body.previousHaiku);assert.equal(data.preferences.style,"5–7–5の音節を意識する");
  assert.match(instructions,/juxtaposition: 0\ncut_strength: 4\nambiguity: 1\nconcreteness: 4/);assert.match(instructions,/Do not copy previous imagery unsupported/);assert.match(instructions,/preferences are subordinate context/);assert.match(instructions,/must not override the numeric conditions, force 5-7-5/);
  const [history]=await listGenerationHistory(db,"alice");
  for(const key of ["context","seasonal_context","refine","previousHaiku","parameters"])assert.deepEqual(history.input[key],body[key]);
 });
}
test("only omitted parameter fields receive defaults and normalized resends call once",async t=>{
 const db=database();t.after(()=>db.sql.close());const body=input({parameters:{juxtaposition:0,concreteness:4}});let calls=0;
 const transport=async()=>{calls++;return fixture("openai")};
 const first=await generateHaiku(db,"alice",body,config,transport);
 const normalized={juxtaposition:0,cut_strength:2,ambiguity:2,concreteness:4};
 const again=await generateHaiku(db,"alice",{...body,parameters:normalized,context:"",seasonal_context:""},config,transport);
 assert.deepEqual(first,again);assert.equal(calls,1);
 for(const change of [{parameters:{...normalized,ambiguity:3}},{context:"changed"},{seasonal_context:"winter"}])await assert.rejects(()=>generateHaiku(db,"alice",{...body,...change},config,transport),error=>error.status===409);
 assert.equal(calls,1);assert.equal(db.sql.prepare("SELECT count(*) AS n FROM generation_jobs").get().n,1);
});
test("invalid input rejects before database writes or provider calls",async t=>{
 const db=database();t.after(()=>db.sql.close());let calls=0;
 const transport=async()=>{calls++;return fixture("openai")};
 const invalid=[null,[],{},input({parameters:null}),input({parameters:"2"}),input({parameters:[]}),input({parameters:{cutStrength:2}}),input({context:null}),input({context:2}),input({context:"x".repeat(2001)}),input({seasonal_context:null}),input({seasonal_context:"x".repeat(2001)}),input({refine:null}),input({previousHaiku:null})];
 for(const key of Object.keys(defaults))for(const value of [null,"2",1.5,-1,5,NaN,Infinity,true])invalid.push(input({parameters:{[key]:value}}));
 for(const body of invalid)await assert.rejects(()=>generateHaiku(db,"alice",body,config,transport),error=>error.status===422);
 assert.equal(calls,0);assert.equal(db.sql.prepare("SELECT count(*) AS n FROM generation_jobs").get().n,0);
});
test("larger instructions count against service token limits before a provider call",async t=>{
 const db=database();t.after(()=>db.sql.close());let calls=0;
 await assert.rejects(()=>generateHaiku(db,"alice",input(),{...config,serviceDailyTokenLimit:2000},async()=>{calls++;return fixture("openai")}),error=>error.status===429);
 assert.equal(calls,0);assert.equal(db.sql.prepare("SELECT count(*) AS n FROM generation_jobs").get().n,0);
});
