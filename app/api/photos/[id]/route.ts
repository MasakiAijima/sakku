import {env} from "cloudflare:workers";
import {handle,identity,database} from "../../../../lib/http";
import {InputError,UUID} from "../../../../lib/validation";
export const dynamic="force-dynamic";
export const GET=(_:Request,c:{params:Promise<{id:string}>})=>handle(async()=>{
 const owner=await identity(),{id}=await c.params;if(!UUID.test(id)||!env.BUCKET)throw new InputError("写真が見つかりません。",404);
 const row=await database().prepare("SELECT object_key,mime_type FROM attachments WHERE id=? AND owner_id=?").bind(id,owner).first<{object_key:string;mime_type:string}>();if(!row)throw new InputError("写真が見つかりません。",404);
 const object=await env.BUCKET.get(row.object_key);if(!object)throw new InputError("写真が見つかりません。",404);
 return new Response(object.body,{headers:{"Content-Type":row.mime_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
});
