## Decision

Adopt PostHog for product analytics and wire it through the existing mobile analytics facade.
Implementation should use PostHog's HTTP capture API from `apps/mobile/lib/analytics.ts` (no native SDK) so Expo Go remains supported in development while production builds still emit events.

## Context

- `apps/mobile/lib/analytics.ts` defines typed events but is a production no-op.
- `docs/zine-tech-stack.md` lists analytics as "None" today.
- Mobile development must run in Expo Go, so native analytics SDKs are not viable for day-to-day dev.

## Why PostHog

- Works with mobile and web, supports event-based product analytics.
- Can be implemented via HTTP API without native modules.
- Self-host or PostHog Cloud options keep deployment flexible.
- Supports user identification, feature flags, and funnels as the product grows.

## Integration Plan

1. Add environment variables:
   - `EXPO_PUBLIC_POSTHOG_API_KEY`
   - `EXPO_PUBLIC_POSTHOG_HOST` (default `https://app.posthog.com`)
2. Implement provider in `apps/mobile/lib/analytics.ts`:
   - Send `track` events via `POST /capture` with `event`, `properties`, `distinct_id`.
   - Gate on `isDev()` (no-op) and an `enabled` flag.
   - Use a stable anonymous id until `identify` is called.
3. Wire `identify` and `reset` to update the `distinct_id` and clear anonymous state.
4. Add basic batching or fire-and-forget with short timeout to avoid blocking UI.
5. Add unit tests to validate payload shape and ensure dev-mode no-ops.
6. Update privacy copy to disclose analytics collection.

## Rollout Notes

- Keep analytics disabled by default in dev builds.
- Avoid PII in event properties; use user ids only.
- Revisit event taxonomy once subscriptions and onboarding flows expand.
