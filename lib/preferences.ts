import {InputError} from "./validation.js";
export const defaultPreferences={name:"",style:"自由詩に近いHaiku",expression:"平易な英語に、気の利いた単語や表現をひとつ",language:"English",appLanguage:"日本語"};
export async function getPreferences(db:D1Database,owner:string){const row=await db.prepare("SELECT name,style,expression,app_language AS appLanguage FROM preferences WHERE owner_id=?").bind(owner).first();return {...defaultPreferences,...row};}
export async function savePreferences(db:D1Database,owner:string,value:unknown){
 const v=value as Record<string,unknown>,appLanguage=v.appLanguage??defaultPreferences.appLanguage;if(!v||typeof v.name!=="string"||v.name.length>100||typeof v.style!=="string"||!["自由詩に近いHaiku","情景を中心とするHaiku","5–7–5の音節を意識する"].includes(v.style)||typeof v.expression!=="string"||v.expression.length>2000||typeof appLanguage!=="string"||!["日本語","English"].includes(appLanguage))throw new InputError("設定内容を確認してください。");
 await db.prepare("INSERT INTO preferences(owner_id,name,style,expression,app_language,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name,style=excluded.style,expression=excluded.expression,app_language=excluded.app_language,updated_at=excluded.updated_at").bind(owner,v.name,v.style,v.expression,appLanguage,new Date().toISOString()).run();return getPreferences(db,owner);
}
