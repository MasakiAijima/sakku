import {handle,identity,database,readBody,json} from "../../../lib/http";
import {listRecordPage,createRecord,publicRecord} from "../../../lib/records";
import {parseRecordQuery} from "../../../lib/record-query";
export const dynamic="force-dynamic";
export const GET=(r:Request)=>handle(async()=>{const owner=await identity();return json(await listRecordPage(database(),owner,parseRecordQuery(new URL(r.url).searchParams)));});
export const POST=(r:Request)=>handle(async()=>{const owner=await identity();return json({record:publicRecord(await createRecord(database(),owner,await readBody(r)))},201);});

