import type {CreateRecordInput,UpdateRecordInput,RecordView,RecordPage,RecordQuery} from "./contracts.js";
export class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
/** Reusable client. Host authentication remains a transport/platform responsibility. */
export function createSakkuClient(baseUrl:string,transport:typeof fetch=fetch){
 async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await transport(baseUrl.replace(/\/$/,"")+path,{...init,headers:{...init?.headers,"Content-Type":"application/json"},cache:"no-store"});
  const body=await response.json() as T & {error?:string};
  if(!response.ok)throw new ApiError(body.error??"処理を完了できませんでした。",response.status);
  return body;
 }
 return {
  list(query:RecordQuery={}){const params=new URLSearchParams();for(const [k,v] of Object.entries(query))if(v!==undefined)params.set(k,String(v));return request<RecordPage>("/api/records?"+params);},
  get(id:string){return request<{record:RecordView}>("/api/records/"+encodeURIComponent(id));},
  create(input:CreateRecordInput){return request<{record:RecordView}>("/api/records",{method:"POST",body:JSON.stringify(input)});},
  update(id:string,input:UpdateRecordInput){return request<{record:RecordView}>("/api/records/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(input)});},
 };
}
