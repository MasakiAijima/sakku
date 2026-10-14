ALTER TABLE attachments ADD status text NOT NULL DEFAULT 'ready' CHECK(status IN ('uploading','ready','deleting'));
--> statement-breakpoint
CREATE INDEX attachments_owner_inventory ON attachments(owner_id,created_at,id);
--> statement-breakpoint
CREATE INDEX records_photo ON records(photo_id);
--> statement-breakpoint
CREATE TRIGGER attachments_identity_immutable BEFORE UPDATE OF id,owner_id,object_key ON attachments
WHEN NEW.id IS NOT OLD.id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.object_key IS NOT OLD.object_key
BEGIN SELECT RAISE(ABORT,'PHOTO_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER attachments_state_transition BEFORE UPDATE OF status ON attachments
WHEN NEW.status IS NOT OLD.status AND NOT ((OLD.status='uploading' AND NEW.status IN ('ready','deleting')) OR (OLD.status='ready' AND NEW.status='deleting'))
BEGIN SELECT RAISE(ABORT,'PHOTO_STATE_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER attachments_referenced_state BEFORE UPDATE OF status ON attachments
WHEN NEW.status!='ready' AND EXISTS(SELECT 1 FROM records WHERE photo_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'PHOTO_REFERENCE_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER attachments_referenced_delete BEFORE DELETE ON attachments
WHEN EXISTS(SELECT 1 FROM records WHERE photo_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'PHOTO_REFERENCE_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER records_photo_insert BEFORE INSERT ON records
WHEN NEW.photo_id!='' AND NOT EXISTS(SELECT 1 FROM attachments WHERE id=NEW.photo_id AND owner_id=NEW.owner_id AND status='ready')
BEGIN SELECT RAISE(ABORT,'PHOTO_REFERENCE_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER records_photo_update BEFORE UPDATE OF photo_id,owner_id ON records
WHEN (NEW.photo_id IS NOT OLD.photo_id OR NEW.owner_id IS NOT OLD.owner_id) AND NEW.photo_id!='' AND NOT EXISTS(SELECT 1 FROM attachments WHERE id=NEW.photo_id AND owner_id=NEW.owner_id AND status='ready')
BEGIN SELECT RAISE(ABORT,'PHOTO_REFERENCE_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER attachments_insert_identity BEFORE INSERT ON attachments
WHEN EXISTS(SELECT 1 FROM attachments WHERE id=NEW.id OR object_key=NEW.object_key)
BEGIN SELECT RAISE(ABORT,'PHOTO_IDENTITY_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER attachments_shared_key_state BEFORE UPDATE OF status ON attachments
WHEN NEW.status='deleting' AND EXISTS(SELECT 1 FROM attachments WHERE object_key=OLD.object_key AND id!=OLD.id)
BEGIN SELECT RAISE(ABORT,'PHOTO_REFERENCE_CONFLICT'); END;
--> statement-breakpoint
CREATE TRIGGER attachments_shared_key_delete BEFORE DELETE ON attachments
WHEN EXISTS(SELECT 1 FROM attachments WHERE object_key=OLD.object_key AND id!=OLD.id)
BEGIN SELECT RAISE(ABORT,'PHOTO_REFERENCE_CONFLICT'); END;
