# Editorial experiments

Zine's editorial experiment platform separates algorithm development from the live Today edition. An experiment retains a locked product brief, two immutable validated edition bundles, a phone review, and an optional promoted winner. All state is scoped to the authenticated user and survives Codex sessions.

## Lifecycle

```text
DRAFT -> LOCKED -> BUILDING -> READY_FOR_REVIEW -> DECIDED -> PROMOTED
                    |                 |               |
                    +-----------------+-------> FAILED
                    +-------------------------> ABANDONED
```

- `DRAFT` is the only editable state.
- Locking freezes the hypothesis, treatment, desired outcomes, and guardrails.
- The first immutable variant moves the experiment to `BUILDING`; both A and B move it to `READY_FOR_REVIEW`.
- The Worker enforces a shared snapshot ID across A and B.
- A review records A, B, or Neither plus notes and moves the experiment to `DECIDED`.
- A decision never publishes. Promotion is a separate authenticated action and accepts only the recorded winner.
- Promotion sends the exact retained bundle through the normal immutable daily-edition storage path.
- Failure and abandonment retain the brief, variants, and review rather than deleting history.

## REST surface

All endpoints use the existing Clerk/PAT-authenticated `/api/v1` boundary.

| Method  | Endpoint                                         | Purpose                                       |
| ------- | ------------------------------------------------ | --------------------------------------------- |
| `GET`   | `/editorial/experiments`                         | List resumable experiments and next actions   |
| `POST`  | `/editorial/experiments`                         | Create an idempotent draft brief              |
| `GET`   | `/editorial/experiments/:id`                     | Read the authoritative workflow state         |
| `PATCH` | `/editorial/experiments/:id`                     | Edit a draft brief                            |
| `POST`  | `/editorial/experiments/:id/lock`                | Freeze the brief                              |
| `POST`  | `/editorial/experiments/:id/variants`            | Retain an immutable validated A or B bundle   |
| `GET`   | `/editorial/experiments/:id/variants/:variantId` | Render a variant through the Today read model |
| `POST`  | `/editorial/experiments/:id/decision`            | Persist an idempotent A/B/Neither review      |
| `POST`  | `/editorial/experiments/:id/promote`             | Publish only the reviewed winner              |
| `POST`  | `/editorial/experiments/:id/failure`             | Retain a terminal failure                     |
| `POST`  | `/editorial/experiments/:id/abandon`             | Stop without deleting experiment history      |

The OpenAPI source of truth is `apps/worker/src/routes/api-v1.openapi.json`. Root scripts named `editorial:experiment:*` provide the same workflow for Codex and scheduled jobs.

## Native review

The supported SwiftUI app exposes Editorial Lab from the flask button on Today. The sheet shows the locked brief, variant descriptions and quality scores, and the review controls. **View Variant on Today** swaps the Today read model in memory and displays a persistent preview banner; it does not mutate the live edition or cache the preview as Today. Editorial feedback impressions are suppressed while previewing so experimental edition IDs do not pollute production feedback.

The app deliberately has no promotion control. After a phone decision is persisted, Codex discusses the result and calls promotion only after explicit user approval.

## Retention and resumption

Variant bundles live in R2 below `editorial-experiments/users/<user>/<experiment>/<label>/...` and are addressed by a SHA-256 content hash. D1 stores workflow metadata, hashes, review events, and the promoted edition reference. Local generation artifacts belong under `.local-data/editorial/experiments/<experiment-id>/` and are ignored by Git.

A new Codex thread resumes by running `editorial:experiment:status`; chat transcript state is neither necessary nor authoritative. The repo skill at `.codex/skills/zine-editorial-experiment/SKILL.md` contains the complete operator workflow and definition of done.
