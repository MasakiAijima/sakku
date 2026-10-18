import {z} from "zod";
import {InputError} from "./validation.js";
import {haikuParametersSchema} from "./haiku-prompt.js";

export const defaultPreferences={name:"",style:"自由詩に近いHaiku",expression:"平易な英語に、気の利いた単語や表現をひとつ",language:"English",appLanguage:"日本語",parameters:haikuParametersSchema.parse({})};
const preferencesInputSchema=z.object({
 name:z.string().max(100),
 style:z.enum(["自由詩に近いHaiku","情景を中心とするHaiku","5–7–5の音節を意識する"]),
 expression:z.string().max(2000),
 appLanguage:z.enum(["日本語","English"]).default("日本語"),
 parameters:haikuParametersSchema.optional(),
});
const preferencesRowSchema=preferencesInputSchema.omit({parameters:true}).extend({
 juxtaposition:z.number(),cut_strength:z.number(),ambiguity:z.number(),concreteness:z.number(),
});
export async function getPreferences(db:D1Database,owner:string){
 const row=await db.prepare("SELECT name,style,expression,app_language AS appLanguage,juxtaposition,cut_strength,ambiguity,concreteness FROM preferences WHERE owner_id=?").bind(owner).first();
 if(!row)return {...defaultPreferences,parameters:{...defaultPreferences.parameters}};
 const {name,style,expression,appLanguage,...parameters}=preferencesRowSchema.parse(row);
 return {name,style,expression,language:defaultPreferences.language,appLanguage,parameters:haikuParametersSchema.parse(parameters)};
}
export async function savePreferences(db:D1Database,owner:string,value:unknown){
 const parsed=preferencesInputSchema.safeParse(value);
 if(!parsed.success)throw new InputError("設定内容を確認してください。");
 const v=parsed.data,parameters=v.parameters??defaultPreferences.parameters;
 await db.prepare("INSERT INTO preferences(owner_id,name,style,expression,app_language,juxtaposition,cut_strength,ambiguity,concreteness,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name,style=excluded.style,expression=excluded.expression,app_language=excluded.app_language,juxtaposition=CASE WHEN ? THEN excluded.juxtaposition ELSE preferences.juxtaposition END,cut_strength=CASE WHEN ? THEN excluded.cut_strength ELSE preferences.cut_strength END,ambiguity=CASE WHEN ? THEN excluded.ambiguity ELSE preferences.ambiguity END,concreteness=CASE WHEN ? THEN excluded.concreteness ELSE preferences.concreteness END,updated_at=excluded.updated_at")
 .bind(owner,v.name,v.style,v.expression,v.appLanguage,parameters.juxtaposition,parameters.cut_strength,parameters.ambiguity,parameters.concreteness,new Date().toISOString(),Number(v.parameters!==undefined),Number(v.parameters!==undefined),Number(v.parameters!==undefined),Number(v.parameters!==undefined)).run();
 return getPreferences(db,owner);
}
