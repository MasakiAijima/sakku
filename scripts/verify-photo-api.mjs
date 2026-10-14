import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=process.env.PHOTO_API_BASE??'http://127.0.0.1:3000';
const target=new URL(base);
assert.ok(['127.0.0.1','localhost','[::1]'].includes(target.hostname)&&target.protocol==='http:'&&!target.username&&!target.password,'verification requires a local HTTP Worker');
const cookie=process.env.PHOTO_API_COOKIE;
const owner='photo-api-'+crypto.randomUUID();
const auth=cookie?{cookie}:{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@example.test'};
const bytes=readFileSync(new URL('../tests/fixtures/photos/rgb.png',import.meta.url));
async function request(path,init={}){
 const response=await fetch(base+path,{...init,headers:{...auth,...init.headers}});
 assert.equal(response.headers.get('cache-control'),'private, no-store',path);
 return response;
}
const anonymous=await fetch(base+'/api/photos');assert.equal(anonymous.status,401);
const form=new FormData();form.set('photo',new File([bytes],'photo.png',{type:'image/png'}));
const uploaded=await request('/api/photos',{method:'POST',body:form});assert.equal(uploaded.status,201);
const {photo}=await uploaded.json();let record,replacement;
try{
 if(!cookie){
  const bobHeaders={'oai-authenticated-user-id':'other-'+owner,'oai-authenticated-user-email':'other@example.test'};
  assert.equal((await request(photo.url,{headers:bobHeaders})).status,404);
  assert.equal((await request(photo.url,{method:'DELETE',headers:bobHeaders})).status,404);
  assert.deepEqual((await (await request('/api/photos',{headers:bobHeaders})).json()).photos,[]);
 }
 const got=await request(photo.url);assert.equal(got.status,200);assert.equal(got.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await got.arrayBuffer()),bytes);
 let cursor=null,found=false;
 do{
  const response=await request('/api/photos?limit=2'+(cursor?'&cursor='+encodeURIComponent(cursor):''));assert.equal(response.status,200);
  const page=await response.json();found||=page.photos.some(p=>p.id===photo.id&&p.status==='ready'&&p.unused);cursor=page.nextCursor;
 }while(cursor&&!found);
 assert.equal(found,true);
 const body={createKey:crypto.randomUUID(),sceneText:'photo API verification',haikuText:'rain\non the leaf\nfalls',recordDate:'2026-10-14',status:'completed',photoId:photo.id};
 const saved=await request('/api/records',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(saved.status,201);record=(await saved.json()).record;
 const blocked=await request(photo.url,{method:'DELETE'});assert.equal(blocked.status,409);
 const nextForm=new FormData();nextForm.set('photo',new File([bytes],'replacement.png',{type:'image/png'}));
 const nextUpload=await request('/api/photos',{method:'POST',body:nextForm});assert.equal(nextUpload.status,201);replacement=(await nextUpload.json()).photo;assert.notEqual(replacement.id,photo.id);
 const replaced=await request('/api/records/'+record.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...body,revision:record.revision,photoId:replacement.id})});assert.equal(replaced.status,200);record=(await replaced.json()).record;
 const reloaded=await request('/api/records/'+record.id);assert.equal(reloaded.status,200);assert.equal((await reloaded.json()).record.photo_id,replacement.id);
 assert.equal((await request(photo.url)).status,200);
 const removed=await request(photo.url,{method:'DELETE'});assert.equal(removed.status,204);
 assert.equal((await request(replacement.url,{method:'DELETE'})).status,409);
 const detached=await request('/api/records/'+record.id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...body,revision:record.revision,photoId:''})});assert.equal(detached.status,200);record=(await detached.json()).record;
 assert.equal((await request(replacement.url,{method:'DELETE'})).status,204);
 assert.equal((await request(replacement.url)).status,404);
 assert.equal((await request(photo.url)).status,404);
 assert.equal((await request(photo.url,{method:'DELETE'})).status,404);
 const malformed=await request('/api/photos',{method:'POST',headers:{'content-type':'multipart/form-data; boundary=broken'},body:'invalid'});assert.equal(malformed.status,400);
 const forged=new FormData();forged.set('photo',new File([new Uint8Array([255,216,255])],'fake.jpg',{type:'image/jpeg'}));assert.equal((await request('/api/photos',{method:'POST',body:forged})).status,422);
 const wrongOrigin=await request('/api/photos/recover',{method:'POST',headers:{origin:'https://other.example'}});assert.equal(wrongOrigin.status,403);
 const recovery=await request('/api/photos/recover?limit=2',{method:'POST'});assert.equal(recovery.status,200);const recovered=await recovery.json();assert.ok(Array.isArray(recovered.outcomes));assert.equal(typeof recovered.unresolvedUploading,'number');
 console.log('Photo API verified against '+base+'. Real Worker, D1, and R2 requests passed. Detached verification record '+record.id+' remains.');
}finally{
 for(const owned of [photo,replacement].filter(Boolean)){const cleanup=await request(owned.url,{method:'DELETE'});assert.ok([204,404].includes(cleanup.status))}
}
