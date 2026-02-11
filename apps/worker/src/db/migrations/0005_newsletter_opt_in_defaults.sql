-- Created: 2026-02-08
-- Make existing newsletter feeds opt-in by default.
-- Keep this migration data-only to avoid SQLite FK rebuild issues on local D1.

UPDATE `newsletter_feeds`
SET `status` = 'UNSUBSCRIBED',
    `updated_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE `status` != 'UNSUBSCRIBED';
