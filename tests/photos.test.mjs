import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {parsePhoto,PhotoFormatError} from '../.sites-runtime/test-lib/shared/photo.js';
import {uploadPhoto,getPhoto,deletePhoto,listPhotos,recoverPhotos,photoPageOptions} from '../.sites-runtime/test-lib/lib/photos.js';
import {createRecord,updateRecord} from '../.sites-runtime/test-lib/lib/records.js';
const fixture=name=>new Uint8Array(readFileSync(new URL('./fixtures/photos/'+name,import.meta.url)));
function photoType(bytes){try{return parsePhoto(bytes).mimeType}catch(error){if(error instanceof PhotoFormatError)return null;throw error}}
const png=fixture('rgb.png');
function database(migrate=true){
 const sql=new DatabaseSync(':memory:');
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
  if(!migrate&&file.startsWith('0005'))continue;
  sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 }
 return {sql,fail:null,after:null,prepare(query){
  const stmt=sql.prepare(query);let values=[];
  return {bind(...v){values=v;return this},async run(){
   const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}};
  },async first(){return stmt.get(...values)??null},async all(){return {results:stmt.all(...values)}}};
 }};
}
function db(){
 const base=database();
 const prepare=base.prepare.bind(base);
 base.prepare=query=>{
  const statement=prepare(query),run=statement.run;
  statement.run=async()=>{
   if(base.fail?.(query))throw Error('private DB detail');
   const result=await run.call(statement);base.after?.(query);return result;
  };
  return statement;
 };
 return base;
}
function bucket(){
 const objects=new Map();
 return {objects,puts:0,deletes:0,failPut:false,failDelete:false,async put(key,bytes){
  this.puts++;objects.set(key,new Uint8Array(bytes));if(this.failPut)throw Error('uncertain accepted put');return {};
 },async get(key){const bytes=objects.get(key);return bytes?{body:bytes}:null},async delete(key){this.deletes++;if(this.failDelete)throw Error('private R2 detail');objects.delete(key)}};
}
const options=(limit=50,after)=>({limit,after});
const input=extra=>({createKey:crypto.randomUUID(),sceneText:'rain',haikuText:'rain\non the leaf\nfalls',recordDate:'2026-10-14',status:'completed',...extra});
const row=d=>d.sql.prepare('SELECT * FROM attachments').get();
const unavailable=e=>e.status===503&&!e.message.includes('private');
function seed(d,owner='alice',status='ready'){
 const id=crypto.randomUUID();d.sql.prepare('INSERT INTO attachments(id,owner_id,object_key,mime_type,size,created_at,status) VALUES(?,?,?,?,?,?,?)').run(id,owner,'photos/'+id,'image/png',png.length,'2026-10-14T00:00:00Z',status);return id;
}
test('real codec fixtures pass structural and dimension validation',()=>{
 for(const name of ['baseline.jpg','progressive.jpg','rgb.png','palette.png','grayscale.png','lossy.webp','lossless.webp','alpha.webp']){
  const info=parsePhoto(fixture(name));assert.equal(info.width,3,name);assert.equal(info.height,2,name);
 }
});
test('prefix impostors, truncations, trailing bytes, oversized files and unsupported data fail',()=>{
 for(const name of ['baseline.jpg','progressive.jpg','rgb.png','lossy.webp','lossless.webp']){
  const bytes=fixture(name);
  for(const cut of [3,8,12,bytes.length-1])assert.equal(photoType(bytes.subarray(0,cut)),null,name+' cut '+cut);
  assert.equal(photoType(new Uint8Array([...bytes,0])),null,name+' trailing');
 }
 for(const bytes of [new Uint8Array(),new TextEncoder().encode('<svg/>'),new Uint8Array(1000001)])assert.throws(()=>parsePhoto(bytes));
});
function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^(c&1?0xedb88320:0)}return (c^0xffffffff)>>>0}
function pngHeader(change){const bytes=png.slice(),view=new DataView(bytes.buffer);change(bytes,view);view.setUint32(29,crc(bytes.subarray(12,29)));return bytes}
test('PNG CRC, legal IHDR fields, chunk ordering, and both dimension limits are enforced',()=>{
 const badCrc=png.slice();badCrc[20]^=1;assert.equal(photoType(badCrc),null);
 for(const change of [(b,v)=>v.setUint32(16,0),(b,v)=>v.setUint32(16,1001),(b,v)=>v.setUint32(20,1001),b=>b[24]=3,b=>b[26]=1,b=>b[28]=2])assert.equal(photoType(pngHeader(change)),null);
 const chunks=[];for(let at=8;at<png.length;){const len=new DataView(png.buffer).getUint32(at)+12;chunks.push(png.slice(at,at+len));at+=len}
 assert.equal(photoType(new Uint8Array([...png.slice(0,8),...chunks.at(-1),...chunks.slice(0,-1).flatMap(c=>[...c])])),null);
});
test('JPEG bounded segments, SOF dimensions, empty quantization and empty scans are rejected',()=>{
 const bytes=fixture('baseline.jpg');
 const badLength=bytes.slice();new DataView(badLength.buffer).setUint16(4,65535);assert.equal(photoType(badLength),null);
 const sof=bytes.findIndex((v,i)=>v===255&&bytes[i+1]===0xc0),oversize=bytes.slice();new DataView(oversize.buffer).setUint16(sof+7,1001);assert.equal(photoType(oversize),null);
 const dqt=bytes.findIndex((v,i)=>v===255&&bytes[i+1]===0xdb),len=new DataView(bytes.buffer).getUint16(dqt+2);
 const empty=new Uint8Array([...bytes.slice(0,dqt+2),0,2,...bytes.slice(dqt+2+len)]);assert.equal(photoType(empty),null);
 const sos=bytes.findIndex((v,i)=>v===255&&bytes[i+1]===0xda),scanEnd=sos+2+new DataView(bytes.buffer).getUint16(sos+2);
 assert.equal(photoType(new Uint8Array([...bytes.slice(0,scanEnd),255,217])),null);
});
test('WebP RIFF lengths, chunk boundaries, animation and alpha flags are enforced',()=>{
 const bytes=fixture('lossy.webp'),size=bytes.slice();new DataView(size.buffer).setUint32(4,1,true);assert.equal(photoType(size),null);
 const chunk=bytes.slice();new DataView(chunk.buffer).setUint32(16,100000,true);assert.equal(photoType(chunk),null);
 const alpha=fixture('alpha.webp');for(const flag of [2,16]){const invalid=alpha.slice();invalid[20]^=flag;assert.equal(photoType(invalid),null)}
 const over=bytes.slice();new DataView(over.buffer).setUint16(26,1001,true);assert.equal(photoType(over),null);
});
test('journal precedes one put, inventory discovers ready upload and retrieval returns the same bytes',async()=>{
 const d=db(),b=bucket();try{
  const put=b.put.bind(b);b.put=async(...args)=>{assert.equal(row(d).status,'uploading');return put(...args)};
  const photo=await uploadPhoto(d,b,'alice',png);assert.equal(b.puts,1);assert.equal(row(d).status,'ready');
  assert.deepEqual(new Uint8Array(await (await getPhoto(d,b,'alice',photo.id)).arrayBuffer()),png);
  const page=await listPhotos(d,'alice',options());assert.equal(page.photos[0].id,photo.id);assert.equal(page.photos[0].unused,true);assert.equal(page.photos[0].url,photo.url);assert.ok(!('object_key' in page.photos[0]));
  assert.equal((await listPhotos(d,'bob',options())).photos.length,0);
  await assert.rejects(()=>getPhoto(d,b,'bob',photo.id),e=>e.status===404);
  await assert.rejects(()=>deletePhoto(d,b,'bob',photo.id),e=>e.status===404);
 }finally{d.sql.close()}
});
test('invalid upload has no database or bucket writes',async()=>{
 const d=db(),b=bucket();try{await assert.rejects(()=>uploadPhoto(d,b,'alice',new Uint8Array([255,216,255])),e=>e.status===422);assert.equal(row(d),undefined);assert.equal(b.puts,0)}finally{d.sql.close()}
});
test('uncertain put remains uploading and cannot be retrieved, deleted or automatically recovered',async()=>{
 const d=db(),b=bucket();try{
  b.failPut=true;await assert.rejects(()=>uploadPhoto(d,b,'alice',png),unavailable);const photo=row(d);assert.equal(photo.status,'uploading');assert.equal(b.objects.size,1);
  await assert.rejects(()=>getPhoto(d,b,'alice',photo.id),e=>e.status===404);await assert.rejects(()=>deletePhoto(d,b,'alice',photo.id),e=>e.status===409);
  const recovery=await recoverPhotos(d,b,'alice',options());assert.equal(recovery.unresolvedUploading,1);assert.equal(recovery.outcomes.length,0);assert.equal(b.deletes,0);
 }finally{d.sql.close()}
});
test('failed publication after settled put compensates; failed compensation claim retains journal and bytes',async()=>{
 for(const failClaim of [false,true]){
  const d=db(),b=bucket();try{
   d.fail=q=>q.startsWith("UPDATE attachments SET status='ready'")||(failClaim&&q.startsWith("UPDATE attachments SET status='deleting'"));
   await assert.rejects(()=>uploadPhoto(d,b,'alice',png),unavailable);
   assert.equal(b.puts,1);assert.equal(b.objects.size,failClaim?1:0);assert.equal(row(d)?.status,failClaim?'uploading':undefined);
  }finally{d.sql.close()}
 }
});
test('publication committed before failure remains ready and compensation cannot delete it',async()=>{
 const d=db(),b=bucket();try{
  d.after=q=>{if(q.startsWith("UPDATE attachments SET status='ready'"))throw Error('ambiguous DB response')};
  await assert.rejects(()=>uploadPhoto(d,b,'alice',png),unavailable);assert.equal(row(d).status,'ready');assert.equal(b.objects.size,1);assert.equal(b.deletes,0);
 }finally{d.sql.close()}
});
test('failed R2 deletion and metadata finalization remain deleting and retries finish',async()=>{
 for(const failure of ['bucket','database']){
  const d=db(),b=bucket();try{
   const photo=await uploadPhoto(d,b,'alice',png);b.failDelete=failure==='bucket';d.fail=q=>failure==='database'&&q.startsWith('DELETE FROM attachments');
   assert.deepEqual(await deletePhoto(d,b,'alice',photo.id),{deleted:false});assert.equal(row(d).status,'deleting');assert.equal(b.objects.size,failure==='bucket'?1:0);
   await assert.rejects(()=>getPhoto(d,b,'alice',photo.id),e=>e.status===404);
   b.failDelete=false;d.fail=null;assert.deepEqual(await deletePhoto(d,b,'alice',photo.id),{deleted:true});assert.equal(row(d),undefined);assert.equal(b.objects.size,0);
   await assert.rejects(()=>deletePhoto(d,b,'alice',photo.id),e=>e.status===404);
  }finally{d.sql.close()}
 }
});
test('failed owner claim never deletes physical bytes',async()=>{
 const d=db(),b=bucket();try{const photo=await uploadPhoto(d,b,'alice',png);d.fail=q=>q.startsWith("UPDATE attachments SET status='deleting'");await assert.rejects(()=>deletePhoto(d,b,'alice',photo.id),unavailable);assert.equal(row(d).status,'ready');assert.equal(b.deletes,0)}finally{d.sql.close()}
});
test('record-first ordering rejects lifecycle change and raw metadata delete; delete-first rejects attach',async()=>{
 const d=db(),b=bucket();try{
  const photo=await uploadPhoto(d,b,'alice',png),record=await createRecord(d,'alice',input({photoId:photo.id}));
  await assert.rejects(()=>deletePhoto(d,b,'alice',photo.id),e=>e.status===409);assert.equal(b.deletes,0);
  assert.throws(()=>d.sql.prepare("UPDATE attachments SET status='deleting' WHERE id=?").run(photo.id),/PHOTO_REFERENCE_CONFLICT/);
  assert.throws(()=>d.sql.prepare('DELETE FROM attachments WHERE id=?').run(photo.id),/PHOTO_REFERENCE_CONFLICT/);
  await updateRecord(d,'alice',record.id,input({revision:1,photoId:''}));b.failDelete=true;await deletePhoto(d,b,'alice',photo.id);
  await assert.rejects(()=>createRecord(d,'alice',input({photoId:photo.id})),e=>e.status===404);
  assert.throws(()=>d.sql.prepare('UPDATE records SET photo_id=? WHERE id=?').run(photo.id,record.id),/PHOTO_REFERENCE_CONFLICT/);
 }finally{d.sql.close()}
});
test('trigger closes gap after precheck and only known invariant maps to 409',async()=>{
 const d=db();try{
  const id=seed(d),original=d.prepare.bind(d);
  d.prepare=q=>{
   const statement=original(q);if(q.startsWith('INSERT INTO records')){const run=statement.run;statement.run=async()=>{d.sql.prepare("UPDATE attachments SET status='deleting' WHERE id=?").run(id);return run.call(statement)}}return statement;
  };
  await assert.rejects(()=>createRecord(d,'alice',input({photoId:id})),e=>e.status===409);
  d.fail=q=>q.startsWith('INSERT INTO records');await assert.rejects(()=>createRecord(d,'alice',input()),e=>e.message==='private DB detail'&&e.status===undefined);
 }finally{d.sql.close()}
});
test('migration preserves old data and unchanged invalid photo references can be edited',async()=>{
 const d=database(false);try{
  const id=crypto.randomUUID(),record=await createRecord(d,'alice',input());
  d.sql.prepare('INSERT INTO attachments(id,owner_id,object_key,mime_type,size,created_at) VALUES(?,?,?,?,?,?)').run(id,'bob','legacy-key','image/jpeg',3,'old');
  d.sql.prepare('UPDATE records SET photo_id=? WHERE id=?').run(id,record.id);
  d.sql.exec(readFileSync(new URL('../drizzle/0005_photo_lifecycle.sql',import.meta.url),'utf8'));
  assert.equal(row(d).status,'ready');assert.equal(row(d).object_key,'legacy-key');
  const edited=await updateRecord(d,'alice',record.id,input({revision:1,photoId:id,sceneText:'snow'}));assert.equal(edited.photo_id,id);assert.equal(edited.scene_text,'snow');
  assert.throws(()=>d.sql.prepare("UPDATE attachments SET status='deleting' WHERE id=?").run(id),/PHOTO_REFERENCE_CONFLICT/);
  assert.throws(()=>d.sql.prepare('UPDATE attachments SET object_key=? WHERE id=?').run('other-key',id),/PHOTO_IDENTITY_IMMUTABLE/);
  await assert.rejects(()=>createRecord(d,'alice',input({photoId:id})),e=>e.status===404);
 }finally{d.sql.close()}
});
test('inventory and recovery pagination advance beyond failing deletion without touching ready or other owners',async()=>{
 const d=db(),b=bucket();try{
  const ids=Array.from({length:4},()=>seed(d,'alice','deleting')).sort();seed(d,'alice','uploading');seed(d,'alice','ready');seed(d,'bob','deleting');
  b.failDelete=true;const first=await recoverPhotos(d,b,'alice',options(2));assert.equal(first.outcomes.length,2);assert.equal(first.unresolvedUploading,1);assert.ok(first.nextCursor);
  b.failDelete=false;const second=await recoverPhotos(d,b,'alice',photoPageOptions(new URL('http://local?limit=2&cursor='+encodeURIComponent(first.nextCursor))));assert.deepEqual(second.outcomes.map(p=>p.id),ids.slice(2));assert.equal(second.nextCursor,null);
  const final=await recoverPhotos(d,b,'alice',options());assert.equal(final.outcomes.length,2);assert.equal((await listPhotos(d,'alice',options())).photos.length,2);assert.equal((await listPhotos(d,'bob',options())).photos.length,1);
  for(const query of ['?limit=0','?limit=51','?limit=1e1','?cursor=garbage'])assert.throws(()=>photoPageOptions(new URL('http://local'+query)));
 }finally{d.sql.close()}
});
test('failed staging insert never starts an R2 put',async()=>{
 const d=db(),b=bucket();try{d.fail=q=>q.startsWith('INSERT INTO attachments');await assert.rejects(()=>uploadPhoto(d,b,'alice',png),unavailable);assert.equal(b.puts,0);assert.equal(row(d),undefined)}finally{d.sql.close()}
});
test('failed publication with failed cleanup remains discoverable and recovery finishes',async()=>{
 const d=db(),b=bucket();try{
  d.fail=q=>q.startsWith("UPDATE attachments SET status='ready'");b.failDelete=true;
  await assert.rejects(()=>uploadPhoto(d,b,'alice',png),unavailable);assert.equal(row(d).status,'deleting');assert.equal(b.objects.size,1);
  const inventory=await listPhotos(d,'alice',options());assert.equal(inventory.photos[0].status,'deleting');assert.ok(!('url' in inventory.photos[0]));
  b.failDelete=false;const recovered=await recoverPhotos(d,b,'alice',options());assert.deepEqual(recovered.outcomes,[{id:inventory.photos[0].id,deleted:true}]);assert.equal(row(d),undefined);assert.equal(b.objects.size,0);
 }finally{d.sql.close()}
});
test('update precheck race returns a known photo conflict and preserves the saved record',async()=>{
 const d=db();try{
  const record=await createRecord(d,'alice',input()),id=seed(d),original=d.prepare.bind(d);
  d.prepare=q=>{const statement=original(q);if(q.startsWith('UPDATE records')){const run=statement.run;statement.run=async()=>{d.sql.prepare("UPDATE attachments SET status='deleting' WHERE id=?").run(id);return run.call(statement)}}return statement};
  await assert.rejects(()=>updateRecord(d,'alice',record.id,input({revision:1,photoId:id})),e=>e.status===409);
  assert.equal(d.sql.prepare('SELECT photo_id,revision FROM records WHERE id=?').get(record.id).photo_id,'');assert.equal(d.sql.prepare('SELECT revision FROM records WHERE id=?').get(record.id).revision,1);
 }finally{d.sql.close()}
});
test('replacement inserts cannot overwrite an attachment identity',()=>{
 const d=db();try{const id=seed(d);assert.throws(()=>d.sql.prepare("INSERT OR REPLACE INTO attachments(id,owner_id,object_key,mime_type,size,created_at,status) VALUES(?,?,?,?,?,?,'ready')").run(id,'bob','replacement-key','image/png',1,'now'),/PHOTO_IDENTITY_IMMUTABLE/);assert.throws(()=>d.sql.prepare("INSERT OR REPLACE INTO attachments(id,owner_id,object_key,mime_type,size,created_at,status) VALUES(?,?,?,?,?,?,'ready')").run(crypto.randomUUID(),'bob','photos/'+id,'image/png',1,'now'),/PHOTO_IDENTITY_IMMUTABLE/);assert.equal(row(d).owner_id,'alice');assert.equal(row(d).object_key,'photos/'+id)}finally{d.sql.close()}
});
test('legacy shared object keys are retained and cannot start physical deletion',async()=>{
 const d=database(false),b=bucket();try{
  const ids=[crypto.randomUUID(),crypto.randomUUID()];for(const id of ids)d.sql.prepare('INSERT INTO attachments(id,owner_id,object_key,mime_type,size,created_at) VALUES(?,?,?,?,?,?)').run(id,'alice','legacy-shared','image/png',1,'old');
  const record=await createRecord(d,'alice',input());d.sql.prepare('UPDATE records SET photo_id=? WHERE id=?').run(ids[1],record.id);
  d.sql.exec(readFileSync(new URL('../drizzle/0005_photo_lifecycle.sql',import.meta.url),'utf8'));
  assert.throws(()=>d.sql.prepare('DELETE FROM attachments WHERE id=?').run(ids[0]),/PHOTO_REFERENCE_CONFLICT/);
  await assert.rejects(()=>deletePhoto(d,b,'alice',ids[0]),e=>e.status===409);assert.equal(b.deletes,0);assert.equal(d.sql.prepare('SELECT count(*) AS n FROM attachments').get().n,2);
  assert.throws(()=>d.sql.prepare("UPDATE attachments SET status='deleting' WHERE id=?").run(ids[0]),/PHOTO_REFERENCE_CONFLICT/);
 }finally{d.sql.close()}
});
