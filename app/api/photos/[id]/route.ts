import {env} from "cloudflare:workers";
import {handle,identity,database,json} from "../../../../lib/http";
import {InputError} from "../../../../lib/validation";
import {getPhoto,deletePhoto} from "../../../../lib/photos";
export const dynamic="force-dynamic";
export const GET=(_:Request,c:{params:Promise<{id:string}>})=>handle(async()=>{
 const owner=await identity(),{id}=await c.params;if(!env.BUCKET)throw new InputError("写真の保存は準備中です。",503);
 return getPhoto(database(),env.BUCKET,owner,id);
});
export const DELETE=(r:Request,c:{params:Promise<{id:string}>})=>handle(async()=>{
 const owner=await identity(),{id}=await c.params;if(!env.BUCKET)throw new InputError("写真の保存は準備中です。",503);
 const origin=r.headers.get("origin");if(origin&&origin!==new URL(r.url).origin)throw new InputError("この操作を実行できません。",403);
 const result=await deletePhoto(database(),env.BUCKET,owner,id);
 return result.deleted?new Response(null,{status:204,headers:{"Cache-Control":"private, no-store"}}):json({photo:{id,status:"deleting"},retryable:true},202);
});
