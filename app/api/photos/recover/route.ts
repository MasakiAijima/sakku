import {env} from "cloudflare:workers";
import {handle,identity,database,json} from "../../../../lib/http";
import {InputError} from "../../../../lib/validation";
import {recoverPhotos,photoPageOptions} from "../../../../lib/photos";
export const dynamic="force-dynamic";
export const POST=(r:Request)=>handle(async()=>{
 const owner=await identity();if(!env.BUCKET)throw new InputError("写真の保存は準備中です。",503);
 const origin=r.headers.get("origin");if(origin&&origin!==new URL(r.url).origin)throw new InputError("この操作を実行できません。",403);
 return json(await recoverPhotos(database(),env.BUCKET,owner,photoPageOptions(new URL(r.url))));
});
