CREATE TABLE personal_delivery_preferences (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 timezone TEXT NOT NULL DEFAULT 'UTC', updated_at INTEGER NOT NULL
);
CREATE TABLE personal_publication_activity (
 id TEXT PRIMARY KEY NOT NULL, recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 publication_id TEXT NOT NULL REFERENCES personal_publications(id), generation INTEGER NOT NULL,
 logical_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('ISSUE_PUBLISHED','DAILY_ADDITIONS')),
 issue_ids_json TEXT NOT NULL, selection_ids_json TEXT NOT NULL,
 created_at INTEGER NOT NULL, read_at INTEGER, UNIQUE(recipient_id,logical_key)
);
CREATE INDEX personal_activity_recipient_idx ON personal_publication_activity(recipient_id,id DESC);
CREATE TABLE personal_digest_cursors (
 recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 publication_id TEXT NOT NULL REFERENCES personal_publications(id), generation INTEGER NOT NULL,
 covered_cursor INTEGER NOT NULL DEFAULT 0, next_due_at INTEGER NOT NULL,
 timezone TEXT NOT NULL, claim_token TEXT, lease_until INTEGER, cutoff INTEGER, local_date TEXT,
 PRIMARY KEY(recipient_id,publication_id)
);
CREATE INDEX personal_digest_due_idx ON personal_digest_cursors(next_due_at,lease_until);
CREATE TABLE personal_push_installations (
 id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token TEXT NOT NULL, environment TEXT NOT NULL CHECK(environment IN ('sandbox','production')),
 topic TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), updated_at INTEGER NOT NULL,
 UNIQUE(environment,topic,token)
);
CREATE INDEX personal_push_owner_idx ON personal_push_installations(owner_id,enabled);
CREATE TABLE personal_push_jobs (
 id TEXT PRIMARY KEY NOT NULL, activity_id TEXT NOT NULL REFERENCES personal_publication_activity(id) ON DELETE CASCADE,
 installation_id TEXT NOT NULL REFERENCES personal_push_installations(id) ON DELETE CASCADE,
 token_version INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('PENDING','SENT','SUPPRESSED','FAILED')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
 lease_token TEXT, lease_until INTEGER, reason TEXT, apns_id TEXT,
 UNIQUE(activity_id,installation_id,token_version)
);
CREATE INDEX personal_push_due_idx ON personal_push_jobs(state,next_attempt_at,lease_until);
CREATE TABLE personal_issue_visits (
 reader_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 issue_id TEXT NOT NULL REFERENCES personal_issues(id), last_seen_revision INTEGER NOT NULL,
 presented_at INTEGER NOT NULL, PRIMARY KEY(reader_id,issue_id)
);
CREATE TABLE personal_discovery_references (
 id TEXT PRIMARY KEY NOT NULL, user_item_id TEXT NOT NULL REFERENCES user_items(id) ON DELETE CASCADE,
 selection_id TEXT NOT NULL, issue_id TEXT NOT NULL, publication_id TEXT NOT NULL,
 publication_name TEXT NOT NULL, issue_title TEXT NOT NULL, editor_name TEXT NOT NULL,
 commentary TEXT, saved_at INTEGER NOT NULL, UNIQUE(user_item_id,selection_id)
);
CREATE INDEX personal_discovery_bookmark_idx ON personal_discovery_references(user_item_id,saved_at,id);
