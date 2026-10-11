import {handle,identity,database,readBody,json} from "../../../../lib/http";
import {getRecord,updateRecord,publicRecord} from "../../../../lib/records";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export const GET=(_:Request,c:Context)=>handle(async()=>{const owner=await identity();return json({record:publicRecord(await getRecord(database(),owner,(await c.params).id))});});
export const PATCH=(r:Request,c:Context)=>handle(async()=>{const owner=await identity();return json({record:publicRecord(await updateRecord(database(),owner,(await c.params).id,await readBody(r)))});});

