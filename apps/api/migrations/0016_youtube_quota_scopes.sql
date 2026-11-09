-- Preserve the observed video-page cooldown; published feeds and the official
-- Google API use different resources and must not inherit that page restriction.
INSERT OR IGNORE INTO provider_budgets(scope,not_before,lease_until,lease_token,consecutive_limits)
SELECT 'provider:youtube:watch',not_before,lease_until,lease_token,consecutive_limits FROM provider_budgets WHERE scope='provider:youtube';
-- These feed jobs have never attempted an upstream request. They were deferred
-- only by the former shared gate; retain their IDs and attempt counters.
UPDATE jobs SET available_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),last_dispatched_at=NULL
WHERE kind='sync' AND status='pending' AND attempts=0 AND last_error_code IS NULL
AND json_extract(payload_json,'$.subscriptionId') IN (SELECT s.id FROM subscriptions s JOIN source_routes r ON r.id=s.route_id WHERE r.kind='youtube_feed');
