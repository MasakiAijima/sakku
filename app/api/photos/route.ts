import {env} from "cloudflare:workers";
import {handle,identity,database,json} from "../../../lib/http";
import {InputError} from "../../../lib/validation";
import {boundedBody} from "../../../lib/bounded-body";
import {listPhotos,photoPageOptions,uploadPhoto} from "../../../lib/photos";
export const dynamic="force-dynamic";
export const GET=(r:Request)=>handle(async()=>{
 const owner=await identity();return json(await listPhotos(database(),owner,photoPageOptions(new URL(r.url))));
});
export const POST=(r:Request)=>handle(async()=>{
 const owner=await identity();if(!env.BUCKET)throw new InputError("写真の保存は準備中です。",503);
 const origin=r.headers.get("origin");if(origin&&origin!==new URL(r.url).origin)throw new InputError("この操作を実行できません。",403);
 if(Number(r.headers.get("content-length"))>1100000)throw new InputError("写真は1MB以下にしてください。",413);
 const payload=await boundedBody(r,1100000);
 let form:FormData;
 try{form=await new Request(r.url,{method:"POST",headers:{"Content-Type":r.headers.get("content-type")??""},body:payload}).formData();}
 catch{throw new InputError("写真の送信形式を確認してください。",400);}
 const file=form.get("photo");if(!(file instanceof File)||file.size>1000000||file.size===0)throw new InputError("1MB以下の写真を選んでください。");
 return json({photo:await uploadPhoto(database(),env.BUCKET,owner,new Uint8Array(await file.arrayBuffer()))},201);
});
