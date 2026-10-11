import {env} from "cloudflare:workers";
import {handle,identity,database,json} from "../../../lib/http";
import {InputError} from "../../../lib/validation";
import {photoType} from "../../../shared/photo";
import {boundedBody} from "../../../lib/bounded-body";
export const dynamic="force-dynamic";
export const POST=(r:Request)=>handle(async()=>{
 const owner=await identity();if(!env.BUCKET)throw new InputError("写真の保存は準備中です。",503);
 const origin=r.headers.get("origin");if(origin&&origin!==new URL(r.url).origin)throw new InputError("この操作を実行できません。",403);
 const contentLength=Number(r.headers.get("content-length"));if(contentLength>1100000)throw new InputError("写真は1MB以下にしてください。",413);
 const payload=await boundedBody(r,1100000);
 const form=await new Request(r.url,{method:"POST",headers:{"Content-Type":r.headers.get("content-type")??""},body:payload}).formData(),file=form.get("photo");if(!(file instanceof File)||file.size>1000000||file.size===0)throw new InputError("1MB以下の写真を選んでください。");
 const bytes=await file.arrayBuffer(),type=photoType(new Uint8Array(bytes));if(!type)throw new InputError("JPEG・PNG・WebPの写真を選んでください。");
 const id=crypto.randomUUID(),objectKey="photos/"+id;await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:type}});
 try{await database().prepare("INSERT INTO attachments(id,owner_id,object_key,mime_type,size,created_at) VALUES(?,?,?,?,?,?)").bind(id,owner,objectKey,type,file.size,new Date().toISOString()).run();}catch(e){await env.BUCKET.delete(objectKey);throw e;}
 return json({photo:{id,url:"/api/photos/"+id}},201);
});
