import {env} from "cloudflare:workers";
import {getChatGPTUser} from "../app/chatgpt-auth";
import {InputError} from "./validation";
import {boundedBody} from "./bounded-body";
export async function identity(){const u=await getChatGPTUser();if(!u)throw new InputError("ログインしてください。",401);return u.userId;}
export function database(){if(!env.DB)throw new InputError("保存先の準備ができていません。",503);return env.DB;}
export async function readBody(r:Request){
const origin=r.headers.get("origin");if(origin&&origin!==new URL(r.url).origin)throw new InputError("この操作を実行できません。",403);
if(!r.headers.get("content-type")?.includes("application/json"))throw new InputError("入力形式を確認してください。",415);
const text=new TextDecoder().decode(await boundedBody(r,65536));
try{return JSON.parse(text)}catch{throw new InputError("入力形式を確認してください。",400)}}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"private, no-store"}});}
export async function handle(action:()=>Promise<Response>){try{return await action()}catch(e){return json({error:e instanceof InputError?e.message:"処理を完了できませんでした。もう一度お試しください。"},e instanceof InputError?e.status:500);}}

