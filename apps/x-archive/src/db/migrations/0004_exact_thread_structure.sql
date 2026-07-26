ALTER TABLE x_posts ADD COLUMN conversation_id TEXT;
ALTER TABLE x_posts ADD COLUMN structure_json TEXT NOT NULL DEFAULT '{"status":"PARTIAL","source":"DOM_TIMELINE"}';

CREATE INDEX IF NOT EXISTS x_posts_user_conversation_idx
  ON x_posts(user_id, conversation_id, published_at ASC);

ALTER TABLE x_post_relationships ADD COLUMN evidence_source TEXT NOT NULL DEFAULT 'DOM_TIMELINE';
ALTER TABLE x_post_relationships ADD COLUMN observed_at INTEGER;

ALTER TABLE x_timeline_run_items ADD COLUMN group_id TEXT;
ALTER TABLE x_timeline_run_items ADD COLUMN group_type TEXT;
ALTER TABLE x_timeline_run_items ADD COLUMN group_position INTEGER;
ALTER TABLE x_timeline_run_items ADD COLUMN group_item_position INTEGER;
ALTER TABLE x_timeline_run_items ADD COLUMN group_size INTEGER;

ALTER TABLE x_timeline_runs ADD COLUMN structure_coverage_json TEXT NOT NULL DEFAULT '{"primaryPosts":0,"structuredPosts":0,"replyPosts":0,"replyParentsKnown":0,"conversationIdsKnown":0,"status":"PARTIAL","warnings":["legacy_capture_no_structural_coverage"]}';
