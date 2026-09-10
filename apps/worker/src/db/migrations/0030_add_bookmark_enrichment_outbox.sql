CREATE TABLE bookmark_enrichment_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_item_id TEXT NOT NULL REFERENCES user_items(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL CHECK (trigger IN ('manual_save', 'inbox_bookmark')),
  created_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX bookmark_enrichment_outbox_user_item_idx ON bookmark_enrichment_outbox(user_item_id);
--> statement-breakpoint
CREATE INDEX bookmark_enrichment_outbox_due_idx ON bookmark_enrichment_outbox(next_attempt_at);
