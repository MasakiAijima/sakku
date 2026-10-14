import {z} from "zod";
import {InputError, UUID} from "./validation.js";
import {parsePhoto, PhotoFormatError, type PhotoInfo} from "../shared/photo.js";
export type PhotoState = "uploading" | "ready" | "deleting";
type Attachment = {id: string; owner_id: string; object_key: string; mime_type: string; size: number; created_at: string; status: PhotoState};
type InventoryRow = Attachment & {unused: number};
type PhotoBucket = Pick<R2Bucket, "put" | "get" | "delete">;
const unavailable = () => new InputError("写真の保存を完了できませんでした。もう一度お試しください。", 503);
export function photoReferenceError(error: unknown) {
  return error instanceof Error && /\bPHOTO_REFERENCE_CONFLICT\b/.test(error.message);
}
async function storage<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { if (error instanceof InputError) throw error; throw unavailable(); }
}
const cursorSchema = z.object({createdAt: z.string().min(1).max(64), id: z.string().uuid()}).strict();
export function photoPageOptions(url: URL) {
  const rawLimit = url.searchParams.get("limit") ?? "50";
  if (!/^[1-9]\d?$/.test(rawLimit) || Number(rawLimit) > 50) throw new InputError("一覧の件数を確認してください。");
  let after: z.infer<typeof cursorSchema> | undefined;
  const cursor = url.searchParams.get("cursor");
  if (cursor) {
    try { if (cursor.length > 512) throw Error(); after = cursorSchema.parse(JSON.parse(cursor)); }
    catch { throw new InputError("一覧の続きの位置を確認してください。"); }
  }
  return {limit: Number(rawLimit), after};
}
type PageOptions = ReturnType<typeof photoPageOptions>;
async function attachment(db: D1Database, owner: string, id: string) {
  if (!UUID.test(id)) throw new InputError("写真が見つかりません。", 404);
  const row = await db.prepare("SELECT * FROM attachments WHERE id=? AND owner_id=?").bind(id, owner).first<Attachment>();
  if (!row) throw new InputError("写真が見つかりません。", 404);
  return row;
}
async function finishDelete(db: D1Database, bucket: PhotoBucket, row: Attachment) {
  try {
    await bucket.delete(row.object_key);
    await db.prepare("DELETE FROM attachments WHERE id=? AND owner_id=? AND status='deleting'").bind(row.id, row.owner_id).run();
    return true;
  } catch { return false; }
}
export async function uploadPhoto(db: D1Database, bucket: PhotoBucket, owner: string, bytes: Uint8Array) {
  let info: PhotoInfo;
  try { info = parsePhoto(bytes); }
  catch (error) { if (error instanceof PhotoFormatError) throw new InputError(error.message); throw error; }
  return storage(async () => {
    const id = crypto.randomUUID();
    const row: Attachment = {id, owner_id: owner, object_key: "photos/" + id, mime_type: info.mimeType, size: bytes.length, created_at: new Date().toISOString(), status: "uploading"};
    await db.prepare("INSERT INTO attachments(id,owner_id,object_key,mime_type,size,created_at,status) VALUES(?,?,?,?,?,?,'uploading')").bind(row.id, owner, row.object_key, row.mime_type, row.size, row.created_at).run();
    await bucket.put(row.object_key, bytes, {httpMetadata: {contentType: info.mimeType}});
    try {
      const result = await db.prepare("UPDATE attachments SET status='ready' WHERE id=? AND owner_id=? AND status='uploading'").bind(row.id, owner).run();
      if (!result.meta.changes) throw unavailable();
    } catch (error) {
      try {
        const claimed = await db.prepare("UPDATE attachments SET status='deleting' WHERE id=? AND owner_id=? AND status='uploading'").bind(row.id, owner).run();
        if (claimed.meta.changes) await finishDelete(db, bucket, {...row, status: "deleting"});
      } catch { /* The journal retains the uncertain publication. */ }
      throw error;
    }
    return {id: row.id, url: "/api/photos/" + row.id};
  });
}
export async function getPhoto(db: D1Database, bucket: PhotoBucket, owner: string, id: string) {
  return storage(async () => {
    const row = await attachment(db, owner, id);
    if (row.status !== "ready") throw new InputError("写真が見つかりません。", 404);
    const object = await bucket.get(row.object_key);
    if (!object) throw new InputError("写真が見つかりません。", 404);
    return new Response(object.body, {headers: {"Content-Type": row.mime_type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"}});
  });
}
export async function deletePhoto(db: D1Database, bucket: PhotoBucket, owner: string, id: string) {
  return storage(async () => {
    const row = await attachment(db, owner, id);
    if (row.status === "uploading") throw new InputError("保存の確認が終わっていない写真は削除できません。", 409);
    if (row.status === "ready") {
      const result = await db.prepare("UPDATE attachments SET status='deleting' WHERE id=? AND owner_id=? AND status='ready' AND NOT EXISTS(SELECT 1 FROM records WHERE photo_id=attachments.id) AND NOT EXISTS(SELECT 1 FROM attachments other WHERE other.object_key=attachments.object_key AND other.id!=attachments.id)").bind(id, owner).run();
      if (!result.meta.changes && (await attachment(db, owner, id)).status !== "deleting") throw new InputError("写真は削除できません。記録と保存状態を確認してください。", 409);
    }
    return {deleted: await finishDelete(db, bucket, {...row, status: "deleting"})};
  });
}
async function pageRows(db: D1Database, owner: string, options: PageOptions, deletingOnly = false) {
  const clauses = ["a.owner_id=?"], values: (string | number)[] = [owner];
  if (deletingOnly) clauses.push("a.status='deleting'");
  if (options.after) { clauses.push("(a.created_at,a.id)>(?,?)"); values.push(options.after.createdAt, options.after.id); }
  const rows = (await db.prepare("SELECT a.*,NOT EXISTS(SELECT 1 FROM records WHERE photo_id=a.id) AS unused FROM attachments a WHERE " + clauses.join(" AND ") + " ORDER BY a.created_at,a.id LIMIT ?").bind(...values, options.limit + 1).all<InventoryRow>()).results;
  const selected = rows.slice(0, options.limit), last = selected.at(-1);
  return {rows: selected, nextCursor: rows.length > options.limit && last ? JSON.stringify({createdAt: last.created_at, id: last.id}) : null};
}
export async function listPhotos(db: D1Database, owner: string, options: PageOptions) {
  return storage(async () => {
    const {rows, nextCursor} = await pageRows(db, owner, options);
    return {photos: rows.map(row => ({id: row.id, status: row.status, createdAt: row.created_at, size: row.size, mimeType: row.mime_type, unused: Boolean(row.unused), ...(row.status === "ready" ? {url: "/api/photos/" + row.id} : {})})), nextCursor};
  });
}
export async function recoverPhotos(db: D1Database, bucket: PhotoBucket, owner: string, options: PageOptions) {
  return storage(async () => {
    const {rows, nextCursor} = await pageRows(db, owner, options, true), outcomes: {id: string; deleted: boolean}[] = [];
    for (const row of rows) outcomes.push({id: row.id, deleted: await finishDelete(db, bucket, row)});
    const pending = await db.prepare("SELECT count(*) AS count FROM attachments WHERE owner_id=? AND status='uploading'").bind(owner).first<{count: number}>();
    return {outcomes, nextCursor, unresolvedUploading: pending?.count ?? 0};
  });
}
