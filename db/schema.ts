import {sql} from "drizzle-orm";
import {sqliteTable,text,integer,check,index,uniqueIndex} from "drizzle-orm/sqlite-core";
export const records=sqliteTable("records",{
id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),createKey:text("create_key").notNull(),
sceneText:text("scene_text").notNull(),haikuText:text("haiku_text").notNull().default(""),
eventText:text("event_text").notNull().default(""),emotionText:text("emotion_text").notNull().default(""),
photoId:text("photo_id").notNull().default(""),
recordDate:text("record_date").notNull(),status:text("status",{enum:["draft","completed"]}).notNull(),
revision:integer("revision").notNull().default(1),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()
},t=>[uniqueIndex("records_owner_create").on(t.ownerId,t.createKey),index("records_owner_date").on(t.ownerId,t.recordDate),
check("records_status",sql`${t.status} IN ('draft','completed')`),
check("records_completed_content",sql`${t.status} != 'completed' OR (length(trim(${t.sceneText})) > 0 AND length(trim(${t.haikuText})) > 0)`)]);
export const preferences=sqliteTable("preferences",{ownerId:text("owner_id").primaryKey(),name:text("name").notNull().default(""),style:text("style").notNull().default("自由詩に近いHaiku"),expression:text("expression").notNull().default("平易な英語に、気の利いた単語や表現をひとつ"),updatedAt:text("updated_at").notNull()});
export const attachments=sqliteTable("attachments",{id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),objectKey:text("object_key").notNull(),mimeType:text("mime_type").notNull(),size:integer("size").notNull(),createdAt:text("created_at").notNull()},t=>[index("attachments_owner").on(t.ownerId)]);
export const generationJobs=sqliteTable("generation_jobs",{id:text("id").primaryKey(),ownerId:text("owner_id").notNull(),requestKey:text("request_key").notNull(),inputJson:text("input_json").notNull(),status:text("status").notNull(),outputJson:text("output_json"),model:text("model").notNull(),usageJson:text("usage_json"),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull()},t=>[uniqueIndex("generation_owner_request").on(t.ownerId,t.requestKey),index("generation_owner_date").on(t.ownerId,t.createdAt)]);

