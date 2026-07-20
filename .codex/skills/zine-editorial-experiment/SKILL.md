---
name: zine-editorial-experiment
description: Create, resume, compare, review, and safely promote durable A/B experiments for Zine's native Today editorial. Use when the user wants to change the editorial algorithm, compare two front pages on their iPhone, continue an experiment in a new Codex thread, record an A/B/Neither decision, or promote an approved variant without losing history.
---

# Zine Editorial Experiment

Run the editorial product loop as a durable server-backed workflow. Treat the experiment API and retained artifacts as authoritative; chat history is never workflow state.

## Non-negotiable rules

- Work only in the supported native app under `apps/ios`. Never implement this workflow in deprecated `apps/mobile`.
- Start every resumed request with `bun run editorial:experiment:status -- --experiment-id <id>`. If no ID is known, list experiments first and identify the relevant active record with the user.
- Keep all local files under `.local-data/editorial/experiments/<experiment-id>/`. Never depend on a temporary chat-only brief or unstored variant.
- Lock the brief only after the user agrees to its hypothesis, proposed change, desired outcomes, and guardrails.
- Build both variants from the exact same snapshot ID. The API rejects mismatched snapshots; do not work around it.
- Variant bundles are immutable. Use stable experiment and variant IDs so retries are idempotent.
- Publishing a variant must not change live Today. Variants become phone-visible only through Editorial Lab preview.
- A phone decision records judgment but never promotes automatically.
- Never call the promotion command unless the user explicitly approves the recorded winning variant. `NEITHER` cannot be promoted.
- After promotion, verify the production edition and `/api/v1/editorial/today` readback match the chosen variant's edition ID and headline. Do not report completion from a successful write alone.

## Workflow

### 1. Resume or create the durable brief

For an existing experiment:

```bash
bun run editorial:experiment:status -- --experiment-id <experiment-id>
```

For a new experiment, create `.local-data/editorial/experiments/<id>/brief.json` with stable IDs and this shape:

```json
{
  "id": "experiment-<date>-<slug>",
  "title": "Human-readable comparison",
  "editionDate": "YYYY-MM-DD",
  "hypothesis": "Why the proposed algorithm change should improve Today.",
  "changeSummary": "The bounded treatment change.",
  "desiredOutcomes": ["Observable product outcome."],
  "guardrails": ["Quality property that must not regress."]
}
```

Create it idempotently:

```bash
bun run editorial:experiment:create -- --file <brief.json>
```

While status is `DRAFT`, update the stored brief with `editorial:experiment:update`. After user agreement:

```bash
bun run editorial:experiment:lock -- --experiment-id <experiment-id>
```

### 2. Freeze inputs and build A/B

Read `.codex/skills/zine-daily-editorial/SKILL.md` before generating editorial artifacts. Capture one snapshot and reuse the same snapshot file for both variants. Keep a self-describing directory:

```text
.local-data/editorial/experiments/<experiment-id>/
  brief.json
  snapshot.json
  A/candidates.json
  A/edition.json
  A/validation.json
  A/edition.md
  B/candidates.json
  B/edition.json
  B/validation.json
  B/edition.md
  manifest.json
```

Variant A is the named control. Variant B contains only the locked treatment. The ranker output may be generative; workflow reproducibility comes from the retained brief, snapshot, candidates, edition, validation, identifiers, and API state.

Validate both independently. Do not publish either variant unless its validation report is valid and its edition status is `VALIDATED`.

### 3. Retain variants for phone review

Use the same snapshot path in both commands:

```bash
bun run editorial:experiment:variant:publish -- \
  --experiment-id <id> --variant-id <stable-a-id> --label A \
  --name <control-name> --description <control-description> \
  --edition <A/edition.json> --snapshot <snapshot.json> \
  --candidates <A/candidates.json> --validation <A/validation.json> \
  --markdown <A/edition.md>

bun run editorial:experiment:variant:publish -- \
  --experiment-id <id> --variant-id <stable-b-id> --label B \
  --name <treatment-name> --description <treatment-description> \
  --edition <B/edition.json> --snapshot <snapshot.json> \
  --candidates <B/candidates.json> --validation <B/validation.json> \
  --markdown <B/edition.md>
```

Read status again. Continue only when the API reports `READY_FOR_REVIEW` with both immutable content hashes.

### 4. Review in the native app

Install and launch a native iOS build when the implementation changed or the user's phone does not already contain the Editorial Lab build. On Today, open the top-right flask, select A or B, and choose **View Variant on Today**. Compare both on the normal Today rendering surface.

The user records A, B, or Neither with optional notes in the sheet. Confirm through the status endpoint that the review is durable and state is `DECIDED`. CLI decision recording is reserved for an explicit user choice when phone submission is unavailable; preserve one `client-event-id` across retries.

### 5. Promote only after explicit approval

Discuss the recorded choice. After the user explicitly says to promote it:

```bash
bun run editorial:experiment:promote -- \
  --experiment-id <id> --variant-id <chosen-variant-id>
```

The server permits only the recorded winner and publishes the exact retained bundle through the normal immutable edition store. Read status, the edition endpoint, and Today again. Compare edition ID, revision, headline, and expected date to the chosen variant.

## State guide

- `DRAFT`: brief may be edited.
- `LOCKED`: brief frozen; generate the first variant.
- `BUILDING`: one variant retained; generate the missing label.
- `READY_FOR_REVIEW`: both variants are phone-visible; collect judgment.
- `DECIDED`: durable review exists; wait for explicit promotion approval.
- `PROMOTED`: winner published; perform production readback.
- `FAILED`: inspect the retained failure before retrying.
- `ABANDONED`: stop; retain all history.

Always follow the API's `nextAction` after confirming it is consistent with these safety rules.

## Definition of done

Do not call the experiment complete until all applicable items are true:

- The agreed brief and outcomes are locked and server-readable.
- A and B share one frozen snapshot ID and have retained artifacts and hashes.
- A new Codex thread can resume from the experiment ID and API status alone.
- Both variants are viewable through Editorial Lab without changing live Today.
- The phone review is persisted with A, B, or Neither and notes.
- Only an explicitly approved winner is promoted; Neither remains unpromoted.
- Production edition and Today readback match the promoted variant.
- The supported native app builds successfully and, when requested as the deliverable, is installed and launched on the physical iPhone.
