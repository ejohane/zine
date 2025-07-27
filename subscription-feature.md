# Product Requirements Document (PRD)

**Feature:** Multi-Subscription Content Feeds (Phase 1: Spotify Podcasts & YouTube Channels)  
**Product:** Zine – Intelligent Bookmark Manager  
**Author / Date:** July 27 2025

---

## 1 Purpose

Give Zine users a single place to follow the newest episodes or videos from their favorite creators—starting with Spotify podcasts and YouTube channels—and let them instantly save any item as a bookmark for later consumption.

---

## 2 Background & Motivation

| Pain / Opportunity       | Explanation                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Manual discovery**     | Users must visit multiple apps to find new episodes/videos before bookmarking them in Zine.                                            |
| **Engagement fly-wheel** | Surfacing updates inside Zine increases daily opens and drives more bookmarks, strengthening Zine’s position as a “personal magazine.” |
| **Strategic alignment**  | Extends Zine’s content-type awareness, cross-platform creator grouping, and roadmap toward deeper media integrations.                  |

---

## 3 Scope (Phase 1)

| **In Scope**                                                                                                              | **Out of Scope**                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| • OAuth account linking for **one Spotify account (podcasts only)** and **one YouTube account** per Zine user             | • Additional sources (RSS, Substack, X/Twitter, Apple Podcasts, etc.) |
| • Automated backend polling for new podcast episodes / channel videos on a configurable schedule                          | • Real-time push/webhook ingestion                                    |
| • **Stories-style UI** (circular avatars) ordered by **most recent update**                                               | • Social features, likes, comments, or sharing                        |
| • First-time **subscription selector** plus ongoing **“Manage Subscriptions”** screen to toggle individual shows/channels | • Multiple accounts per service                                       |
| • Inline preview (title, creator, thumbnail, description, duration)                                                       | • Full playback inside Zine                                           |
| • “Save to Zine” action; item marked **Read** when viewed and hidden from “New” queue                                     | • Any kind of push/email/in-app notifications                         |

---

## 4 Goals & Success Metrics

| Goal                                               | Metric / Target                                               |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Increase bookmark creation from subscription feeds | ≥ 20 % of all new bookmarks come from the feed within 30 days |
| Boost daily active usage (DAU)                     | +10 % DAU within 30 days of launch                            |
| Reduce discovery friction                          | Median time from feed open → bookmark ≤ 15 seconds            |

---

## 5 User Personas & Use Cases

1. **Content Curator Casey** – Connects Spotify & YouTube once, scans new items at breakfast, bookmarks a few pieces to read or watch during commutes.
2. **Researcher Riley** – Uses “Manage Subscriptions” to follow niche channels, checks unread queue twice a week, and attaches personal notes when bookmarking.

---

## 6 User-Experience Requirements

| ID       | Requirement                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **UX-1** | Horizontal avatar bar shows each subscribed show/channel, ordered left-to-right by **most recent new item**.                                      |
| **UX-2** | Tapping an avatar opens a vertically swipeable list of **unread** items for that subscription.                                                    |
| **UX-3** | Each item preview includes title, creator name, publish date, duration (if available), and hero thumbnail.                                        |
| **UX-4** | Prominent “Save to Zine” control on every preview; success feedback via subtle toast/checkmark.                                                   |
| **UX-5** | Items already bookmarked are visually marked and excluded from unread lists.                                                                      |
| **UX-6** | Empty state: “You’re all caught up” message when no unread items exist.                                                                           |
| **UX-7** | **Initial setup**: after account link, present a selectable list of all discovered podcasts/channels (checkbox list).                             |
| **UX-8** | **Manage Subscriptions**: users can toggle individual podcasts/channels on or off at any time.                                                    |
| **UX-9** | Viewing an item marks it **Read** immediately and removes it from the unread queue; a secondary “All Items” view lets users revisit read content. |

---

## 7 Functional Requirements

| ID        | Requirement                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **FR-1**  | Exactly **one Spotify account** and **one YouTube account** may be linked per Zine user.                                                       |
| **FR-2**  | System stores only the minimum OAuth tokens needed for periodic data retrieval.                                                                |
| **FR-3**  | Backend polls each linked service on a **configurable interval** (default ≈ hourly), staggered to avoid API spikes.                            |
| **FR-4**  | Data fetched per item: unique ID, title, creator/channel, publish date, description/excerpt, thumbnail URL, duration/length (if provided).     |
| **FR-5**  | Feed query defaults to **status = unread**; client may request all/read via filter.                                                            |
| **FR-6**  | Bookmarking an item invokes existing Zine metadata extraction and tagging pipelines.                                                           |
| **FR-7**  | If polling fails or auth is revoked, surface a non-blocking banner prompting re-authentication.                                                |
| **FR-8**  | **Subscription selector** API/UI exposes all eligible podcasts/channels and records user on/off choices.                                       |
| **FR-9**  | Opening an item sets its status = Read and syncs that state across devices in real time.                                                       |
| **FR-10** | Disconnecting an account removes its feed and halts related polling jobs.                                                                      |
| **FR-11** | **History retention:** All fetched items (Read or Unread) are stored **indefinitely** unless the user deletes them or disconnects the account. |

---

## 8 Non-Functional Requirements

| Category               | Requirement                                                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Performance**        | Feed load ≤ 2 s for up to 25 subscriptions or ≤ 200 unread items.                                                                   |
| **Scalability**        | Support at least 10 total subscriptions per user without perceptible slowdown; architecture must scale horizontally with user base. |
| **Reliability**        | Polling job SLA ≥ 99 %; exponential back-off and resume checkpoints on failure.                                                     |
| **Security & Privacy** | Follow Spotify & YouTube OAuth scopes; no storage of playback or private user metrics beyond what is required.                      |
| **Configurability**    | Poll cadence adjustable via admin setting (environment config).                                                                     |
| **Accessibility**      | **Out of scope for Phase 1**; WCAG compliance to be evaluated in later phases.                                                      |

---

## 9 Dependencies & Assumptions

- Valid API credentials and quota for Spotify & YouTube.
- OAuth consent flows pass partner-review.
- Zine’s bookmark schema already accommodates podcast episodes and videos.
- Background job infrastructure (e.g., scheduled Cloudflare Worker) exists for polling.

---

## 10 Risks & Mitigations

| Risk                                        | Impact               | Mitigation                                                      |
| ------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| API rate-limits exceeded                    | Delayed feed updates | Batch & cache requests; stagger polling windows.                |
| Long subscription lists slowing selector UI | Poor onboarding UX   | Paginate and lazy-load thumbnails; pre-select top shows.        |
| OAuth token expiration                      | Lost updates         | Refresh tokens automatically; banner prompt on failure.         |
| UI overwhelm with many avatars              | Discoverability drop | Future grouping/pagination rules; not critical for Phase 1 cap. |

---

## 11 Measure of Completion / Acceptance Criteria

- Users can **link** a Spotify account (podcasts only) and/or a YouTube account, then pick individual shows/channels.
- Unread items appear in the stories-style feed within the configured polling window.
- Viewing an item marks it **Read**; bookmarking adds it to the standard Zine bookmark list with full metadata.
- Read items disappear from the unread queue but are accessible in “All Items / History.”
- Disconnecting an account removes its avatar/feed and stops polling. All criteria verified via manual QA and instrumentation dashboards.

---

## 12 Future Considerations (Beyond Phase 1)

- Support additional sources (RSS, Substack, X/Twitter, Apple Podcasts, etc.).
- Switch from polling to webhook ingestion where platforms support it (e.g., YouTube PubSubHubbub).
- Inline audio/video playback within Zine.
- Push notifications for high-priority creators.
- Social sharing or collaborative collections of subscribed content.

---

_End of PRD_
