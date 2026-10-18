import {InputError,UUID} from "./validation.js";
import {z} from "zod";
import {HAIKU_PROMPT_VERSION,partialHaikuParametersSchema,haikuInstructions} from "./haiku-prompt.js";
export {HAIKU_PROMPT_VERSION} from "./haiku-prompt.js";
import {parseHaikuCandidates} from "../shared/haiku.js";
import {getPreferences} from "./preferences.js";
const generationInputSchema=z.object({
 sceneText:z.string().max(10000).refine(value=>Boolean(value.trim())),
 requestKey:z.string().regex(UUID),
 context:z.string().max(2000).default(""),
 seasonal_context:z.string().max(2000).default(""),
 parameters:partialHaikuParametersSchema.optional(),
 refine:z.string().max(2000).default(""),
 previousHaiku:z.string().max(1000).default(""),
});
type Config={provider?:string;key?:string;model?:string;userDailyLimit?:number;serviceDailyLimit?:number;serviceDailyTokenLimit?:number;maxOutputTokens?:number;paidMode?:boolean;dailyBudgetMicrousd?:number;reserveMicrousd?:number};
type Usage={input_tokens?:number;prompt_tokens?:number;output_tokens?:number;completion_tokens?:number};
type ProviderResult={status?:string;usage?:Usage;choices?:{message?:{content?:string}}[];output?:{content?:{type:string;text?:string}[]}[]};
type HistoryRow={id:string;input_json:string;status:string;output_json:string|null;provider:string;model:string;prompt_version:string;usage_json:string|null;error_code:string|null;created_at:string;completed_at:string|null};
const positive=(value:number|undefined,fallback:number)=>Number.isInteger(value)&&Number(value)>0?Number(value):fallback;
const usageOf=(usage:Usage|undefined)=>({inputTokens:Number(usage?.input_tokens??usage?.prompt_tokens??0)||0,outputTokens:Number(usage?.output_tokens??usage?.completion_tokens??0)||0});
const groqErrorCodeSchema=z.enum(["json_validate_failed","context_length_exceeded","max_tokens_exceeded","insufficient_quota","quota_exceeded"]).nullish().catch(undefined);
const groqErrorSchema=z.object({error:z.object({code:groqErrorCodeSchema,type:groqErrorCodeSchema})});
const groqFailureMessages={
 authentication:"GroqのAPIキーを確認してください。情景文は保持されています。",
 access_denied:"GroqのAPIキーとモデルの利用権限を確認してください。情景文は保持されています。",
 model_not_found:"Groqのモデル設定と利用権限を確認してください。情景文は保持されています。",
 rate_limited:"Groqの生成上限に達しました。時間をおいて新しく詠んでください。情景文は保持されています。",
 quota_exceeded:"Groqの利用枠を確認してください。情景文は保持されています。",
 json_validate_failed:"生成結果の形式を確認できませんでした。情景文は保持されています。新しく詠む操作で再試行してください。",
 context_length_exceeded:"生成サービスの文字数・トークン上限を超えました。情景文を短くして新しく詠んでください。",
 token_limit_exceeded:"生成サービスの文字数・トークン上限を超えました。情景文を短くして新しく詠んでください。",
 service_unavailable:"Groqで一時的な障害が発生しています。時間をおいて新しく詠んでください。情景文は保持されています。",
};
class GroqGenerationError extends InputError{
 readonly errorCode:string;
 constructor(status:number,kind:keyof typeof groqFailureMessages|"http_error"){
  super(kind==="http_error"?`Groqが生成リクエストを受け付けませんでした（HTTP ${status}）。情景文は保持されています。`:groqFailureMessages[kind],status===429?429:502);
  this.errorCode=`groq_${status}_${kind}`;
 }
}
async function groqFailure(response:Response){
 let body:unknown;
 try{body=await response.json();}catch(error){if(error instanceof DOMException&&error.name==="TimeoutError")throw error;}
 const parsed=groqErrorSchema.safeParse(body),code=parsed.success?(parsed.data.error.code??parsed.data.error.type):undefined,status=response.status;
 if(status===401)return new GroqGenerationError(status,"authentication");
 if(status===403)return new GroqGenerationError(status,"access_denied");
 if(status===404)return new GroqGenerationError(status,"model_not_found");
 if(status===429)return new GroqGenerationError(status,code==="insufficient_quota"||code==="quota_exceeded"?"quota_exceeded":"rate_limited");
 if(status===400){
  if(code==="json_validate_failed"||code==="context_length_exceeded")return new GroqGenerationError(status,code);
  if(code==="max_tokens_exceeded")return new GroqGenerationError(status,"token_limit_exceeded");
 }
 return new GroqGenerationError(status,status>=500?"service_unavailable":"http_error");
}
export async function generateHaiku(db:D1Database,owner:string,body:unknown,config:Config,transport:typeof fetch=fetch){
 const parsed=generationInputSchema.safeParse(body);
 if(!parsed.success)throw new InputError("情景文・補足・生成条件の入力を確認してください。");
 const b=parsed.data;
 if(!config.key||!config.model)throw new InputError("Haiku生成の接続は準備中です。情景文は下書きとして保存できます。",503);
 const provider=config.provider?.toLowerCase()||"openai",endpoint=provider==="groq"?"https://api.groq.com/openai/v1/chat/completions":provider==="openai"?"https://api.openai.com/v1/responses":"";
 if(!endpoint)throw new InputError("Haiku生成の接続先を確認してください。",503);
 const preferences=await getPreferences(db,owner),parameters={juxtaposition:b.parameters?.juxtaposition??preferences.parameters.juxtaposition,cut_strength:b.parameters?.cut_strength??preferences.parameters.cut_strength,ambiguity:b.parameters?.ambiguity??preferences.parameters.ambiguity,concreteness:b.parameters?.concreteness??preferences.parameters.concreteness},input=JSON.stringify({sceneText:b.sceneText,context:b.context,seasonal_context:b.seasonal_context,parameters,refine:b.refine,previousHaiku:b.previousHaiku,preferences:{style:preferences.style,expression:preferences.expression}});
 const prompt=haikuInstructions(parameters),providerInput=JSON.stringify({SCENE:b.sceneText,"OPTIONAL CONTEXT":b.context,"SEASONAL CONTEXT":b.seasonal_context,parameters,refine:b.refine,previousHaiku:b.previousHaiku,preferences:{style:preferences.style,expression:preferences.expression}});
 const now=new Date(),nowIso=now.toISOString(),day=nowIso.slice(0,10),stale=new Date(now.getTime()-60_000).toISOString();
 await db.prepare("UPDATE generation_jobs SET status='timed_out',error_code='worker_timeout',completed_at=?,updated_at=? WHERE owner_id=? AND status='pending' AND updated_at<?").bind(nowIso,nowIso,owner,stale).run();
 const old=await db.prepare("SELECT id,input_json,status,output_json FROM generation_jobs WHERE owner_id=? AND request_key=?").bind(owner,b.requestKey).first<{id:string;input_json:string;status:string;output_json:string|null}>();
 if(old){if(old.input_json!==input)throw new InputError("生成中に情景が変わりました。新しく詠んでください。",409);if(old.status==="succeeded")return {...JSON.parse(old.output_json!),jobId:old.id};throw new InputError(old.status==="pending"?"生成処理中です。しばらくして同じ操作をお試しください。":"前回の生成は完了しませんでした。新しく詠む操作から再試行してください。",409);}
 const maxOutputTokens=positive(config.maxOutputTokens,1800),reservedTokens=maxOutputTokens+Math.ceil((prompt.length+providerInput.length)/3),userLimit=positive(config.userDailyLimit,20),serviceLimit=positive(config.serviceDailyLimit,1000),tokenLimit=positive(config.serviceDailyTokenLimit,1_000_000);
 const reserveCost=config.paidMode?positive(config.reserveMicrousd,0):0,budget=config.paidMode?positive(config.dailyBudgetMicrousd,0):0;if(config.paidMode&&(!reserveCost||!budget))throw new InputError("有料生成の予算設定がありません。",503);
 const id=crypto.randomUUID();
 const inserted=await db.prepare("INSERT INTO generation_jobs(id,owner_id,request_key,input_json,status,provider,model,prompt_version,reserved_tokens,reserved_cost_microusd,created_at,updated_at) SELECT ?,?,?,?,'pending',?,?,?,?,?,?,? WHERE (SELECT count(*) FROM generation_jobs WHERE owner_id=? AND created_at>=?)<? AND (SELECT count(*) FROM generation_jobs WHERE created_at>=?)<? AND (SELECT COALESCE(sum(reserved_tokens),0) FROM generation_jobs WHERE created_at>=?) + ? <= ? AND (SELECT COALESCE(sum(reserved_cost_microusd),0) FROM generation_jobs WHERE created_at>=?) + ? <= ? ON CONFLICT(owner_id,request_key) DO NOTHING").bind(id,owner,b.requestKey,input,provider,config.model,HAIKU_PROMPT_VERSION,reservedTokens,reserveCost,nowIso,nowIso,owner,day,userLimit,day,serviceLimit,day,reservedTokens,tokenLimit,day,reserveCost,budget||2147483647).run();
 if(!inserted.meta.changes)throw new InputError("生成上限に達しました。情景文は保持されています。",429);
 const schema={type:"object",additionalProperties:false,required:["candidates"],properties:{candidates:{type:"array",minItems:3,maxItems:3,items:{type:"object",additionalProperties:false,required:["title","lines"],properties:{title:{type:"string"},lines:{type:"array",minItems:3,maxItems:3,items:{type:"string"}}}}}}};
 try{
  const request=provider==="groq"?{model:config.model,messages:[{role:"system",content:prompt},{role:"user",content:providerInput}],max_completion_tokens:maxOutputTokens,response_format:{type:"json_schema",json_schema:{name:"sakku_haiku",strict:true,schema}}}:{model:config.model,store:false,instructions:prompt,input:providerInput,max_output_tokens:maxOutputTokens,text:{format:{type:"json_schema",name:"sakku_haiku",strict:true,schema}}};
  const response=await transport(endpoint,{method:"POST",headers:{"Authorization":"Bearer "+config.key,"Content-Type":"application/json"},signal:AbortSignal.timeout(45_000),body:JSON.stringify(request)});if(!response.ok){if(provider==="groq")throw await groqFailure(response);throw new InputError(response.status===429?"生成サービスが混み合っています。時間をおいて新しく詠んでください。":"Haikuを生成できませんでした。接続設定をご確認ください。",response.status===429?429:502);}
  const result=await response.json() as ProviderResult;if(provider==="openai"&&result.status!=="completed")throw new InputError("Haikuの生成が完了しませんでした。",502);
  const text=provider==="groq"?(result.choices?.[0]?.message?.content??""):(result.output?.flatMap(o=>o.content??[]).filter(c=>c.type==="output_text").map(c=>c.text??"").join("")??"");
  const candidates=parseHaikuCandidates(JSON.parse(text).candidates),output={candidates},usage=usageOf(result.usage),done=new Date().toISOString();await db.prepare("UPDATE generation_jobs SET status='succeeded',output_json=?,usage_json=?,input_tokens=?,output_tokens=?,completed_at=?,updated_at=? WHERE id=? AND owner_id=?").bind(JSON.stringify(output),JSON.stringify(result.usage??null),usage.inputTokens,usage.outputTokens,done,done,id,owner).run();return {...output,jobId:id};
 }catch(e){const done=new Date().toISOString(),code=e instanceof GroqGenerationError?e.errorCode:e instanceof DOMException&&e.name==="TimeoutError"?"timeout":e instanceof InputError&&e.status===429?"rate_limited":"provider_error";await db.prepare("UPDATE generation_jobs SET status=?,error_code=?,completed_at=?,updated_at=? WHERE id=? AND owner_id=?").bind(code==="timeout"?"timed_out":"failed",code,done,done,id,owner).run();if(e instanceof InputError)throw e;throw new InputError(code==="timeout"?"生成がタイムアウトしました。情景文は保持されています。":"Haikuを生成できませんでした。情景文は保持されています。",502);}
}
export async function listGenerationHistory(db:D1Database,owner:string){const rows=(await db.prepare("SELECT id,input_json,status,output_json,provider,model,prompt_version,usage_json,error_code,created_at,completed_at FROM generation_jobs WHERE owner_id=? ORDER BY created_at DESC LIMIT 50").bind(owner).all<HistoryRow>()).results;return rows.map(row=>({id:row.id,status:row.status,provider:row.provider,model:row.model,prompt_version:row.prompt_version,error_code:row.error_code,created_at:row.created_at,completed_at:row.completed_at,input:JSON.parse(row.input_json),output:row.output_json?JSON.parse(row.output_json):null,usage:row.usage_json?JSON.parse(row.usage_json):null}));}
