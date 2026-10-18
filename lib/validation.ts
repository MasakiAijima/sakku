export class InputError extends Error{constructor(message:string,public status=422){super(message)}}
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validDate(date:unknown):date is string{return typeof date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(Date.parse(date+"T00:00:00Z"))&&new Date(date+"T00:00:00Z").toISOString().slice(0,10)===date;}
function optionalNote(value:unknown){if(value===undefined)return undefined;if(typeof value!=="string"||value.length>5000)throw new InputError("補助入力は5,000文字以内で入力してください。");return value;}
function parsePhotoId(value:unknown):string|undefined{
 if(value===undefined)return undefined;
 if(typeof value!=="string"||(value!==""&&!UUID.test(value)))throw new InputError("写真を確認してください。");
 return value;
}
function parsePhotoIds(value:unknown):string[]|undefined{
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length>12)throw new InputError("写真は重複のない12枚以内で指定してください。");
 const ids:string[]=[];
 for(const id of value){
  if(typeof id!=="string"||!UUID.test(id)||ids.includes(id))throw new InputError("写真は重複のない12枚以内で指定してください。");
  ids.push(id);
 }
 return ids;
}
export function parseRecord(input:unknown){
if(!input||typeof input!=="object"||Array.isArray(input))throw new InputError("入力を確認してください。");
const v=input as Record<string,unknown>;
if(typeof v.sceneText!=="string"||typeof v.haikuText!=="string")throw new InputError("情景文とHaikuを確認してください。");
const sceneText=v.sceneText.trim(),haikuText=v.haikuText.replace(/\r\n/g,"\n").trim();
if(sceneText.length>10000||haikuText.length>1000)throw new InputError("文章が長すぎます。");
if(v.status!=="draft"&&v.status!=="completed")throw new InputError("保存形式を確認してください。");
const eventText=optionalNote(v.eventText),emotionText=optionalNote(v.emotionText);
const photoId=parsePhotoId(v.photoId);
const photoIds=parsePhotoIds(v.photoIds);
if(photoIds!==undefined&&photoId!==undefined&&photoId!==(photoIds[0]??""))throw new InputError("先頭の写真を確認してください。");
const generationJobId=v.generationJobId;if(generationJobId!==undefined&&generationJobId!==""&&(typeof generationJobId!=="string"||!UUID.test(generationJobId)))throw new InputError("生成履歴を確認してください。");
const selectedCandidateIndex=v.selectedCandidateIndex;if(selectedCandidateIndex!==undefined&&selectedCandidateIndex!==null&&(!Number.isInteger(selectedCandidateIndex)||Number(selectedCandidateIndex)<0||Number(selectedCandidateIndex)>2))throw new InputError("選択した候補を確認してください。");
if(!sceneText&&!haikuText&&!eventText?.trim()&&!emotionText?.trim())throw new InputError("情景文をひとこと書いてください。");
if(v.status==="completed"){
if(!sceneText||!haikuText)throw new InputError("完成記録には情景文とHaikuが必要です。");
const lines=haikuText.split("\n");if(lines.length!==3||lines.some(l=>!l.trim()))throw new InputError("Haikuは空行のない3行で入力してください。");}
const date=v.recordDate;
if(!validDate(date))throw new InputError("有効な記録日を選んでください。");
return {sceneText,haikuText,recordDate:date,status:v.status,eventText,emotionText,photoId,photoIds,generationJobId:generationJobId as string|undefined,selectedCandidateIndex:selectedCandidateIndex as number|undefined};
}
export function parseRevision(v:unknown){if(!Number.isInteger(v)||Number(v)<1)throw new InputError("編集版を確認してください。");return Number(v);}
