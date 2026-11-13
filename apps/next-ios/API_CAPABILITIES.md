# Contract-shaped capability preview

Reviewed against `origin/main` `1ae31a1012ce26b9677e6839fe4b188875aae0ea`
(2026-11-09). The checkout matched main after a fresh fetch; all existing prototype
edits were preserved. API doctor passed public health and OpenAPI availability.
That is not authenticated integration verification.

The intended service is now the independent `apps/api` `/v1` boundary. This app
still runs entirely locally. `APIPreview.json` contains mock response envelopes
around the 22 existing development-metadata samples; it contains no credentials
or imported API account state. Swift DTOs are independent of Worker runtime code.

| Capability             | Contract                                                     | Preview behavior                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable save + context | `POST /v1/saves`                                             | Local capture includes a reason and tags. Deliberate repeat saves add context without duplicating the item and reactivate archive/dismissal. No network retry/idempotency transport is simulated.                                                           |
| Lifecycle              | `GET/PATCH /v1/items/{itemId}`                               | All saves, Inbox, Archive, Dismissed; arrivals can be kept/dismissed; dismissed references can be saved again. Default saved browsing includes archives.                                                                                                    |
| Position + completion  | `PATCH /v1/items/{itemId}/progress`                          | Resume strip, card progress, position slider; completion and archive stay independent. Position does not imply playback.                                                                                                                                    |
| Personal context       | `GET/POST /v1/items/{itemId}/context`                        | Sample saved reasons and working local note creation; notes survive relaunch and are searchable.                                                                                                                                                            |
| Search + evidence      | `POST /v1/items/search`                                      | Words searches local titles, creators, tags and notes. Meaning is scripted for “designing with AI” and “attention and craft”; Both combines those fixtures with keyword matches. Results show matched context/field evidence. No embeddings or live AI run. |
| Collections            | `/v1/collections`, ordered `/items`, `/notes`                | Two collections, ordered items, sample synthesis linked to supporting saves; many-to-many membership can be changed without deleting items.                                                                                                                 |
| Understanding          | Item `content`, `enrichment.fields`, `enrichment.components` | Summary/topics, source vs derived provenance, metadata-only coverage, pending/processing/failed/unavailable examples. A durable save does not imply extraction success.                                                                                     |
| Retained material      | `/v1/items/{itemId}/article`, `/transcript`                  | One explicitly synthetic partial reading sample and one illustrative segmented transcript. Neither is represented as the author’s or speaker’s words.                                                                                                       |
| Annotations            | `/v1/items/{itemId}/annotations`                             | Sample text highlight and timestamp anchor. Timestamp selection changes saved position; it does not start playback.                                                                                                                                         |
| Relationships          | `/v1/items/{itemId}/relationships`                           | Explicit related-save links. These are personal connections, not title-based identity merges.                                                                                                                                                               |
| Following              | `/v1/sources`, `/v1/subscriptions`                           | Review-first vs auto-save controls and source cooldown. Subscription changes are session-only; no polls/ingestion occur. Existing arrivals are not rewritten when a mode changes.                                                                           |

## Reproduce

From the repo root:

```sh
python3 apps/next-ios/scripts/make-api-preview.py
bun run apps/next-ios/scripts/validate-api-preview.ts
xcodegen generate --spec apps/next-ios/project.yml
```

The validator imports the service's actual response schemas **at development time**
and checks 98 mock responses, material field values and contribution provenance.
It does not issue API mutations and is not part of the app bundle/runtime.

Native tests cover persistence, independent lifecycle/progress/completion/archive,
repeat-save context, multi-collection membership, evidence-bearing local search,
fixture references and bento geometry. Render captures cover light/dark, compact,
large/accessibility text, scrolled headers, and later feed composition. Native
interaction tests separately exercise search suggestions, collection navigation,
inbox decisions, header swipes, vertical scrolling, story opening and capture.

## Integration next

Real Clerk authentication, transport, cursor pagination, error/retry handling and
stable persisted save idempotency keys are future integration work. Never embed a
shared PAT. Meaning search must expose genuine service errors/index pending state,
not silently become keyword search. Fetch retained material opt-in and preserve
its coverage/provenance. Source media stays on its platform. Do not wire this
prototype back to the legacy `/api/v1` client as a shortcut.

Other available service contracts (identity reconciliation, source-member paging,
corrections, events/webhooks and portability) are documented in `apps/api`; they
are not presented as implemented product experiences here.

## Verification for build 4

- Fresh fetch at start and finish: HEAD and `origin/main` both
  `1ae31a1012ce26b9677e6839fe4b188875aae0ea`; no pull/reset was necessary.
- API doctor: public health/database-connectivity and OpenAPI availability passed.
- 98 fixture responses passed actual service schema validation.
- 19 native tests passed: 17 model/render tests and two automated UI journeys.
  A completion mutation exclusivity crash was found and fixed before the passing run.
- 24 offscreen captures exported across feed/detail/utility states; reviewed
  landscape Home, detail and Following, with light/dark and large-text coverage.
- Direct Simulator computer use visibly inspected the updated Home, but its app
  accessibility controls were absent and a search tap did not activate. Manual
  end-to-end interaction verification is incomplete; automated native UI tests
  are separate evidence and passed.
- Signed Release build 4 verified with `codesign --verify --deep --strict` and
  installed on the physical iPhone Duo. Physical UI feel/folding is not inferred
  from installation or offscreen rendering.
- No API auth, writes, deployment, backend source changes or legacy app edits were
  performed by this capability iteration. No local backend server was started.
