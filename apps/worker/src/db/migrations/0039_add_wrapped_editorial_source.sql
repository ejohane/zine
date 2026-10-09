-- Exact opened source, not the surrounding story's related-source context.
ALTER TABLE editorial_feedback_events ADD COLUMN target_source_snapshot_json TEXT;
