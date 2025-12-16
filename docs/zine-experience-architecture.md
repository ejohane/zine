# Zine – Experience & Information Architecture

## Purpose

This document defines the **user experience, navigation model, and interaction philosophy** for the Zine application.

It captures:

- The mental model of the app
- The responsibilities of each primary surface
- How users move between surfaces
- What each screen explicitly does and does not do

This document is intended to be used as:

- Product vision reference
- UX design input
- Architecture alignment artifact
- Input context for other LLMs

---

## High-Level Experience Philosophy

Zine is a **personal content curation tool**, not a reader, player, or social feed.

The experience optimizes for:

- Low cognitive load
- Clear decision points
- Long-term recall
- Calm, browseable surfaces

Core principles:

- One primary job per screen
- Decisions first, organization later
- Local-first, instant interactions
- Optional structure, never mandatory

---

## Primary Navigation

Zine has **three primary tabs**:

1. **Home**
2. **Inbox**
3. **Library**

Each tab represents a distinct mental mode.

---

## 1. Home – Re-entry & Discovery

### Purpose

> “Where do I want to go next?”

Home is a **curated launchpad**, not an exhaustive list.

### Characteristics

- Read-only
- Fast scanning
- Opinionated groupings
- Short lists
- No heavy controls

### Example Sections

- **Recent Bookmarks**
- **Jump Back In**
- **Podcasts**
- **Videos**
- **Tags** (future)

Each section is a **shortcut**, not a destination:

- Tapping a section routes into a filtered Library view
- Home never attempts to show everything

### Explicit Non-Goals

- No global search
- No deep filtering
- No full lists
- No editing actions

---

## 2. Inbox – Decision Queue

### Purpose

> “What do I keep, and what do I discard?”

Inbox is a **finite queue of new content** arriving from Sources.

### Default Behavior

- Sorted by `ingestedAt` (newest first)
- Feels like a task queue
- Designed for quick triage

### Primary Actions

- **Bookmark** – keep for later
- **Archive** – pass on

### Filters (MVP)

- Provider (YouTube, Spotify, X, Substack, etc.)
- Content type (video, podcast, article, post)

### Search

- Scoped to Inbox only
- Used to narrow the current queue
- Not global

### Explicit Non-Goals

- No tagging
- No organization
- No long-term browsing
- No content playback

Inbox is about **decisions, not structure**.

---

## 3. Library – Long-Term Memory

### Purpose

> “What do I already have?”

Library is the **authoritative store of saved content**.

### Default View

- Unified list of all bookmarked items
- Sorted by `bookmarkedAt` (most recent first)
- All content types mixed

### Interaction Model

- **Browse-first**
- Search as an accelerator, not a gate
- Calm, scrollable experience

### Filters (MVP)

- Provider
- Content type

### Segmentation

- Podcasts / Videos / Articles are implemented as **filters**, not separate modes
- Home can deep-link into these filtered Library views

### Search

- Lives primarily in Library
- Screen-scoped
- Local-first and offline-capable
- Used to recall known content

### Explicit Non-Goals

- No forced organization
- No required tagging
- No complex query builders

---

## Tagging Model

### Philosophy

- Tags are **optional and reflective**
- Organization happens _after_ saving, not during triage

### Where Tags Live

- Library item detail
- Library editing flows (future)

### Where Tags Do NOT Live

- Inbox triage
- Bookmark action itself (no interruption)

### Future Use

- Tag filtering in Library
- Tag-based sections on Home

---

## Content Types

- Content type is **stored at ingestion time**
- Default mapping per provider:
  - YouTube → video
  - Spotify → podcast
  - Substack → article
  - X → post

Cross-provider equivalence (e.g., YouTube + Spotify podcast episodes) is **out of scope for MVP**, but explicitly supported as a future extension.

---

## Screen Responsibilities Summary

| Screen  | Primary Job            | Does NOT Do               |
| ------- | ---------------------- | ------------------------- |
| Home    | Re-entry & shortcuts   | Store, search, edit       |
| Inbox   | Decide keep vs discard | Organize, tag, browse     |
| Library | Recall & retrieval     | Triage, enforce structure |

---

## Why This Experience Works

- Clear separation of mental modes
- Low-friction Inbox flow
- Calm Library browsing
- Home stays lightweight and useful
- No surface tries to do too much
- Strong alignment with local-first architecture

---

## Future-Friendly by Design

This experience model naturally supports:

- Tags
- Saved searches
- Podcast work/edition grouping
- Web client parity
- Smarter Home curation

Without requiring re-architecture.

---

**End of document**
