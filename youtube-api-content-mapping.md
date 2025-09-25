# YouTube API to Content Table Mapping

## YouTube Data API v3 Response Structure

The YouTube API returns data when requesting with parts: `snippet`, `statistics`, `contentDetails`, `status`

### Raw YouTube API Response Example

```json
{
  "items": [{
    "id": "VIDEO_ID",
    "snippet": {
      "title": "iPhone Air Review: Beauty is Pain",
      "description": "Detailed video description...",
      "publishedAt": "2024-01-15T10:30:00Z",
      "channelId": "UC_CHANNEL_ID",
      "channelTitle": "Tech Channel Name",
      "thumbnails": {
        "default": { "url": "https://i.ytimg.com/vi/VIDEO_ID/default.jpg", "width": 120, "height": 90 },
        "medium": { "url": "https://i.ytimg.com/vi/VIDEO_ID/mqdefault.jpg", "width": 320, "height": 180 },
        "high": { "url": "https://i.ytimg.com/vi/VIDEO_ID/hqdefault.jpg", "width": 480, "height": 360 },
        "standard": { "url": "https://i.ytimg.com/vi/VIDEO_ID/sddefault.jpg", "width": 640, "height": 480 },
        "maxres": { "url": "https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg", "width": 1280, "height": 720 }
      },
      "tags": ["iphone", "review", "tech", "apple"],
      "categoryId": "28",  // Science & Technology
      "liveBroadcastContent": "none",
      "defaultAudioLanguage": "en"
    },
    "statistics": {
      "viewCount": "125000",
      "likeCount": "3500",
      "commentCount": "250",
      "favoriteCount": "0"
    },
    "contentDetails": {
      "duration": "PT12M34S",  // ISO 8601 duration (12 minutes, 34 seconds)
      "dimension": "2d",
      "definition": "hd",  // "hd" or "sd"
      "caption": "true",   // Has captions available
      "hasCustomThumbnail": true
    },
    "status": {
      "privacyStatus": "public",
      "madeForKids": false
    }
  }]
}
```

## Mapping to Content Table Fields

### Direct Mappings

| YouTube API Field | Content Table Column | Transformation | Example Value |
|---|---|---|---|
| `id` | `external_id` | Direct copy | "tDARtYjUiHs" |
| — | `id` | Generated | "youtube-tDARtYjUiHs" |
| — | `provider` | Static value | "youtube" |
| — | `url` | Original URL | "https://youtu.be/tDARtYjUiHs" |
| — | `canonical_url` | Normalized | "https://youtube.com/watch?v=tDARtYjUiHs" |
| `snippet.title` | `title` | Direct copy | "iPhone Air Review: Beauty is Pain" |
| `snippet.description` | `description` | Direct copy | "Detailed review of the new iPhone..." |
| `snippet.thumbnails.maxres.url` or `.high.url` | `thumbnail_url` | Best available | "https://i.ytimg.com/vi/.../maxresdefault.jpg" |
| — | `favicon_url` | Static | "https://www.youtube.com/s/desktop/.../favicon.ico" |
| `snippet.publishedAt` | `published_at` | Parse to Date | 2024-01-15T10:30:00Z |
| `contentDetails.duration` | `duration_seconds` | Parse ISO 8601 to seconds | 754 (for PT12M34S) |
| `statistics.viewCount` | `view_count` | Parse to integer | 125000 |
| `statistics.likeCount` | `like_count` | Parse to integer | 3500 |
| `statistics.commentCount` | `comment_count` | Parse to integer | 250 |
| — | `content_type` | Static value | "video" |
| `snippet.channelId` | `creator_id` | Direct copy | "UC_CHANNEL_ID" |
| `snippet.channelTitle` | `creator_name` | Direct copy | "Tech Channel Name" |
| `snippet.categoryId` | `category` | Direct copy | "28" |
| `snippet.tags` | `tags` | JSON stringify array | '["iphone","review","tech"]' |
| `snippet.defaultAudioLanguage` | `language` | Direct copy | "en" |
| `contentDetails.caption === 'true'` | `has_captions` | Boolean (0/1) | 1 |
| `contentDetails.definition === 'hd'` | `has_hd` | Boolean (0/1) | 1 |
| `contentDetails.definition` | `video_quality` | Map to resolution | "1080p" or "480p" |
| `status.madeForKids === false` | `is_explicit` | Inverse boolean | 1 (if not for kids) |

### Calculated/Derived Fields

| Content Table Column | Calculation Method | Example Value |
|---|---|---|
| `normalized_title` | Lowercase, remove special chars | "iphone air review beauty is pain" |
| `content_fingerprint` | SHA256 hash of key fields | "ad266b46efe5bad4..." |
| `engagement_rate` | (likes + comments) / views | 0.03 (3%) |
| `popularity_score` | Log scale of views (0-100) | 75 |
| `enrichment_version` | Increment on update | 1, 2, 3... |
| `enrichment_source` | Source of data | "youtube_api" |

### Metadata JSON Fields (stored as stringified JSON)

#### statistics_metadata
```json
{
  "viewCount": 125000,
  "likeCount": 3500,
  "commentCount": 250,
  "favoriteCount": 0,
  "dislikeCount": null  // No longer provided by API
}
```

#### technical_metadata  
```json
{
  "duration": "PT12M34S",
  "durationSeconds": 754,
  "dimension": "2d",
  "definition": "hd",
  "hasCustomThumbnail": true,
  "caption": "true",
  "liveBroadcastContent": "none"
}
```

#### enrichment_metadata
```json
{
  "extractedAt": "2025-01-23T10:44:32.038Z",
  "source": "youtube_api",
  "apiVersion": "v3",
  "raw": { /* Complete API response */ }
}
```

### Fields Currently NULL (need additional API calls or not available)

| Content Table Column | Why NULL | How to Get Data |
|---|---|---|
| `share_count` | YouTube API doesn't provide | Not available |
| `save_count` | YouTube API doesn't provide | Not available |
| `trending_score` | Requires trending API | Separate trending endpoint |
| `creator_handle` | Not in video response | Need channel API call |
| `creator_thumbnail` | Not in video response | Need channel API call |
| `creator_verified` | Not in video response | Need channel API call |
| `creator_subscriber_count` | Not in video response | Need channel API call |
| `series_id` | For playlists only | Playlist API if applicable |
| `series_name` | For playlists only | Playlist API if applicable |
| `episode_number` | For series content | Parse from title/description |
| `subcategory` | Single category only | Manual categorization |
| `age_restriction` | Limited info | Only madeForKids flag |
| `topics` | Not provided | Would need NLP analysis |
| `has_transcript` | Not in API | Separate caption API |
| `has_4k` | Not detailed enough | Only "hd" or "sd" |
| `audio_quality` | Not provided | Not available |
| `audio_languages` | Only default language | Caption API for all languages |
| `caption_languages` | Not in video response | Separate caption API call |

## Data Flow

1. **User saves YouTube URL** → Mobile/Web app calls `/api/v1/enriched-bookmarks/save-enriched`

2. **API Enrichment Service** checks for YouTube OAuth token for user

3. **YouTube API Call** fetches video with parts: `snippet,statistics,contentDetails,status`

4. **Transform Data** using `transformYouTubeApiResponse()`:
   - Parse duration from ISO 8601 to seconds
   - Convert string counts to integers
   - Map HD/SD to resolution strings
   - Extract best thumbnail URL

5. **Create Content Record** with:
   - Direct mapped fields
   - Calculated engagement metrics
   - JSON stringified metadata objects
   - Timestamps and version tracking

6. **Store in Database** with proper JSON serialization for object fields

## Example: What Gets Stored

For the YouTube video "iPhone Air Review: Beauty is Pain" (ID: tDARtYjUiHs):

```sql
INSERT INTO content (
  id: 'youtube-tDARtYjUiHs',
  external_id: 'tDARtYjUiHs', 
  provider: 'youtube',
  url: 'https://youtu.be/tDARtYjUiHs',
  title: 'iPhone Air Review: Beauty is Pain',
  description: 'Full review of the latest iPhone...',
  thumbnail_url: 'https://i.ytimg.com/vi/tDARtYjUiHs/maxresdefault.jpg',
  published_at: '2024-01-15T10:30:00Z',
  duration_seconds: 754,
  view_count: 125000,
  like_count: 3500,
  comment_count: 250,
  content_type: 'video',
  creator_id: 'UC_xyz123',
  creator_name: 'Tech Reviews Channel',
  category: '28',
  language: 'en',
  tags: '["iphone","review","tech","apple"]',
  has_captions: 1,
  has_hd: 1,
  video_quality: '1080p',
  is_explicit: 1,
  engagement_rate: 0.03,
  popularity_score: 75,
  statistics_metadata: '{"viewCount":125000,"likeCount":3500,...}',
  technical_metadata: '{"duration":"PT12M34S","durationSeconds":754,...}',
  enrichment_metadata: '{"extractedAt":"2025-01-23T10:44:32.038Z",...}',
  enrichment_version: 1,
  enrichment_source: 'youtube_api'
)
```

## Limitations & Future Improvements

1. **Channel Information**: Currently missing channel details (avatar, subscriber count, verification status). Could be fetched with additional API call to `/channels` endpoint.

2. **Captions/Transcripts**: Not fetched. Could use `/captions` endpoint for transcript data.

3. **Video Quality Details**: API only provides "hd" or "sd", not specific resolutions like 4K, 1440p, etc.

4. **Engagement Metrics**: No dislike count (YouTube removed from API), share count not available.

5. **Series/Playlist Context**: If video is part of a playlist, that context isn't captured unless explicitly querying playlist API.

6. **Rate Limiting**: YouTube API has quota limits (10,000 units/day default), each video query costs ~3 units.