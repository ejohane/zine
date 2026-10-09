# Workstream 2: native creation and reading

## Assignment

Own the canonical SwiftUI experience and app navigation for publications, creation,
reading, subscriptions, activity, provenance display, and recap composition. Wrapped
and delivery own their domain services; coordinate their UI needs through this stream.
Read apps/ios/DESIGN_SYSTEM.md before UI edits and use the local-development skill
for runtime work. Use APIClient and Clerk-authenticated REST.

## Deliverables

- Publication setup/edit/home/archive and a discoverable entry from the existing app.
- Private drafts; saved-Library selection picker; cover/title/introduction/commentary;
  sections and ordering; save/recovery states; explicit publish and system share sheet.
- Weekly/independent lifecycle controls, actionable eligibility errors, conflict and
  retry handling; no direct link entry or standalone essay editor.
- Public issue reader with original-source opening, Save, Subscribe, mute/unsubscribe,
  and new-selection markers; native universal-link routing.
- Logged-out action continuation with issue/selection intent preserved after login.
- Activity inbox, attribution in Library detail, and private recap route integrated
  with streams 4 and 5; optional push permission UX.
- Loading/empty/error/unavailable states, Dynamic Type/accessibility, light/dark
  presentation, fixture decoder tests and focused business-logic scenarios.

## Boundaries

Do not own shared migrations, APNs backend, web pages, or recap aggregation. Do not
add a new tRPC dependency. Choose precise navigation placement during UI design;
this planning package does not preapprove a new primary tab.

## Acceptance

In authenticated local Simulator computer use, create and publish an independent
issue and read it as a different user. Save shows attribution and preserves existing
notes. Weekly editor accepts older saved content but cannot add after publication.
Observe subscription/mute/activity flows and new markers. Verify draft editing
survives ordinary navigation/relaunch. Report automated/build/install/launch/UI
states separately. Validate actual share/native-link/push behavior on phone during
integration, including blocked evidence explicitly.

## Handoff

Provide screen/route map, native decoding fixtures, observed journeys, and the exact
REST revision used. Coordinate changed AppRootView/APIClient files to avoid competing
navigation integrations.
