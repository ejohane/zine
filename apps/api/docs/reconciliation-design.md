# Identity reconciliation implementation plan

Status: implemented and deployed, with bounded controlled and live evidence. Session-history audit confirmed these
were agreed capabilities: duplicate identities discovered after save must converge,
old personal IDs must resolve, and distinct editions/context can be related. The
original conversation said "potentially related" before the domain/API discussion
made the relationship/reconciliation promises explicit; reserved schema alone is
insufficient. Instagram/history/topic/nested-collection deferrals do not defer this.

## Safety boundary

- Never merge from title similarity, an arbitrary canonical tag, or an unverified
  caller assertion. Known platform URL identities normalize at capture time.
- Late automatic reconciliation uses the actual final URL from a validated public
  HTTP redirect. Web extraction should expose its fetched final URL. An explicit
  reconcile request resolves public redirects itself and can assert an expected
  target personal ID. HEAD first, bounded GET fallback where needed; use existing
  SSRF/redirect protection.
- Merge personal state for one owner. Do not rewrite shared global content or
  another owner's contributions. Private `item_aliases` flatten to the canonical
  personal ID. Other users independently reconcile their own library.
- A relationship does not imply identity. `same_work`, `part_of`, `references`,
  `quotes`, `reply_to`, `related` keep editions distinct. Targets may be owned
  personal IDs or unsaved URLs; the latter must not create a personal item.

## Merge transaction

Destination is the deterministic personal ID for the verified final content URL.
Create that personal row if absent. Guard both source and destination revisions,
source generation and the owner erasure epoch in one atomic D1 batch; retry CAS
conflicts with fresh reads. Alias resolution must be retried on competing merges.

Track `decision_at` and `decision_origin` on explicit saves/lifecycle changes;
automatic intake never changes existing decisions. Backfill existing available
timestamps in migration 0015. Prefer the latest explicit lifecycle decision; an
existing target decision wins over automatic arrival. Keep archive with its
selected saved decision. A newer explicit save can revive a deleted target with
fresh generation; an automatic/older arrival cannot resurrect deletion.

If deletion wins: erase source personal material, leave minimal aliases/suppression,
and record no private merge snapshot. If alive: retain both personal contexts,
occurrences, annotations, tags, contributions, provenance and collection references.
Union memberships; keep target position on a duplicate membership and retain both
positions in a private receipt. Choose latest progress update (including explicit
reset), retaining both observations in the receipt. Record lifecycle inputs and
resolution as well. Never silently discard a conflicting observation.

Move only this owner's contributions/search documents to destination content;
retain IDs and artifacts. Recompute preferred classification consistently with
current contribution precedence. Queue obsolete source vectors, clear source
indexed rows, and request destination indexing/understanding. Cancel/fence source
jobs and incomplete understanding checkpoints. Enqueue canonical enrichment so a
web redirect to a platform uses its proper extractor. All effects are atomic.

Source becomes a generation-fenced deleted alias tombstone, not a normal deletion
of the save receipt. Replay of an original successful save still identifies a
resolvable old ID. Deleting the canonical item later must tombstone receipts for
all its aliases, erase all private merge receipts and relationship data, and retain
minimal alias/suppression so automatic arrivals cannot recreate it. Explicit save
through any alias starts fresh state at the canonical item.

## Integration points

- Public capture helper resolves a URL's deterministic item ID through private
  aliases, then uses the canonical content identity. Use in save and feed intake;
  preserve the supplied URL in the occurrence.
- Keep raw `ownedItem` for job generation checks. Public HTTP paths containing
  `/items/{itemId}` can be internally rerouted after authentication, including
  collection membership paths; propagate the inner request ID and expose canonical
  ID/content-location headers. Bound/flatten alias chains.
- Normalize collection-note body item references and relationship target IDs.
  Public item helpers used directly also need intentional canonical resolution.
- URL browse/search filters must match alias content URLs as well as canonical URL.
- GET identity/aliases and paginated reconciliation receipts make outcomes inspectable.
- `extractWeb.resolvedUrl` triggers automatic verified reconciliation; do not commit
  generic HTML over an actual platform target. Cancel old work and queue the proper
  canonical extraction instead.
- Export now has 20 sections (original 17 + relationships, aliases, reconciliations).
  Account erasure removes all three; include unsaved relationship target IDs in
  orphan cleanup and respect other owners' remaining references.

## Required verification

Controlled workerd/D1/R2 tests: no false similarity merge, state/provenance union,
conflict receipt, old ID read/mutate/save/filter/reference resolution, concurrent
merge/save/delete/account erasure, target deletion suppression, fresh explicit
resave, other-owner isolation, canonical extraction/index/understanding jobs,
export/erasure, bounded private relationship paging/CRUD and no implicit capture.

Remote: genuine public redirect duplicate with personal state and retained metadata,
old-ID read/mutation/search, explicit edition relationships and reverse lookup,
export including receipts/aliases, deletion suppression and fresh resave. Refresh
full checks/deployment hash and ledger after the implementation is complete. Google
credential and live YouTube acceptance remain separate unresolved work.

## Current checkpoint and next verification

Migrations 0015–0017 are applied remotely. The 102-test full API suite passes.
Serving deployment and resource bindings are recorded in `deployment.json`.
Live HTTP checks observed MDN permanent-redirect reconciliation with both saved
contexts retained, mutation through an old ID, inspectable receipts, unsaved URL
relationship targets, reverse lookup after explicitly saving the target, and an X
handle automatically reconciled to its provider-authoritative numeric account ID.
An actual existing X post acquired its private source relationship after a retry.

Verified identity evidence includes provider-authoritative mutable YouTube
handle/username/custom URL resolution to channel ID and X handle resolution to
account ID. Distinct immutable platform IDs never merge. Permanent redirects,
known shorteners and transport aliases are accepted; arbitrary temporary redirects,
canonical tags, login gates and homepage fallbacks are insufficient. Unicode
handles are decoded before provider lookup. Direct parent/quote/reply edges retain
private input provenance and do not create personal targets.

The local implementation now includes:

- Registered material uploads before R2 writes, included in merges and erasure.
  Ambiguous put/commit failures queue cleanup rather than deleting potentially live
  material. Collection waits one hour, then checks authoritative references again.
  Tests inject successful R2 and D1 operations followed by acknowledgement failure.
- Separate public watch, channel, feed and official YouTube API quotas. Controlled
  tests preserve a held watch cooldown, make no watch requests, and still extract
  authorized metadata or initialize a channel feed. Literal YouTube Atom URLs are
  accepted and resolve to their channel source.
- Feed metadata committed before optional provider fetching. Large original entries
  use registered R2 inputs instead of exceeding D1 row limits. Independent routes
  retain distinct provenance without changing existing personal decisions.
- Initial intake uses subscription creation as its boundary: every matching arrival
  since creation plus the latest preceding match. Delayed initial polls and resumed
  pagination are covered. Subscription revisions, leases and owner erasure fence
  capture and checkpoint commits.
- Understanding can use retained metadata while an optional fetch is deferred,
  keeping metadata-only coverage explicit. Active or imminent extraction and
  existing understanding work still prevent redundant concurrent processing.

Remaining before completion: finish fresh export/evidence documentation and live
Google-authorized metadata and pagination once approved usable credentials are
available. Local controlled provider responses do not establish
live Google API access.

## Request-level erasure follow-up

The erasure audit extended generation fencing beyond item mutations. Each
authenticated HTTP operation receives an isolated generation snapshot, preserved
through alias and MCP dispatch. Owner-scoped transactions guard source/route
creation, subscription jobs, collection/token creation, search sessions, provider
connections and artifact registration. Separate requests and owners never share
that snapshot. Erasure crossing a long-running provider exchange or discovery
returns a conflict rather than recreating private state.

Credential refresh additionally compares the original encrypted envelope and
revision. Both stale successes and stale failures leave a disconnected/reconnected
grant untouched. Controlled Worker tests cover these races, fresh subsequent work,
another owner, and empty post-erasure source/route/connection readback. These are
fixture-provider concurrency checks, not proof of live Google authorization.

Initial polling processes at most 20 newly published arrivals per job, including
a delayed first poll. Larger older baselines can still be scanned in a bounded
read-only slice. A 45-arrival initial-poll regression verifies continuation and the
preceding-item baseline without refetching the source.
