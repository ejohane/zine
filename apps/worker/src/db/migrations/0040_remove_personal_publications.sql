-- Retire Your Zine, Weekly Wrapped, and publication delivery.
-- Drop dependents first with foreign keys enabled; saved items and reading history remain.
DROP TABLE IF EXISTS personal_push_jobs;
DROP TABLE IF EXISTS personal_issue_visits;
DROP TABLE IF EXISTS personal_discovery_references;
DROP TABLE IF EXISTS personal_digest_cursors;
DROP TABLE IF EXISTS personal_publication_activity;
DROP TABLE IF EXISTS personal_push_installations;
DROP TABLE IF EXISTS personal_delivery_preferences;
DROP TABLE IF EXISTS personal_publication_fanout;
DROP TABLE IF EXISTS personal_publication_outbox;
DROP TABLE IF EXISTS personal_publication_events;
DROP TABLE IF EXISTS personal_publication_subscriptions;
DROP TABLE IF EXISTS personal_publication_mutations;
DROP TABLE IF EXISTS personal_issue_selections;
DROP TABLE IF EXISTS personal_issue_sections;
DROP TABLE IF EXISTS personal_issues;
DROP TABLE IF EXISTS personal_publication_assets;
DROP TABLE IF EXISTS personal_publications;
DROP TABLE IF EXISTS weekly_recap_draft_requests;
DROP TABLE IF EXISTS weekly_recap_windows;
DROP TABLE IF EXISTS weekly_recap_preferences;
DROP TABLE IF EXISTS weekly_recap_jobs;
DROP INDEX IF EXISTS user_item_consumption_events_window;
-- This extra source snapshot existed only for Weekly Wrapped.
ALTER TABLE editorial_feedback_events DROP COLUMN target_source_snapshot_json;
