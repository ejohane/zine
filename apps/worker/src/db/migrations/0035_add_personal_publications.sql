CREATE TABLE personal_publications (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
 handle TEXT NOT NULL UNIQUE, editor_name TEXT NOT NULL, display_name TEXT, description TEXT,
 cover_asset_id TEXT, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at INTEGER NOT NULL, unavailable_at INTEGER
);
CREATE TABLE personal_publication_assets (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 storage_key TEXT NOT NULL, content_type TEXT NOT NULL, byte_size INTEGER NOT NULL,
 created_at INTEGER NOT NULL, unavailable_at INTEGER
);
CREATE TABLE personal_issues (
 id TEXT PRIMARY KEY NOT NULL, publication_id TEXT NOT NULL REFERENCES personal_publications(id),
 kind TEXT NOT NULL CHECK(kind IN ('WEEKLY','INDEPENDENT')),
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED')),
 title TEXT NOT NULL DEFAULT '', introduction TEXT, cover_asset_id TEXT,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0), published_at INTEGER,
 weekly_window_id TEXT, weekly_timezone TEXT, weekly_start INTEGER, weekly_end INTEGER,
 created_at INTEGER NOT NULL, unavailable_at INTEGER,
 CHECK((kind='INDEPENDENT' AND weekly_window_id IS NULL) OR (kind='WEEKLY' AND weekly_window_id IS NOT NULL)),
 UNIQUE(publication_id,weekly_window_id)
);
CREATE INDEX personal_issues_archive_idx ON personal_issues(publication_id,status,unavailable_at,id);
CREATE TABLE personal_issue_sections (
 id TEXT PRIMARY KEY NOT NULL, issue_id TEXT NOT NULL REFERENCES personal_issues(id),
 heading TEXT, position INTEGER NOT NULL, removed_at INTEGER
);
CREATE INDEX personal_sections_issue_idx ON personal_issue_sections(issue_id,position);
CREATE TABLE personal_issue_selections (
 id TEXT PRIMARY KEY NOT NULL, issue_id TEXT NOT NULL REFERENCES personal_issues(id),
 section_id TEXT NOT NULL REFERENCES personal_issue_sections(id), item_id TEXT NOT NULL REFERENCES items(id),
 bookmark_id TEXT, metadata_json TEXT NOT NULL, source_fingerprint TEXT NOT NULL,
 commentary TEXT, position INTEGER NOT NULL, first_published_revision INTEGER,
 first_published_at INTEGER, removed_at INTEGER
);
CREATE UNIQUE INDEX personal_selection_item_idx ON personal_issue_selections(issue_id,item_id) WHERE removed_at IS NULL;
CREATE INDEX personal_selections_issue_idx ON personal_issue_selections(issue_id,section_id,position);
CREATE TABLE personal_publication_mutations (
 id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id),
 operation TEXT NOT NULL, key TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL,
 created_at INTEGER NOT NULL, UNIQUE(actor_id,operation,key)
);
CREATE TABLE personal_publication_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
 publication_id TEXT NOT NULL REFERENCES personal_publications(id), issue_id TEXT NOT NULL REFERENCES personal_issues(id),
 revision INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('ISSUE_PUBLISHED','SELECTIONS_ADDED','ISSUE_CORRECTED','SELECTIONS_REMOVED','ISSUE_UNAVAILABLE')),
 selection_ids_json TEXT NOT NULL, occurred_at INTEGER NOT NULL, UNIQUE(issue_id,revision,kind)
);
CREATE TABLE personal_publication_outbox (
 event_id TEXT PRIMARY KEY NOT NULL REFERENCES personal_publication_events(id),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL, completed_at INTEGER
);
CREATE INDEX personal_outbox_due_idx ON personal_publication_outbox(completed_at,next_attempt_at);
CREATE TABLE personal_publication_subscriptions (
 publication_id TEXT NOT NULL REFERENCES personal_publications(id), subscriber_id TEXT NOT NULL REFERENCES users(id),
 muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1)), generation INTEGER NOT NULL DEFAULT 1,
 subscribed_at INTEGER NOT NULL, ended_at INTEGER, PRIMARY KEY(publication_id,subscriber_id)
);
CREATE INDEX personal_subscriber_list_idx ON personal_publication_subscriptions(publication_id,ended_at,subscriber_id);
