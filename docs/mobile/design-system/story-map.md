# Mobile Design System Story Map

Last updated: March 7, 2026

## Purpose

This document defines Storybook coverage requirements for the mobile design system.
It maps component status to required story depth and gives an implementation order.

Reference inventory: `docs/mobile/design-system/components.md`.

## Story Hierarchy

Use this top-level structure in Storybook:

1. `Foundations/*`
2. `Primitives/*`
3. `Cards/*`
4. `Feedback/*`
5. `Subscriptions/*`
6. `Creator/*`
7. `Layout/*`
8. `Boundary/*`
9. `Interactions/*`
10. `Dev/*`
11. `Legacy/*` (optional, compatibility only)

## Foundations Reference Stories

These stories document the system itself, not a single component:

| Story Title                                | Purpose                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `Foundations/Tokens/Color Roles`           | Semantic text, surface, accent, border, status, provider, and content token reference.  |
| `Foundations/Tokens/Typography Scale`      | Editorial type hierarchy and usage intent for shared mobile UI.                         |
| `Foundations/Tokens/Layout Metrics`        | Spacing, radius, and elevation reference for coherent component rhythm.                 |
| `Foundations/Tokens/Motion and Icon Sizes` | Standard interaction timing, press feedback, and icon scale guidance.                   |
| `Foundations/Principles/North Star`        | Visual expression of the mobile product character and core principles.                  |
| `Foundations/Principles/Review Checklist`  | Review-time guidance covering preferred patterns, anti-patterns, and release questions. |

## Required Story Sets by Status

| Status          | Required Story Set                                                  |
| --------------- | ------------------------------------------------------------------- |
| `canonical`     | `Playground`, `All States`, `Stress`, `A11y Notes`                  |
| `app-container` | `Mocked States`, `Error Paths`, `Interaction Contracts`             |
| `dormant`       | `Single Reference Story` only when feature is reactivated           |
| `legacy`        | No new stories. Optional compatibility story under `Legacy/*` only. |
| `dev-only`      | Minimal smoke stories under `Dev/*`.                                |

## P0 Story Backlog (Build First)

| Component                                                         | Story Titles                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/components/primitives/text.tsx`                      | `Primitives/Text/Playground`, `Primitives/Text/Variants`, `Primitives/Text/Tones`, `Primitives/Text/Font Families`                                                                                                                                                                                  |
| `apps/mobile/components/primitives/surface.tsx`                   | `Primitives/Surface/Tones`, `Primitives/Surface/Radius and Elevation`                                                                                                                                                                                                                               |
| `apps/mobile/components/primitives/badge.tsx`                     | `Primitives/Badge/Playground`, `Primitives/Badge/Tones`, `Primitives/Badge/Accessories and Shapes`, `Primitives/Badge/Custom Fills`                                                                                                                                                                 |
| `apps/mobile/components/primitives/button.tsx`                    | `Primitives/Button/Playground`, `Primitives/Button/Variants`, `Primitives/Button/States and Sizes`, `Primitives/Button/Accessories and Layout`                                                                                                                                                      |
| `apps/mobile/components/primitives/icon-button.tsx`               | `Primitives/IconButton/Variants`, `Primitives/IconButton/Sizes and States`, `Primitives/IconButton/In Context`                                                                                                                                                                                      |
| `apps/mobile/components/icons/index.tsx`                          | `Primitives/Icons/Gallery`, `Primitives/Icons/Sizes`, `Primitives/Icons/Color Contrast`                                                                                                                                                                                                             |
| `apps/mobile/components/badges.tsx`                               | `Primitives/Badges/SourceBadge`, `Primitives/Badges/TypeBadge`, `Primitives/Badges/Fallback Labels`                                                                                                                                                                                                 |
| `apps/mobile/components/filter-chip.tsx`                          | `Primitives/FilterChip/Playground`, `Primitives/FilterChip/Selected`, `Primitives/FilterChip/With Count`, `Primitives/FilterChip/Small vs Medium`                                                                                                                                                   |
| `apps/mobile/components/list-states.tsx`                          | `Feedback/ListStates/Loading`, `Feedback/ListStates/Error`, `Feedback/ListStates/Empty`, `Feedback/ListStates/NotFound`, `Feedback/ListStates/InvalidParam`                                                                                                                                         |
| `apps/mobile/components/item-card.tsx`                            | `Cards/ItemCard/Compact`, `Cards/ItemCard/Full`, `Cards/ItemCard/Grid`, `Cards/ItemCard/Horizontal`, `Cards/ItemCard/Large`, `Cards/ItemCard/Large Overlay`, `Cards/ItemCard/Action States`, `Cards/ItemCard/Content Stress`                                                                        |
| `apps/mobile/components/link-preview-card.tsx`                    | `Cards/LinkPreview/Loading`, `Cards/LinkPreview/Video`, `Cards/LinkPreview/Article`, `Cards/LinkPreview/Connected Source`, `Cards/LinkPreview/Text Parsing Stress`                                                                                                                                  |
| `apps/mobile/components/subscriptions/channel-item.tsx`           | `Subscriptions/ChannelItem/Multi Select`, `Subscriptions/ChannelItem/Single Action`, `Subscriptions/ChannelItem/Subscribing`, `Subscriptions/ChannelItem/Subscribed`                                                                                                                                |
| `apps/mobile/components/subscriptions/channel-selection-list.tsx` | `Subscriptions/ChannelSelectionList/Loading`, `Subscriptions/ChannelSelectionList/Error`, `Subscriptions/ChannelSelectionList/Empty`, `Subscriptions/ChannelSelectionList/Multi Select`, `Subscriptions/ChannelSelectionList/Single Action`, `Subscriptions/ChannelSelectionList/Action Bar States` |

## P1 Story Backlog (After P0)

| Component                                                 | Story Titles                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/components/ParallaxScrollView.tsx`           | `Layout/Parallax/Default`, `Layout/Parallax/Wide Header`, `Layout/Parallax/Static Content`                                                                                          |
| `apps/mobile/components/error-boundary.tsx`               | `Boundary/ErrorBoundary/Default Fallback`, `Boundary/ErrorBoundary/Custom Fallback`, `Boundary/ErrorBoundary/Reset Keys`                                                            |
| `apps/mobile/components/creator/LatestContentCard.tsx`    | `Creator/LatestContentCard/Internal Navigation`, `Creator/LatestContentCard/External Link`, `Creator/LatestContentCard/Bookmarked`                                                  |
| `apps/mobile/components/swipeable-inbox-item.tsx`         | `Interactions/SwipeableInbox/Default`, `Interactions/SwipeableInbox/Archive Path`, `Interactions/SwipeableInbox/Bookmark Path`, `Interactions/SwipeableInbox/Accessibility Actions` |
| `apps/mobile/components/oauth-error-boundary.tsx`         | `Boundary/OAuthErrorBoundary/Recoverable`, `Boundary/OAuthErrorBoundary/Fatal`                                                                                                      |
| `apps/mobile/components/query-error-boundary.tsx`         | `Boundary/QueryErrorBoundary/Network Error`, `Boundary/QueryErrorBoundary/Application Error`                                                                                        |
| `apps/mobile/components/subscription-error-boundary.tsx`  | `Boundary/SubscriptionErrorBoundary/Auth Error`, `Boundary/SubscriptionErrorBoundary/Retry Path`                                                                                    |
| `apps/mobile/components/creator/CreatorHeader.tsx`        | `Creator/CreatorHeader/Subscribable`, `Creator/CreatorHeader/Already Subscribed`, `Creator/CreatorHeader/Requires Connection`                                                       |
| `apps/mobile/components/creator/CreatorLatestContent.tsx` | `Creator/CreatorLatestContent/Loading`, `Creator/CreatorLatestContent/Not Connected`, `Creator/CreatorLatestContent/Token Expired`, `Creator/CreatorLatestContent/Loaded`           |
| `apps/mobile/components/creator/CreatorPublications.tsx`  | `Creator/CreatorPublications/Loaded`, `Creator/CreatorPublications/Empty`, `Creator/CreatorPublications/Error`                                                                      |
| `apps/mobile/components/creator/CreatorBookmarks.tsx`     | `Creator/CreatorBookmarks/Loaded`, `Creator/CreatorBookmarks/Empty`, `Creator/CreatorBookmarks/Error`                                                                               |
| `apps/mobile/components/auth-guard.tsx`                   | `Boundary/AuthGuard/Loading`, `Boundary/AuthGuard/Signed Out`, `Boundary/AuthGuard/Signed In`                                                                                       |

## P2 Story Backlog (Dormant Features)

| Component                                          | Story Titles                             |
| -------------------------------------------------- | ---------------------------------------- |
| `apps/mobile/components/sync-now-button.tsx`       | `Dev/SyncNowButton/States`               |
| `apps/mobile/components/sync-status-indicator.tsx` | `Dev/SyncStatusIndicator/Pending Counts` |
| `apps/mobile/components/offline-banner.tsx`        | `Dev/OfflineBanner/Offline`              |
| `apps/mobile/components/external-link.tsx`         | `Dev/ExternalLink/Native vs Web`         |

## Progress Snapshot

Date: March 7, 2026

- P0 story backlog is implemented.
- P1 story backlog is implemented.
- P2 story backlog is implemented.
- Foundations reference stories are implemented under `Foundations/Tokens` and `Foundations/Principles`.
- Shared runtime primitives are implemented under `Primitives/Text`, `Primitives/Surface`, `Primitives/Badge`, `Primitives/Button`, and `Primitives/IconButton`.
- Shared Storybook primitives are in place:
  - `apps/mobile/components/storybook/decorators/*`
  - `apps/mobile/components/storybook/fixtures/*`

### Remaining Backlog

- None in current component inventory.

## Story Implementation Rules

1. Use typed stories (`Meta`, `StoryObj`) for every file.
2. Avoid network and live data hooks in canonical stories.
3. For `app-container` stories, mock hooks at module boundaries.
4. Include dark background stories by default, since app UI is dark-first.
5. Include at least one long-content stress case for text-heavy components.
6. Include `onPress` action handlers for interaction contracts where possible.
7. Keep top-level category names aligned with `.rnstorybook/preview.tsx` `storySort` ordering.

## Decorators and Fixtures

1. Create shared fixtures in `apps/mobile/components/storybook/fixtures/*`.
2. Create shared decorators in `apps/mobile/components/storybook/decorators/*`.
3. Keep stories deterministic with static fixture data.
4. Keep fixture values realistic with production-like text lengths and nullability.

## Definition of Done for a Story Set

1. Component has the required stories for its status class.
2. Stories compile with no unresolved modules.
3. Story names are stable and path-based (no ambiguous titles).
4. At least one story documents accessibility-relevant behavior.
5. `components.md` and this file are updated if scope changed.
