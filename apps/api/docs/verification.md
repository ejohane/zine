# Verification ledger

The independent API production controls are released at source
`627b63d439f1bcb781026901b754ebf363b4e373`. The
[productionization acceptance](productionization.md) and [session handoff](STATUS.md)
record the final operational work and exact current release. New OAuth and
Google-authorized live acceptance are explicitly excluded from this milestone;
the older Google-inclusive goal remains deferred. No mobile changes were made.

The receipts below have individual timestamps and scopes. Historical provider
success is not a current availability guarantee. The later observer recorded X
HTTP402 and a public YouTube feed HTTP404; scheduled Spotify, Substack and RSS polls
continued. Browser rendering/interactive login has no visual verification claim.

## Reproducible evidence

All artifacts below live in `../evidence/`. They contain counts, request IDs,
assertions and hashes. Raw library snapshots, full responses and exports stay in
ignored `.local-data/` files with restricted permissions. Credentials are excluded.

| Evidence                                             | Observed result                                                                                                                                                  | Scope and limits                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `authentication.json`                                | Real Clerk sign-in; deployed `/v1/me` subject matches                                                                                                            | Actual authentication, no bypass                                                                                |
| `library-import.json`                                | 444 references captured and read back; zero errors                                                                                                               | Isolated workerd/D1/R2, generated signed issuer; imported metadata                                              |
| `remote-library-import.json`                         | All 444 references imported and read back remotely                                                                                                               | Real Clerk, fresh deployed service; capture is separate from extraction                                         |
| `corpus-health.json`                                 | Per-provider retained and newly extracted counts, job/component status                                                                                           | Read-only inspection of new D1 against the private import mapping; timestamped snapshot                         |
| `manual-http.jsonl`, `manual-journeys.json`          | Interactive save/replay, personal state, corrections, collections, annotations, deletion/fresh save and review-first intake                                      | Sanitized remote HTTP traces; eight assertion groups, no simulated upstreams                                    |
| `remote-isolation.json`                              | 19 owner isolation and credential restriction checks                                                                                                             | Primary real Clerk owner; second owner uses a fixture PAT through actual deployed authentication, with cleanup  |
| `search-quality.json`                                | Expected item ranked first in all 12 queries across four corpus cases                                                                                            | Actual keyword, Workers AI embeddings and Vectorize/hybrid; bounded evaluation, not a universal relevance claim |
| `spotify-members.json`                               | Album/public playlist members and two 50-episode show pages without duplicates                                                                                   | Live Spotify; curated playlist restrictions are distinct from public sample playlist support                    |
| `youtube-source-wait.json`                           | Historical adverse outcome before quota separation; original job was never attempted                                                                             | Superseded for intake by `youtube-intake.json`; retained as diagnosis evidence                                  |
| `youtube-intake.json`, `youtube-quota-snapshot.json` | Original channel job succeeded; repeated sync produced no duplicate; independent watch cooldown retained                                                         | Actual channel feed, rich supplied metadata and metadata-only understanding; not Google-authorized pagination   |
| `identity-journeys.json`                             | Fourteen live assertion groups: MDN reconciliation, retained context, aliases, semantic filter, deletion/fresh state, X authoritative identity and relationships | Assertions on interactively issued real Clerk HTTP requests; separate from controlled concurrency/failure tests |
| `live-sources.json`                                  | X and Substack repeat polls preserve items without duplicates; source filter includes one-off saves                                                              | Actual provider ingestion; original saved decision preserved when the latest feed item already exists           |
| `http-boundary.json`                                 | Ten deployed negative checks: authentication, unsafe URLs, strict schemas, cursor/size bounds, CORS and unknown routes                                           | Real HTTP; no personal-state mutations                                                                          |
| `understanding-review.json`                          | One generated podcast overview manually compared with three retained source passages                                                                             | Bounded fidelity review, not exhaustive model-quality proof                                                     |
| `transcript-retrieval.json`                          | Keyword match returns an actual transcript timestamp (323.885 seconds); generated summary cites transcript input                                                 | Actual deployed HTTP, bounded to the podcast subscription; corpus-wide ranking is evaluated separately          |
| `rewrite-boundary.json`                              | Runtime imports are independent, original application files unchanged, private artifacts ignored                                                                 | Working-tree audit; one-time credential/data helpers are separate from runtime code                             |
| `google-grant-reuse.json`                            | Read-only credential investigation records a sanitized outcome                                                                                                   | No source credential values persisted; no original deployment or rows changed                                   |
| `google-credential-availability.json`                | Existing production key/client ID are unreadable secret bindings; no usable grant/key in inspected local or allowlisted sources                                  | Read-only metadata inventory, no secret values or original infrastructure changes                               |
| `podcast-intake.json`                                | One automatic save, 128 publisher transcript cues across about 48 minutes, repeated poll without duplicates                                                      | Actual feed and published VTT; summary coverage recorded separately at observation time                         |
| `generated-understanding.json`                       | Actual Workers AI outputs with model, coverage, source digest/references and output hashes                                                                       | Article/thread/metadata-only provenance; unavailable media is not represented as transcript understanding       |
| `account-export.json`                                | All 20 export sections read remotely; retained private material included; credentials excluded                                                                   | Export of real copied library, about 9 MB at observation time; live consistency explicitly declared             |
| `isolated-corpus-erasure.json`                       | Full real-library copy erased; retained article/export verified; token revoked; fresh generation empty                                                           | Actual isolated workerd/D1/R2, fixture issuer; the deployed real account was not erased                         |
| `erasure-concurrency.json`                           | Six controlled race/batch scenarios plus the fresh 444-item isolated erasure check                                                                               | Synthetic Google responses and signed fixture issuer; no claim of live Google authorization                     |
| `adapters.json`                                      | Official MCP client discovers eight tools; save/replay/get/search; restricted credential calls denied; CLI paginates                                             | Actual deployed API                                                                                             |
| `deployment.json`                                    | Serving health version matches active Cloudflare deployment; only fresh resource bindings                                                                        | Read-only Cloudflare inspection, source/config/lock digest; does not claim deployment alone proves behavior     |
| `corpus-recovery.json`                               | Authenticated retries of transient corpus failures                                                                                                               | Retry acceptance is separate from completion; consult current `corpus-health.json`                              |
| `provider-probes.json`                               | Direct host extraction examples for all six families                                                                                                             | Host probes are explicitly separate from deployed Worker proof                                                  |

## Automated checks

The current API suite passed **130 tests across 28 files under Node 22**, including
actual isolated workerd/D1/R2 and signed-JWT verification. The exact promoted source
passed lint, strict app/tools typechecking, that suite and a Wrangler dry-run build
in the [production workflow](https://github.com/ejohane/zine/actions/runs/42573335811).
The source PR and Linux tooling fix also passed applicable repository CI checks:
[#466](https://github.com/ejohane/zine/pull/466),
[#467](https://github.com/ejohane/zine/pull/467).

Coverage includes capture/idempotency and competing writes, deletion/erasure and
owner-generation races, provenance/transcripts, completion/archive, subscriptions
and feed cursors, reconciliation, export and scoped permissions (including MCP and
export boundaries), atomic multi-caller quotas, deferred work, signed webhook
retry/leases/retention, index recovery and client retry behavior. Fixture issuers,
providers and AI outputs establish their controlled cases, not live access or
model quality. Those claims require the separate live receipts.

The earlier baseline `repository-checks.json` and 102-test count are historical;
`production-checks.json` records the later local 130-test checkpoint. GitHub logs
verify the promoted source independently. The architecture guide has separate DOM
interaction/delivery evidence in `architecture-guide.json`; those checks do not
establish visual browser review.

## Production controls and recovery evidence

| Artifact                            | Actual observed result                                                                                                                                                                  | Scope                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `production-release.json`           | Exact source active at 100%, all four fresh resource bindings, 23 migrations, anonymous library denied; private predeploy backup                                                        | Full successful GitHub production workflow; behavior has separate receipts                                   |
| `production-controls-live.json`     | Read-default scopes, revocation, idempotency, live 25-call quota burst and independent caller                                                                                           | Real Clerk and isolated Cloudflare staging                                                                   |
| `production-live.json`              | 15 concurrent requests, six durable references, no lost/duplicate retry captures; pagination, keyword, progress/archive, six replayed created events and official MCP read/denied write | Exact deployed production source; real Clerk/PATs; controlled references removed and probe tokens revoked    |
| `webhooks-live.json`                | Independent receiver validates HMAC; scheduled retry after 503 has same delivery ID/body hash and receives 204                                                                          | Actual staging and separate Cloudflare receiver; not a simulated retry                                       |
| `operations-live.json`              | Injected backlog opens/deduplicates/resolves durable alert                                                                                                                              | Staging only; no real provider or production fault injection                                                 |
| `rollback-live.json`                | Previous Worker serves, retained context survives rollback/forward, exact version restored, 23 migrations stay current                                                                  | Actual staging; storage is not rolled back                                                                   |
| `backup-latest.json`                | Private content-addressed archive downloaded again and hash verified; 491 items, 299 retained objects                                                                                   | No raw snapshot or content in GitHub; private R2, 30-day backup retention                                    |
| `recovery-restore.json`             | Full 21 authoritative table hashes, FK validity and all 299 R2 object write/readback hashes                                                                                             | Isolated restored data; subscription/lease safety overlays explicitly documented, credentials removed        |
| `recovery-search-live.json`         | 491 rebuilt items, zero pending; all 12 retrieval checks rank expected item first, three retained-material API readbacks                                                                | Real Clerk/Workers AI/fresh Vectorize; another-owner denial uses controlled PAT, not second real Clerk login |
| `production-soak-prepromotion.json` | 45 minutes, 46 healthy authenticated observations; scheduled Spotify/Substack/RSS poll advances                                                                                         | Earlier Worker version, explicitly separate from final release                                               |

`staging-origin-live.json` verifies real Clerk staging-origin sessions on staging
and HTTP401 rejection by production after the staging config correction. It is
authentication-boundary evidence; it does not claim visual browser interaction.

Additional exact-release receipts: `production-search-live.json` passes all 12
real-library keyword/semantic/hybrid cases; `production-ops-live.json` records a
natural cron heartbeat, zero ready backlog/expired leases/dirty index revisions
and explicitly visible historical job/source errors. `monitor-live.json` links the
actual GitHub execution with its read-only operational PAT, including the initial
pre-heartbeat failure and healthy result after natural cron.

These are bounded observed cases. They do not prove universal correctness, future
uptime, unavailable provider permissions, or every possible client experience.

## Fresh deployment

Worker `zine-api-next`; domain <https://api-next.myzine.app>; D1
`0e55836b-07de-426b-9977-b783b0ea6652`; R2 `zine-api-next-artifacts`;
queues `zine-api-next-jobs` and `zine-api-next-dead`; Vectorize
`zine-api-next-vectors`. Migrations 0001–0023 are applied remotely. The exact serving
version and source digest are in `deployment.json` and public `/health`.
Existing production Zine resources were not modified. Approved credentials were
provisioned independently through stdin; the rewrite has its own encryption key.

## External access and remaining proof

- The original YouTube account grant exists in production but is encrypted with a
  production key unavailable in the current approved local configuration. Its
  development database has no active grant for this account. Read-only lookup and
  in-memory decryption investigation changed no original rows or deployment.
  The original production Worker settings expose `ENCRYPTION_KEY` and
  `GOOGLE_CLIENT_ID` as secret bindings, with no readable values; there is no
  production `YOUTUBE_API_KEY` binding to reuse. Google client configuration
  alone is not an account grant. Independently encrypted
  grant storage, refresh and official API pagination are implemented and tested
  with controlled upstreams; a usable grant or API key is needed for live proof.
- Historical public YouTube channel intake and repeated synchronization succeeded;
  the later observer found a feed 404 and current availability must be refreshed. The
  previous never-attempted job was held by a watch-page budget incorrectly shared
  with feeds; migration 0016 and separate scopes fixed that coupling. Actual D1
  inspection confirms the original watch cooldown was preserved. Feed metadata
  includes title, description, creator, publication time and artwork; understanding
  explicitly reports metadata-only coverage when the video transcript is absent.
- Public YouTube extraction has actual corpus results. Public captions can be
  blocked/unavailable; component reasons are explicit. Playlist pagination through
  the official API must not be presented as live verified yet.
- Current corpus snapshots include inaccessible web pages, Substack rate limits,
  and a Spotify curated playlist restriction. Durable saves remain retrievable;
  extraction failure and pending understanding/indexing are observable separately.
  Availability depends on the source, and neither imported titles nor job acceptance
  establishes successful extraction.
- Search indexing, understanding, large artifact cleanup and obsolete-vector
  deletion are asynchronous. SQL ownership and generation checks remain authoritative
  throughout propagation and cleanup. Pending counts are reported, not hidden.
- The optional web inspector's HTML is served, but interactive browser UI and
  screenshots are unverified. Real Clerk and manual HTTP evidence do not establish
  browser behavior. Mobile work is outside this task.
