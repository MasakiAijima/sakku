import {env} from "cloudflare:workers";
import {handle,identity,database,readBody,json} from "../../../lib/http";
import {generateHaiku} from "../../../lib/haiku-provider";
export const dynamic="force-dynamic";
export const POST=(r:Request)=>handle(async()=>json(await generateHaiku(database(),await identity(),await readBody(r),{key:env.OPENAI_API_KEY,model:env.HAIKU_MODEL})));

