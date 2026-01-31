## Decision

Adopt Sentry-compatible error tracking using the HTTP store endpoint (Sentry Cloud or GlitchTip).
Implement a JS-only capture path so Expo Go remains the default dev runtime while production builds still report errors.

## Context

- `apps/mobile/lib/logger.ts` already has a placeholder for production error tracking.
- Expo Go is required for daily development; native crash SDKs are not viable for routine use.
- Error boundaries and logging are in place, but no centralized reporting exists.

## Why Sentry-Compatible

- Works over HTTP with no native modules.
- Supports self-hosting (GlitchTip) or Sentry Cloud.
- Flexible for future upgrades to native SDKs when custom builds are introduced.

## Integration Plan

1. Add environment variables:
   - `EXPO_PUBLIC_SENTRY_DSN`
   - `EXPO_PUBLIC_SENTRY_ENVIRONMENT` (optional)
   - `EXPO_PUBLIC_SENTRY_RELEASE` (optional)
2. Implement `apps/mobile/lib/error-tracking.ts` to POST events to the store endpoint.
3. Wire `logger.error` to forward errors and context to `captureError`.
4. (Optional) Add a global JS error handler for uncaught exceptions once stable.
5. Validate in a production build by triggering a controlled error and confirming the event in Sentry.
