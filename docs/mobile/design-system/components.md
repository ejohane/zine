# Mobile Design System Component Inventory

Last updated: February 22, 2026

## Purpose

This document is the source of truth for the mobile component catalog in `apps/mobile/components`.
It defines which components are canonical design-system building blocks, which are app containers,
and which are legacy or dormant.

## Status Labels

- `canonical`: Reusable UI building block. Preferred for new work.
- `app-container`: Uses app hooks, routing, analytics, or side effects. Keep behavior here, but prefer extracting a pure view when possible.
- `dormant`: Not currently mounted in app routes. Keep, but do not expand until feature work resumes.
- `legacy`: Superseded or template-era component. Do not use for new work.
- `dev-only`: Storybook scaffolding or inventory support modules.

## Canonical Components

| Path                                                              | Status      | Story Priority | Notes                                                             |
| ----------------------------------------------------------------- | ----------- | -------------- | ----------------------------------------------------------------- |
| `apps/mobile/components/icons/index.tsx`                          | `canonical` | `P0`           | Shared icon primitives used throughout app screens.               |
| `apps/mobile/components/badges.tsx`                               | `canonical` | `P0`           | Provider/type pills used in item and creator surfaces.            |
| `apps/mobile/components/filter-chip.tsx`                          | `canonical` | `P0`           | Shared filter primitive used in library filtering.                |
| `apps/mobile/components/list-states.tsx`                          | `canonical` | `P0`           | Shared loading/error/empty/not-found state components.            |
| `apps/mobile/components/item-card.tsx`                            | `canonical` | `P0`           | Primary card system with multiple variants.                       |
| `apps/mobile/components/link-preview-card.tsx`                    | `canonical` | `P0`           | Add-link preview card and skeleton state.                         |
| `apps/mobile/components/ParallaxScrollView.tsx`                   | `canonical` | `P1`           | Reusable parallax layout primitive for detail views.              |
| `apps/mobile/components/error-boundary.tsx`                       | `canonical` | `P1`           | Base boundary used by specialized boundaries.                     |
| `apps/mobile/components/subscriptions/channel-item.tsx`           | `canonical` | `P0`           | Reusable channel row in single and multi-select modes.            |
| `apps/mobile/components/subscriptions/channel-selection-list.tsx` | `canonical` | `P0`           | Shared subscriptions list shell with search and selection states. |
| `apps/mobile/components/creator/LatestContentCard.tsx`            | `canonical` | `P1`           | Reusable creator content row used in creator flows.               |

## App-Container Components

| Path                                                      | Status          | Story Priority | Notes                                                     |
| --------------------------------------------------------- | --------------- | -------------- | --------------------------------------------------------- |
| `apps/mobile/components/auth-guard.tsx`                   | `app-container` | `P1`           | Depends on Clerk auth state and navigation flow.          |
| `apps/mobile/components/swipeable-inbox-item.tsx`         | `app-container` | `P1`           | Gesture-heavy inbox row with haptics and router behavior. |
| `apps/mobile/components/oauth-error-boundary.tsx`         | `app-container` | `P1`           | OAuth-specific recovery behavior built on ErrorBoundary.  |
| `apps/mobile/components/query-error-boundary.tsx`         | `app-container` | `P1`           | React Query integration wrapper around ErrorBoundary.     |
| `apps/mobile/components/subscription-error-boundary.tsx`  | `app-container` | `P1`           | Subscription reconnect behavior + route handling.         |
| `apps/mobile/components/creator/CreatorHeader.tsx`        | `app-container` | `P1`           | Uses subscription hooks, analytics, and haptics.          |
| `apps/mobile/components/creator/CreatorLatestContent.tsx` | `app-container` | `P1`           | Uses creator content hooks + analytics events.            |
| `apps/mobile/components/creator/CreatorPublications.tsx`  | `app-container` | `P1`           | Data-driven creator publications section.                 |
| `apps/mobile/components/creator/CreatorBookmarks.tsx`     | `app-container` | `P1`           | Data-driven creator bookmark section.                     |

## Dormant Components

| Path                                               | Status    | Story Priority | Notes                                                        |
| -------------------------------------------------- | --------- | -------------- | ------------------------------------------------------------ |
| `apps/mobile/components/sync-now-button.tsx`       | `dormant` | `P2`           | Well-defined UI states, but currently not mounted in routes. |
| `apps/mobile/components/sync-status-indicator.tsx` | `dormant` | `P2`           | Offline queue indicator, not currently mounted.              |
| `apps/mobile/components/offline-banner.tsx`        | `dormant` | `P2`           | Network status banner not currently mounted.                 |
| `apps/mobile/components/external-link.tsx`         | `dormant` | `P2`           | Utility wrapper not currently referenced by app routes.      |

## Legacy Components

| Path                                              | Status   | Story Priority | Notes                                                      |
| ------------------------------------------------- | -------- | -------------- | ---------------------------------------------------------- |
| `apps/mobile/components/home/index.tsx`           | `legacy` | `none`         | Legacy home export barrel not used by current tab home.    |
| `apps/mobile/components/home/content-card.tsx`    | `legacy` | `none`         | Superseded by `ItemCard` variants in current home screen.  |
| `apps/mobile/components/home/featured-card.tsx`   | `legacy` | `none`         | Legacy home hero card implementation.                      |
| `apps/mobile/components/home/channel-card.tsx`    | `legacy` | `none`         | Legacy home channel card implementation.                   |
| `apps/mobile/components/home/quick-stats.tsx`     | `legacy` | `none`         | Legacy home stats panel implementation.                    |
| `apps/mobile/components/home/section-header.tsx`  | `legacy` | `none`         | Legacy section header implementation.                      |
| `apps/mobile/components/home/pressable-scale.tsx` | `legacy` | `none`         | Legacy pressable utility scoped to old home stack.         |
| `apps/mobile/components/themed-text.tsx`          | `legacy` | `none`         | Expo template-era themed helper, not in active DS path.    |
| `apps/mobile/components/themed-view.tsx`          | `legacy` | `none`         | Expo template-era themed helper, not in active DS path.    |
| `apps/mobile/components/ui/collapsible.tsx`       | `legacy` | `none`         | Template-era component dependent on legacy themed helpers. |
| `apps/mobile/components/ui/icon-symbol.tsx`       | `legacy` | `none`         | Template-era icon abstraction, not in active usage.        |
| `apps/mobile/components/ui/icon-symbol.ios.tsx`   | `legacy` | `none`         | iOS-specific template icon implementation.                 |

## Dev-Only and Support Modules

| Path                                                            | Status     | Story Priority | Notes                                             |
| --------------------------------------------------------------- | ---------- | -------------- | ------------------------------------------------- |
| `apps/mobile/components/storybook/storybook-button.tsx`         | `dev-only` | `P0`           | Storybook smoke-test component.                   |
| `apps/mobile/components/storybook/storybook-button.stories.tsx` | `dev-only` | `P0`           | Existing sample story file.                       |
| `apps/mobile/components/creator/index.tsx`                      | `dev-only` | `n/a`          | Barrel exports for creator components.            |
| `apps/mobile/components/subscriptions/index.ts`                 | `dev-only` | `n/a`          | Barrel exports for subscriptions components.      |
| `apps/mobile/components/item-card-consolidation-analysis.md`    | `dev-only` | `n/a`          | Historical analysis doc, not a runtime component. |

## Decision Rules

1. New UI work must start from `canonical` components whenever possible.
2. New screens can use `app-container` components, but shared visuals should move toward a pure presentational layer.
3. `legacy` components should not receive new features.
4. `dormant` components can be reactivated only as part of a scoped feature plan.
5. If a component changes status, update this file in the same PR.

## Immediate Follow-Ups

1. Add Storybook coverage for all `P0` rows first.
2. Create view-model splits for selected `app-container` rows before expanding their stories.
3. Decide whether to archive or delete `legacy` home components after Storybook coverage lands.
