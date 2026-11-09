# Completion audit

Outcome: **not achieved**. The implementation and core deployed journeys have
substantial evidence, but all-provider live acceptance is incomplete. This audit
retains the original requirement; it does not substitute capture/import success
for successful provider extraction, intake or authorized pagination.

Evidence is linked from [the verification ledger](verification.md). Test references
below establish the specific covered cases, not universal correctness. Runtime
integration tests use workerd/D1/R2 with a fixture issuer; live artifacts explicitly
identify real Clerk, actual providers, Workers AI and Vectorize.

## Product invariants

| Blueprint invariant                                                                        | Evidence inspected                                                                                                                                     | Assessment                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Durable reference/context before asynchronous work                                      | `foundation.test.ts`: durable save without provider/queue calls, concurrent idempotency; manual HTTP traces; queue-outage ingestion test               | Covered locally and by deployed capture/retrieval; queue-outage behavior is controlled-runtime evidence                                                             |
| 2. External originals, retained rich information, readable articles, no edit monitoring    | Actual provider extraction, account export, retained article round trip, timed podcast transcript; provider modules and subscription seen-entry checks | Recorded examples support the boundary; unavailable source material is explicit, not invented                                                                       |
| 3. Strong identity, separate editions, stable references                                   | URL identity/policy tests, guarded reconciliation/relationship runtime tests, `identity-journeys.json`                                                 | Live MDN permanent redirects retain context and old IDs; X handles resolve to authoritative IDs. Explicit relationships keep separate targets distinct and private. |
| 4. Private context and enrichment despite shared identity                                  | Foundation private-contribution tests; semantic hostile-vector test; 19 deployed owner-isolation observations                                          | Covered within recorded positive/negative cases; second owner uses a seeded fixture PAT through deployed authentication                                             |
| 5. Lifecycle, archive, deletion suppression and fresh explicit saves                       | Foundation and ingestion race tests; deployed deletion/410/fresh-save and archive/completion traces                                                    | Covered locally and remotely; automatic decision preservation has controlled-runtime plus live review-first evidence                                                |
| 6. Accumulating context with contributor/provenance, idempotent retries                    | Concurrent distinct saves/retries in foundation tests; manual replay; actual MCP replay                                                                | Covered within those cases                                                                                                                                          |
| 7. Latest matching intake, future arrivals, review-first/auto-save, no broad history       | Ingestion boundary/snapshot/concurrency tests; live Spotify/Substack/X/YouTube and timed podcast intake                                                | Delayed-first-poll boundary covered locally; actual YouTube channel intake and repeat sync now pass. Authorized YouTube pagination still lacks usable credentials.  |
| 8. Flat ordered many-to-many collections, synthesis/references, no implicit member capture | Foundation collection tests, member paging tests, manual collection/synthesis/deletion traces; Spotify member pagination                               | Covered within those cases; member listing and subscription creation are separate explicit operations                                                               |
| 9. Independent position/completion, editable annotations                                   | Foundation state test; deployed annotation edits, progress/completion/archive and fresh-generation readback                                            | Covered within those cases; headless/manual HTTP evidence is separate from UI rendering                                                                             |
| 10. Saved-default browse/filter, keyword/semantic/hybrid with evidence                     | Foundation cursors/preferred-source filters, semantic authorization/byte-limit tests; 12 live corpus queries; timestamped transcript retrieval         | Four expected corpus cases rank first across all modes; not a universal search-quality guarantee. Index propagation remains asynchronous                            |
| 11. Source/derived/correction provenance and private precedence                            | Foundation conflict/privacy tests; understanding chunk/reduction/coverage tests; manual personal correction; actual AI output/provenance artifacts     | Covered within those cases; one generated podcast overview manually checked against three transcript passages                                                       |
| 12. Retained thread/quote context without saving context as separate items                 | X extraction/context implementation and controlled runtime checks; real X corpus enrichment and generated thread-coverage outputs                      | Actual examples exist; context is explicitly bounded, not a complete reply archive                                                                                  |

## Delivery requirements

| Requirement                                                                  | Current authoritative evidence                                                                                                                       | Result                                                                                                                                         |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate monorepo rewrite, no legacy runtime implementation/deployment reuse | `rewrite-boundary.json`, actual runtime imports, `deployment.json` binding inventory, tracked diff                                                   | Verified within inspected tree and serving resource settings                                                                                   |
| Fresh Cloudflare persistence/jobs/search/artifacts                           | Actual D1 migrations 0001–0017; deployed new D1/R2/Queue/Vectorize bindings; authenticated runtime observations                                      | Verified for recorded resources and journeys                                                                                                   |
| Existing library used for verification                                       | 444 local and 444 remote capture/readback; original membership matched in `corpus-health.json`                                                       | Verified capture/retention. Fresh extraction counts are separate and incomplete for restricted/rate-limited references                         |
| API contract and adapters                                                    | OpenAPI 3.1 with 45 paths; schema/reference tests; live CLI and official MCP client; canonical-path restriction checks                               | Verified within recorded operations; optional web inspector interaction unverified                                                             |
| Export, erasure and stale-work protection                                    | Full real remote export; full isolated real-corpus erasure; token revocation/generation race tests                                                   | Export live; destructive real-corpus erasure verified only in isolated workerd/D1/R2, not by erasing the deployed account                      |
| Passing applicable repository gates                                          | `repository-checks.json`: 102 API tests on Node 25 and Node 22, type/lint/build; root type/lint/format; 2,212 legacy Worker tests plus 106 web tests | Local gates passed. GitHub CI not run for unpushed work                                                                                        |
| Exact deployed code/resource identity                                        | Public health version and Cloudflare active deployment match in `deployment.json`, source/config/lock digest                                         | Verified at artifact timestamp                                                                                                                 |
| All providers working deeply except deferred Instagram                       | Per-provider source implementations, tests and actual corpus/live artifacts in `providers.md`                                                        | **Incomplete**: Google-authorized metadata/playlist pagination remains unverified. Other sources also have explicit access/rate-limit outcomes |
| Manual proof and reviewable artifacts                                        | Sanitized manual request hashes/IDs, journey assertions, source/model/search/export/isolation artifacts and usage guide                              | Core HTTP proof present. No browser/native UI claims; no universal or irrefutable correctness claim                                            |

## Conditions before claiming completion

1. Obtain an approved usable Google grant, its production decryption key, or a
   YouTube Data API key. Current read-only investigation proves the existing grant
   cannot be decrypted by the available local key; it does not prove the current
   application's integration is absent.
2. Public YouTube intake and repeat synchronization are now verified. Preserve
   that evidence separately from watch-page access and Google API access.
3. Exercise authorized YouTube metadata and multi-page playlist/channel membership
   through the deployed rewrite and retain sanitized assertions/artifacts.
4. Re-audit provider acceptance and any remaining failed/pending outcomes after
   authorized YouTube access is configured. Relationship/reconciliation obligations
   now have actual deployed API evidence; controlled failure/concurrency tests
   establish their specific cases, without implying universal correctness.

Relationship/reconciliation support is part of the agreed contract. Its earlier
omission was found by checking the original domain/API discussion, not resolved by
reducing scope. The additions are now deployed with controlled runtime tests and manual live
HTTP evidence in `identity-journeys.json`. See [the implementation checkpoint](reconciliation-design.md).
Instagram, source-edit monitoring, broad historical intake, nested collections and
topic subscription filters remain outside the agreed initial scope.
