# Workstream 5: delivery and discovery attribution

## Assignment

Own the ongoing reader relationship: activity inbox, subscriber fanout, morning
update digest, optional APNs push, issue visit markers, and save provenance. Coordinate
storage/schema additions with foundation and all native UI with stream 2.

## Deliverables

- Immediate publication activity and optional push to subscribers; one logical event
  per publication regardless of retries. Publisher does not notify themself.
- At most one daily additions digest per publication/subscriber in subscriber morning,
  grouping issues, excluding initial publication selections and removed additions.
- Mute/unsubscribe handling at send time; no activity from correction/reorder/removal;
  in-app read state independent of push availability.
- APNs capability/secret/configuration inventory, installation lifecycle, revoked token
  cleanup, durable outbox/retries/checkpoints and reproducible diagnostics. Do not print
  credentials. Existing system-alert uniqueness cannot deduplicate publication events.
- Last-presented revision contract for new markers, never advanced by background fetch.
- Server-trusted selection-save adapter, regular bookmark reuse, multiple discovery
  references, commentary snapshots separate from personal notes, and durable text
  attribution for unavailable/deleted issues/publications.
- Focused dedupe/concurrency/recipient-isolation/scheduling/provenance tests.

## Boundaries

No email delivery, issue-level subscriptions, mutual-friendship requirement, or
notifications for corrections/removals. No parallel canonical bookmark model or
client-authored provenance. Delivery failure must not block publication or saving.

## Acceptance

Several additions to several independent issues produce one daily batch. Retries,
DST, timezone changes, unsubscribe/mute races, and invalid tokens do not duplicate
logical delivery or expose other recipients. Muted subscribers retain in-app activity.
Denied push permission leaves in-app experience usable. A real device receives and
opens publication and digest push to the intended destination.

Saving a new/existing bookmark preserves personal notes and canonical identity.
Repeated save is idempotent; different issues add references. Removing source issues
retains bookmark and text attribution. Untrusted selection IDs cannot forge references
or expose private owner data. Reader sees correct additions on return.

## Handoff

Deliver event/digest identities, send-time suppression rules, APNs setup requirements,
retry/diagnostic runbook, provenance schemas/fixtures, and native activity/save/visit
adapters. Record actual push observations separately from mocked delivery tests.
