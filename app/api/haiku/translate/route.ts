import {env} from "cloudflare:workers";
import {handle,identity,database,readBody,json} from "../../../../lib/http";
import {getPreferences} from "../../../../lib/preferences";
import {translateHaiku} from "../../../../lib/haiku-translation";
export const dynamic="force-dynamic";
export const POST=(r:Request)=>handle(async()=>{
 const owner=await identity(),preferences=await getPreferences(database(),owner),body=await readBody(r) as Record<string,unknown>;
 const provider=env.AI_PROVIDER?.toLowerCase()||"openai",key=provider==="groq"?env.GROQ_API_KEY:env.OPENAI_API_KEY;
 return json({translation:await translateHaiku({...body,targetLanguage:preferences.appLanguage},{provider,key,model:env.HAIKU_MODEL})});
});
