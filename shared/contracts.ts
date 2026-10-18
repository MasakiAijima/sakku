/** Client-independent contracts. No browser, React, database or authentication imports. */
export type RecordStatus = "draft" | "completed";
export type RecordInput = {
  sceneText: string; haikuText: string; recordDate: string; status: RecordStatus;
  eventText?: string; emotionText?: string;
  photoId?: string;
  photoIds?: string[];
};
export type CreateRecordInput = RecordInput & {createKey: string};
export type UpdateRecordInput = RecordInput & {revision: number};
/** Snake-case keys retained for compatibility with the first Web API. No owner IDs. */
export type RecordView = {
  id: string; scene_text: string; haiku_text: string; record_date: string;
  event_text: string; emotion_text: string; status: RecordStatus; revision: number;
  photo_id: string; photo_ids: string[];
  generation_job_id: string | null; selected_candidate_index: number | null;
  created_at: string; updated_at: string;
};
export type RecordPage = {records: RecordView[]; nextCursor: string | null};
export type RecordQuery = {from?: string; to?: string; limit?: number; cursor?: string};
