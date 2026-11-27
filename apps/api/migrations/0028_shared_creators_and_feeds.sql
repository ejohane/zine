-- Shared public provider data. Rows here hold only what a platform publishes to anyone
-- (channel names and avatars, video-to-channel identity, public feed bodies). Nothing a
-- user saved, wrote or derived is stored here, so rows have no owner and survive erasure.

-- 1. Feed entries whose feed published no image stored the feed's own URL as the creator
-- image (`new URL('', feedUrl)` is `feedUrl`). Remove exactly those values.
DELETE FROM contributions
WHERE field = 'creatorImageUrl'
  AND contributor = 'zine:provider'
  AND json_extract(provenance_json, '$.method') = 'feed-ingestion'
  AND json_extract(value_json, '$') = json_extract(provenance_json, '$.sourceUrl');

-- 2. One record per creator (a YouTube channel today). Items show the record's image, so a
-- channel's avatar is fetched once for everyone instead of once per user and per video.
CREATE TABLE creators (
  key TEXT PRIMARY KEY,              -- 'youtube:channel:<UC id>'
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  image_method TEXT,                 -- youtube-data-api | youtube-public-page | legacy-library-migration
  image_observed_at TEXT,
  refresh_after TEXT NOT NULL,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, external_id)
);
CREATE INDEX creators_refresh ON creators(platform, refresh_after);

-- 3. Public YouTube video identity and (time-limited) Data API metadata, shared by
-- everyone who has the video. `channel_id` is an identifier; `data_json` is cleared after
-- 30 days and fetched again when needed.
CREATE TABLE youtube_videos (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT,
  data_json TEXT CHECK (data_json IS NULL OR json_valid(data_json)),
  api_fetched_at TEXT,
  missing INTEGER NOT NULL DEFAULT 0 CHECK (missing IN (0, 1)),
  method TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX youtube_videos_channel ON youtube_videos(channel_id);
CREATE INDEX youtube_videos_api_fetched ON youtube_videos(api_fetched_at) WHERE api_fetched_at IS NOT NULL;

-- 4. One upstream fetch per public feed URL, shared by every subscription that polls it.
CREATE TABLE feed_fetches (
  url_hash TEXT PRIMARY KEY,         -- SHA-256 of the exact feed URL
  url TEXT NOT NULL,
  fetched_at TEXT,
  content_hash TEXT,
  etag TEXT,
  last_modified TEXT,
  artifact_key TEXT,
  lease_token TEXT,
  lease_until TEXT,
  last_error_code TEXT,
  updated_at TEXT NOT NULL
);
-- A changed shared feed brings forward every subscription that polls the same URL.
CREATE INDEX source_routes_url ON source_routes(url);

-- Seed: creators for every subscribed YouTube channel.
INSERT OR IGNORE INTO creators(key, platform, external_id, name, url, refresh_after, created_at, updated_at)
SELECT 'youtube:channel:' || substr(url, 33), 'youtube', substr(url, 33), MAX(name), url,
  '1970-01-01T00:00:00.000Z', MIN(created_at), MIN(created_at)
FROM sources
WHERE platform = 'youtube' AND url LIKE 'https://www.youtube.com/channel/UC%' AND length(url) = 56
GROUP BY url;

-- Seed: creators for channels named by any provider `source` contribution.
INSERT OR IGNORE INTO creators(key, platform, external_id, name, url, refresh_after, created_at, updated_at)
SELECT 'youtube:channel:' || json_extract(k.value_json, '$.id'), 'youtube',
  json_extract(k.value_json, '$.id'), MAX(json_extract(k.value_json, '$.name')),
  'https://www.youtube.com/channel/' || json_extract(k.value_json, '$.id'),
  '1970-01-01T00:00:00.000Z', MIN(k.created_at), MIN(k.created_at)
FROM contributions k JOIN content_items c ON c.id = k.content_id
WHERE c.platform = 'youtube' AND k.field = 'source' AND k.category = 'source'
  AND json_extract(k.value_json, '$.kind') = 'channel'
  AND json_extract(k.value_json, '$.id') LIKE 'UC%'
  AND length(json_extract(k.value_json, '$.id')) = 24
GROUP BY json_extract(k.value_json, '$.id');

-- Seed: the channel of every video a YouTube channel subscription delivered.
INSERT OR IGNORE INTO youtube_videos(video_id, channel_id, method, updated_at)
SELECT substr(c.canonical_url, 33, 11), substr(so.url, 33), 'subscription-source', MIN(o.created_at)
FROM save_occurrences o
JOIN subscriptions s ON s.id = o.subscription_id
JOIN sources so ON so.id = s.source_id
JOIN personal_items p ON p.id = o.item_id
JOIN content_items c ON c.id = p.content_id
WHERE so.platform = 'youtube' AND so.url LIKE 'https://www.youtube.com/channel/UC%' AND length(so.url) = 56
  AND c.platform = 'youtube' AND c.canonical_url LIKE 'https://www.youtube.com/watch?v=%'
  AND length(c.canonical_url) = 43
GROUP BY substr(c.canonical_url, 33, 11);

-- Seed images: an avatar a provider extraction already observed for the channel.
UPDATE creators SET
  image_url = (
    SELECT json_extract(i.value_json, '$') FROM contributions s
    JOIN contributions i ON i.content_id = s.content_id AND i.owner_id IS s.owner_id
      AND i.field = 'creatorImageUrl' AND i.contributor = 'zine:provider'
      AND json_extract(i.provenance_json, '$.method') IN ('youtube-data-api', 'youtube-public-page')
    WHERE s.field = 'source' AND json_extract(s.value_json, '$.id') = creators.external_id
    ORDER BY i.updated_at DESC LIMIT 1),
  image_method = 'youtube-public-page',
  image_observed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE platform = 'youtube' AND image_url IS NULL;

-- Seed images: the avatar the previous app stored on the same owner's videos by this
-- channel, matched on the channel name that owner subscribed under. The first Data API
-- refresh replaces it.
UPDATE creators SET
  image_url = (
    SELECT json_extract(i.value_json, '$') FROM sources so
    JOIN contributions n ON n.owner_id = so.owner_id AND n.field = 'creator'
      AND json_extract(n.provenance_json, '$.method') = 'legacy-library-migration'
      AND json_extract(n.value_json, '$') = so.name
    JOIN content_items c ON c.id = n.content_id AND c.platform = 'youtube'
    JOIN contributions i ON i.content_id = n.content_id AND i.owner_id = n.owner_id
      AND i.field = 'creatorImageUrl'
      AND json_extract(i.provenance_json, '$.method') = 'legacy-library-migration'
    WHERE so.platform = 'youtube' AND so.url = creators.url
    ORDER BY i.created_at DESC LIMIT 1),
  image_method = 'legacy-library-migration',
  image_observed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE platform = 'youtube' AND image_url IS NULL;

UPDATE creators SET image_method = NULL, image_observed_at = NULL WHERE image_url IS NULL;
