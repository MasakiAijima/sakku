import {InputError,parseRecord,parseRevision,UUID} from "./validation.js";
import {recordCursor,type PageOptions} from "./record-query.js";
import type {RecordView} from "../shared/contracts.js";
export type SavedRecord={id:string;owner_id:string;create_key:string;scene_text:string;haiku_text:string;record_date:string;status:"draft"|"completed";event_text:string;emotion_text:string;photo_id:string;revision:number;created_at:string;updated_at:string};
export function publicRecord(row:SavedRecord):RecordView{const {owner_id,create_key,...record}=row;return record;}
export async function listRecordPage(db:D1Database,owner:string,options:PageOptions){
 const clauses=["owner_id=?"],values:(string|number)[]=[owner];
 if(options.from){clauses.push("record_date>=?");values.push(options.from);}
 if(options.to){clauses.push("record_date<?");values.push(options.to);}
 if(options.after){clauses.push("(record_date,created_at,id)<(?,?,?)");values.push(options.after.date,options.after.createdAt,options.after.id);}
 const rows=(await db.prepare("SELECT * FROM records WHERE "+clauses.join(" AND ")+" ORDER BY record_date DESC,created_at DESC,id DESC LIMIT ?").bind(...values,options.limit+1).all<SavedRecord>()).results;
 const more=rows.length>options.limit,records=rows.slice(0,options.limit);
 return {records:records.map(publicRecord),nextCursor:more?recordCursor(records[records.length-1],options):null};
}
export async function listRecords(db:D1Database,owner:string){return (await db.prepare("SELECT * FROM records WHERE owner_id=? ORDER BY record_date DESC,created_at DESC LIMIT 100").bind(owner).all<SavedRecord>()).results;}
export async function getRecord(db:D1Database,owner:string,id:string){
if(!UUID.test(id))throw new InputError("記録が見つかりません。",404);
const row=await db.prepare("SELECT * FROM records WHERE id=? AND owner_id=?").bind(id,owner).first<SavedRecord>();
if(!row)throw new InputError("記録が見つかりません。",404);return row;}
async function checkPhoto(db:D1Database,owner:string,id:string|undefined){if(id&&!await db.prepare("SELECT id FROM attachments WHERE id=? AND owner_id=?").bind(id,owner).first())throw new InputError("写真が見つかりません。",404);}
export async function createRecord(db:D1Database,owner:string,body:unknown){
const input=parseRecord(body),key=(body as {createKey?:unknown}).createKey;
if(typeof key!=="string"||!UUID.test(key))throw new InputError("保存の識別子を確認してください。");
await checkPhoto(db,owner,input.photoId);
const now=new Date().toISOString(),id=crypto.randomUUID();
await db.prepare("INSERT INTO records (id,owner_id,create_key,scene_text,haiku_text,record_date,status,event_text,emotion_text,photo_id,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(owner_id,create_key) DO NOTHING").bind(id,owner,key,input.sceneText,input.haikuText,input.recordDate,input.status,input.eventText??"",input.emotionText??"",input.photoId??"",now,now).run();
const row=await db.prepare("SELECT * FROM records WHERE owner_id=? AND create_key=?").bind(owner,key).first<SavedRecord>();
if(!row)throw new Error("Save failed");
if(row.scene_text!==input.sceneText||row.haiku_text!==input.haikuText||row.record_date!==input.recordDate||row.status!==input.status||row.event_text!==(input.eventText??"")||row.emotion_text!==(input.emotionText??"")||row.photo_id!==(input.photoId??""))throw new InputError("保存の再試行中に内容が変わりました。記録を読み直してください。",409);
return row;}
export async function updateRecord(db:D1Database,owner:string,id:string,body:unknown){
const input=parseRecord(body),revision=parseRevision((body as {revision?:unknown}).revision);
await getRecord(db,owner,id);await checkPhoto(db,owner,input.photoId);
const result=await db.prepare("UPDATE records SET scene_text=?,haiku_text=?,record_date=?,status=?,event_text=COALESCE(?,event_text),emotion_text=COALESCE(?,emotion_text),photo_id=COALESCE(?,photo_id),revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=?").bind(input.sceneText,input.haikuText,input.recordDate,input.status,input.eventText??null,input.emotionText??null,input.photoId??null,new Date().toISOString(),id,owner,revision).run();
if(!result.meta.changes)throw new InputError("別の編集で更新されています。内容を控えてから記録を読み直してください。",409);
return getRecord(db,owner,id);}

