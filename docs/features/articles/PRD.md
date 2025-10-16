# Article Bookmarking - Product Requirements Document

## Overview

Enable users to bookmark articles from the web with rich metadata extraction, creator attribution, and reading time estimates, bringing feature parity with existing YouTube and Spotify bookmark capabilities.

## Problem Statement

Users currently can bookmark YouTube videos and Spotify content with rich metadata (creator info, thumbnails, duration, etc.), but article bookmarking lacks the same level of detail and polish. Users need:
- Visual preview of articles (thumbnail/featured image)
- Author/creator attribution with profile images
- Reading time estimates to plan consumption
- Publication dates to assess content freshness
- Any other contextual metadata that helps evaluate and organize articles

## Goals

### Primary Goals
1. Enable article bookmarking with feature parity to video/podcast content
2. Extract and display article metadata including author, images, reading time, and publication date
3. Associate creators with articles (similar to YouTube channels and Spotify artists)
4. Provide visual consistency in article display across the mobile app

### Secondary Goals
- Support diverse article sources (blogs, news sites, Substack, Medium, etc.)
- Enable filtering and sorting by article-specific metadata
- Improve discoverability of articles through creator profiles

## Target Users

All Zine users who want to save and organize articles alongside their video and podcast content.

## User Stories

1. **As a user**, I want to bookmark an article URL and see the author's name and profile picture, so I can quickly identify who wrote it.

2. **As a user**, I want to see an estimated reading time for articles, so I can decide when to read them based on available time.

3. **As a user**, I want to see when an article was published, so I can assess its relevance and timeliness.

4. **As a user**, I want to see a featured image/thumbnail for articles, so I can visually recognize them in my bookmark list.

5. **As a user**, I want article bookmarks to look and feel consistent with my video and podcast bookmarks, so the app experience is cohesive.

6. **As a user**, I want to follow/subscribe to article authors (creators), so I can discover more of their work.

7. **As a user**, I want to read article content directly in the mobile app, so I can consume content without leaving the app or dealing with ads and cluttered web layouts.

8. **As a user**, I want to read articles offline, so I can consume content even without an internet connection.

## Success Metrics

- **Adoption**: 30%+ of active users bookmark at least one article within first month of launch
- **Metadata Quality**: 80%+ of article bookmarks successfully extract author and reading time
- **Visual Quality**: 70%+ of article bookmarks include a thumbnail image
- **User Satisfaction**: Positive feedback on article bookmark display quality

## Functional Requirements

### FR1: Article URL Detection
- System must detect when a bookmarked URL is an article (vs video/podcast/post)
- Support common article platforms: blogs, Substack, Medium, news sites, personal sites
- Default to `contentType: 'article'` when structured data indicates article content

### FR2: Article Metadata Extraction
The system must extract and store:
- **Required**:
  - Title
  - URL (canonical and original)
  - Content type (`article`)
  - Full-text article content (cleaned HTML or plain text)
- **Preferred** (extract when available):
  - Author name
  - Featured image / thumbnail URL
  - Estimated reading time (in minutes)
  - Word count
  - Publication date
  - Description / excerpt
  - Language

### FR3: Creator/Author Attribution
- Extract author information from article metadata (JSON-LD, Open Graph, meta tags)
- Create or link to existing Creator record for the author
- Store author profile information:
  - Name (required)
  - Avatar/profile image URL
  - Bio/description
  - Website/profile URL
  - Platform-specific ID (e.g., `web:author-name` or `substack:subdomain`)

### FR4: Reading Time Calculation
- Calculate reading time based on word count when not provided by source
- Use standard reading speed: 200 words per minute
- Round up to nearest minute
- Store in `articleMetadata.readingTime` field

### FR5: Article Display in UI
Mobile app must display article bookmarks with:
- Thumbnail image (featured image or author avatar as fallback)
- Article title (2 lines max, truncated with ellipsis)
- Author name with avatar image (if available)
- Publication date (relative format: "2 days ago")
- Reading time badge (e.g., "5 min read")
- Content type icon/indicator

### FR6: In-App Article Reading
Mobile app must provide an article reader interface:
- Display full-text article content within the app
- Support both online fetching and offline reading (from stored content)
- Render article content in a clean, readable format
- Preserve basic formatting (paragraphs, headings, lists, quotes)
- Handle images within article content
- Support text zoom/font size controls
- Open external links in system browser
- Provide option to open original URL in browser

### FR7: Consistency with Existing Content Types
- Article cards should match design patterns of video/podcast cards
- Use same UI components where applicable (MediaRichBookmarkCard, CompactBookmarkCard)
- Support same interactions: tap to view details, long-press for options

## Non-Functional Requirements

### Performance
- Metadata extraction should complete within 10 seconds for 95% of articles
- Support concurrent metadata extraction for batch operations
- Cache extracted metadata to avoid re-fetching

### Reliability
- Gracefully handle failed metadata extraction (store basic title + URL)
- Implement fallback extraction methods (oEmbed → Open Graph → HTML parsing)
- Provide default values when optional metadata is unavailable

### Scalability
- Support article bookmarks from any domain/source
- Database schema accommodates future article metadata fields
- Compatible with existing unified content model

### Data Quality
- Normalize and validate extracted metadata
- Deduplicate authors across articles
- Handle edge cases: no author, no image, no publication date

## Technical Constraints

- Must work within existing Cloudflare Workers + D1 architecture
- Leverage existing metadata extraction infrastructure (`enhanced-metadata-extractor.ts`)
- Utilize existing `creators` table for author storage
- Maintain compatibility with shared types in `@zine/shared`
- **Schema changes required**: Add `fullTextContent` field to `content` table for article text storage
- Full-text extraction may fail for paywalled or JavaScript-heavy sites; handle gracefully
- Content extraction should use existing or new service to clean HTML and extract readable text
- Consider storage limits for D1 when storing full article content

## Scope Changes (Updated)

- **Full-text article extraction**: Moved from Post-MVP to MVP scope
  - Extract and store article content when bookmarking
  - Schema changes required: add `fullTextContent` field to `content` table
  - Use content extraction service for cleaning/formatting HTML
- **In-app article reader**: Moved from Post-MVP to MVP scope
  - Implement article reader UI in mobile app
  - Support both online and offline reading
  - Clean, distraction-free reading experience

## Out of Scope

- Article summarization or AI-generated insights
- Collaborative article annotations
- Article recommendation engine
- RSS feed subscription for authors
- Article version tracking (updates to articles)

## Decisions Made

### 1. Multiple Authors
**Decision**: Store primary/first author in creator field, add secondary authors to `extendedMetadata` JSON

### 2. Reading Speed
**Decision**: Use standard 200 WPM reading speed for all users (no personalization in MVP)

### 3. Paywalled Content
**Decision**: 
- Extract what's available from public metadata
- Show "limited preview" indicator when metadata is incomplete
- No manual editing in MVP

### 4. Article Categorization
**Decision**: Use generic "article" content type for MVP (no subcategories)

### 5. Featured Image Priority
**Decision**: `og:image` → first content image → author avatar → favicon

### 6. Author Deduplication
**Decision**: Implement fuzzy matching by name similarity to unify authors across platforms

### 7. Missing Reading Time
**Decision**: Show nothing (no badge) when reading time cannot be determined

### 8. Full-Text Content Storage
**Decision**: Include full-text extraction and storage in MVP scope
- Extract article content during bookmark creation
- Store as cleaned HTML or plain text in `fullTextContent` field
- Fallback to opening external URL when extraction fails

### 9. Article Content Extraction Method
**Decision**: Use Readability algorithm or similar for content extraction
- Prioritize readable content over raw HTML
- Strip ads, navigation, and clutter
- Preserve essential formatting (headings, paragraphs, images)

### 10. Publication Date Display
**Decision**: 
- Relative for recent articles (< 30 days): "2 days ago"
- Absolute for older articles: "Jan 15, 2023"

### 11. Article Update Tracking
**Decision**: Out of scope for MVP and near-term roadmap

## Dependencies

- Existing metadata extraction service (`enhanced-metadata-extractor.ts`)
- Content repository and database schema
- Creator service for author management
- Mobile UI components (MediaRichBookmarkCard, CompactBookmarkCard)

## Timeline

MVP implementation: 2-3 sprints
- Sprint 1: Backend metadata extraction, full-text content extraction + storage
- Sprint 2: Mobile UI bookmark display + testing
- Sprint 3: Mobile article reader UI + offline reading support

## Approval

- **Product Owner**: [Pending]
- **Engineering Lead**: [Pending]
- **Design Lead**: [Pending]
