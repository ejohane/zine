# Workstream 4: Weekly Wrapped and evidence

## Assignment

Build a private calendar-week retrospective that helps the editor select content for
an ordinary weekly issue. Reuse existing recap/event infrastructure only after auditing
its semantics and actual writers. Native presentation is coordinated with stream 2.

## Deliverables

- Sunday-to-Sunday calendar windows in saved publisher timezone, immutable historical
  window identity, Sunday availability, previous recap access and skipped weeks.
- Evidence audit covering native saves, opens, finish/unfinish, progress, external
  navigation, and existing event writes; document gaps and trustworthy tracking start.
- Prospective capture for missing evidence and private snapshots/history so subsequent
  mutable state cannot erase a past week's recap. Never fabricate older history.
- REST recap/history contracts with coverage labels, saved/opened/finished distinctions,
  deduplicated candidates and supported topic/content highlights.
- Explicit empty selection by default; selection-to-weekly-draft adapter that reuses
  the ordinary editor, permits older saved content, and never publishes automatically.
- Helpful empty/partial-history behavior. Unsaved interacted content may appear in the
  recap but must be saved before becoming a selection.
- DST/local-midnight/source/coverage/history/selection tests and Swift fixtures.

## Boundaries

No public statistics, inferred external playback completion, direct link entry,
mandatory analytics charts, automatic publication, or private source leakage. Do not
rewrite the existing recap API silently; isolate/adapt service behavior and
preserve other callers until migrated deliberately.

## Acceptance

An older bookmarked item opened this week appears; a later open does not erase the
older week's evidence. External navigation says opened, not finished. Archive alone
never means consumed. Sunday content belongs to the new week; DST weeks do not assume
168 hours. Travel does not change saved timezone. Empty/partial weeks remain useful
and private. A selected recap creates an editable draft, and public output contains
no activity timestamps/statistics.

## Handoff

Deliver evidence coverage report, window fixtures, recap schemas and draft adapter,
plus meaningful tests. Missing evidence is addressed before release or honestly
labeled historically, never hidden through confident recap language.
