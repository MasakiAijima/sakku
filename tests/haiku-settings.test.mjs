import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {getPreferences,savePreferences} from "../.sites-runtime/test-lib/lib/preferences.js";
import {generateHaiku,listGenerationHistory} from "../.sites-runtime/test-lib/lib/haiku-provider.js";

const defaults={juxtaposition:2,cut_strength:2,ambiguity:2,concreteness:3};
const selected={juxtaposition:4,cut_strength:0,ambiguity:1,concreteness:4};
const settings={name:"Alice",style:"自由詩に近いHaiku",expression:"simple words",appLanguage:"English"};
const migrations=readdirSync(new URL("../drizzle/",import.meta.url)).filter(file=>file.endsWith(".sql")).sort();
function database(beforeParameters=false){
 const sql=new DatabaseSync(":memory:");
 for(const file of migrations.filter(file=>!beforeParameters||file<"0006"))sql.exec(readFileSync(new URL("../drizzle/"+file,import.meta.url),"utf8"));
 return {sql,prepare(query){
  const stmt=sql.prepare(query);let values=[];
  return {bind(...args){values=args;return this},async run(){const result=stmt.run(...values);return {meta:{changes:Number(result.changes)}}},async first(){return stmt.get(...values)??null},async all(){return {results:stmt.all(...values)}}};
 }};
}
function fixture(provider){
 const content=JSON.stringify({candidates:Array.from({length:3},(_,index)=>({title:"Poem "+index,lines:["rain on glass","one drop follows","another"]}))});
 return new Response(JSON.stringify(provider==="groq"?{choices:[{message:{content}}]}:{status:"completed",output:[{content:[{type:"output_text",text:content}]}]}));
}

test("parameter migration preserves existing settings and adds integer defaults",async t=>{
 const db=database(true);t.after(()=>db.sql.close());
 db.sql.prepare("INSERT INTO preferences(owner_id,name,style,expression,app_language,updated_at) VALUES(?,?,?,?,?,?)").run("alice","Existing","自由詩に近いHaiku","plain","English","before");
 db.sql.exec(readFileSync(new URL("../drizzle/0006_haiku_parameters.sql",import.meta.url),"utf8"));
 const loaded=await getPreferences(db,"alice");
 assert.equal(loaded.name,"Existing");assert.equal(loaded.expression,"plain");assert.equal(loaded.appLanguage,"English");assert.deepEqual(loaded.parameters,defaults);
 for(const name of Object.keys(defaults))for(const value of [-1,5,1.5,"bad",null])assert.throws(()=>db.sql.prepare(`UPDATE preferences SET ${name}=? WHERE owner_id='alice'`).run(value));
 assert.deepEqual((await getPreferences(db,"alice")).parameters,defaults);
});

test("settings save and load are owner scoped and old clients preserve saved parameters",async t=>{
 const db=database();t.after(()=>db.sql.close());
 assert.deepEqual((await getPreferences(db,"alice")).parameters,defaults);
 assert.deepEqual((await savePreferences(db,"alice",{...settings,parameters:selected})).parameters,selected);
 assert.deepEqual((await getPreferences(db,"bob")).parameters,defaults);
 await savePreferences(db,"bob",{...settings,name:"Bob",parameters:{juxtaposition:0,cut_strength:4,ambiguity:3,concreteness:1}});
 await savePreferences(db,"alice",{...settings,name:"Updated"});
 const alice=await getPreferences(db,"alice"),bob=await getPreferences(db,"bob");
 assert.equal(alice.name,"Updated");assert.deepEqual(alice.parameters,selected);assert.equal(bob.name,"Bob");assert.equal(bob.parameters.juxtaposition,0);
 assert.deepEqual((await savePreferences(db,"new-owner",settings)).parameters,defaults);
});

test("invalid settings reject with 422 without overwriting any stored fields",async t=>{
 const db=database();t.after(()=>db.sql.close());
 await savePreferences(db,"alice",{...settings,parameters:selected});
 const before=db.sql.prepare("SELECT * FROM preferences WHERE owner_id='alice'").get();
 const invalid=[null,[],{},"bad",{...settings,appLanguage:null},{...settings,style:"bad"},{...settings,expression:42}];
 for(const parameters of [null,[],"bad",{unknown:2},{juxtaposition:-1},{cut_strength:5},{ambiguity:1.2},{concreteness:"3"},{juxtaposition:NaN},{ambiguity:Infinity}])invalid.push({...settings,name:"Must not save",parameters});
 for(const value of invalid){
  await assert.rejects(()=>savePreferences(db,"alice",value),error=>error.status===422);
  assert.deepEqual(db.sql.prepare("SELECT * FROM preferences WHERE owner_id='alice'").get(),before);
 }
});

for(const provider of ["openai","groq"]){
 test(`${provider} uses saved parameters in actual prompt and history with idempotent retry`,async t=>{
  const db=database();t.after(()=>db.sql.close());
  await savePreferences(db,"alice",{...settings,parameters:selected});
  let calls=0,seen;
  const transport=async(url,init)=>{calls++;seen={url,body:JSON.parse(init.body)};return fixture(provider)};
  const request={sceneText:"Rain on the window",requestKey:crypto.randomUUID()},config={provider,key:"fixture",model:"fixture"};
  const first=await generateHaiku(db,"alice",request,config,transport);
  assert.deepEqual(await generateHaiku(db,"alice",request,config,transport),first);assert.equal(calls,1);
  const prompt=provider==="groq"?seen.body.messages[0].content:seen.body.instructions;
  const input=JSON.parse(provider==="groq"?seen.body.messages[1].content:seen.body.input);
  assert.deepEqual(input.parameters,selected);
  for(const [name,value] of Object.entries(selected))assert.ok(prompt.includes(`${name}: ${value}\n`));
  const [job]=await listGenerationHistory(db,"alice");assert.deepEqual(job.input.parameters,selected);assert.equal(job.input.sceneText,request.sceneText);assert.equal(job.provider,provider);
  assert.equal(db.sql.prepare("SELECT count(*) AS count FROM generation_jobs").get().count,1);
  assert.equal((await listGenerationHistory(db,"bob")).length,0);
 });
 test(`${provider} applies explicit partial overrides including zero while preserving other saved fields`,async t=>{
  const db=database();t.after(()=>db.sql.close());
  await savePreferences(db,"alice",{...settings,parameters:selected});
  const expected={...selected,juxtaposition:0,ambiguity:3};let seen;
  const transport=async(_,init)=>{seen=JSON.parse(init.body);return fixture(provider)};
  await generateHaiku(db,"alice",{sceneText:"Rain on the window",requestKey:crypto.randomUUID(),parameters:{juxtaposition:0,ambiguity:3,concreteness:undefined}},{provider,key:"fixture",model:"fixture"},transport);
  const prompt=provider==="groq"?seen.messages[0].content:seen.instructions;
  const input=JSON.parse(provider==="groq"?seen.messages[1].content:seen.input);
  assert.deepEqual(input.parameters,expected);
  for(const [name,value] of Object.entries(expected))assert.ok(prompt.includes(`${name}: ${value}\n`));
  assert.deepEqual((await listGenerationHistory(db,"alice"))[0].input.parameters,expected);
  assert.deepEqual((await getPreferences(db,"alice")).parameters,selected);
 });
}

test("invalid generation parameters reject before writing history or calling the provider",async t=>{
 const db=database();t.after(()=>db.sql.close());
 let calls=0;const transport=async()=>{calls++;return fixture("openai")};
 for(const parameters of [null,[],"bad",{typo:1},{juxtaposition:5},{ambiguity:-1},{concreteness:1.5},{cut_strength:"2"}]){
  await assert.rejects(()=>generateHaiku(db,"alice",{sceneText:"Rain",requestKey:crypto.randomUUID(),parameters},{key:"fixture",model:"fixture"},transport),error=>error.status===422);
 }
 assert.equal(calls,0);assert.equal(db.sql.prepare("SELECT count(*) AS count FROM generation_jobs").get().count,0);
});
