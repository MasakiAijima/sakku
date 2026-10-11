import {env} from "cloudflare:workers";
import {handle,identity,database,readBody,json} from "../../../lib/http";
import {generateHaiku,listGenerationHistory} from "../../../lib/haiku-provider";
export const dynamic="force-dynamic";
export const POST=(r:Request)=>handle(async()=>{
 const provider=env.AI_PROVIDER?.toLowerCase()||"openai";
 const key=provider==="groq"?env.GROQ_API_KEY:env.OPENAI_API_KEY;
 return json(await generateHaiku(database(),await identity(),await readBody(r),{provider,key,model:env.HAIKU_MODEL,userDailyLimit:Number(env.HAIKU_USER_DAILY_LIMIT),serviceDailyLimit:Number(env.HAIKU_SERVICE_DAILY_LIMIT),serviceDailyTokenLimit:Number(env.HAIKU_SERVICE_DAILY_TOKEN_LIMIT),maxOutputTokens:Number(env.HAIKU_MAX_OUTPUT_TOKENS),paidMode:env.HAIKU_PAID_MODE==="true",dailyBudgetMicrousd:Number(env.HAIKU_DAILY_BUDGET_MICRO_USD),reserveMicrousd:Number(env.HAIKU_RESERVE_MICRO_USD)}));
});
export const GET=()=>handle(async()=>json({jobs:await listGenerationHistory(database(),await identity())}));
