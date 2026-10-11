import {InputError,validDate,UUID} from "./validation.js";
export type PageOptions={from?:string;to?:string;limit:number;after?:{date:string;createdAt:string;id:string}};
export function parseRecordQuery(params:URLSearchParams):PageOptions{
 const from=params.get("from")??undefined,to=params.get("to")??undefined;
 if((from!==undefined&&!validDate(from))||(to!==undefined&&!validDate(to))||(from&&to&&from>=to))throw new InputError("記録の期間を確認してください。");
 const rawLimit=params.get("limit"),limit=rawLimit===null?100:Number(rawLimit);
 if((rawLimit!==null&&!/^\d+$/.test(rawLimit))||!Number.isInteger(limit)||limit<1||limit>100)throw new InputError("取得件数は1〜100件で指定してください。");
 const cursor=params.get("cursor");let after:PageOptions["after"];
 if(cursor!==null){
  try{if(cursor.length>512)throw Error();const a=JSON.parse(atob(cursor));
   if(!a||!validDate(a.date)||typeof a.createdAt!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(a.createdAt)||!Number.isFinite(Date.parse(a.createdAt))||typeof a.id!=="string"||!UUID.test(a.id))throw Error();
   if(a.from!==(from??null)||a.to!==(to??null))throw Error();after={date:a.date,createdAt:a.createdAt,id:a.id};
  }catch{throw new InputError("続きを読み込めません。最初から読み直してください。");}
 }
 return {from,to,limit,after};
}
export function recordCursor(row:{record_date:string;created_at:string;id:string},options:PageOptions){return btoa(JSON.stringify({date:row.record_date,createdAt:row.created_at,id:row.id,from:options.from??null,to:options.to??null}));}
