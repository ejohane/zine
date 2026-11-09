# Session handoff

Last reviewed: 2026-11-09 UTC. This is a handoff, not live verification. Run the startup
checks in `../AGENTS.md` and inspect current state before acting on it.

## Product direction

Zine is an API-first saving service. Erik wants to start building experiences on
it. Codex will remain the implementation/operations agent, frequently in fresh
sessions. Prioritize durable repository context, clear contracts, structured errors,
repeatable commands and reliable releases. A broad external-developer platform is
not the immediate target. A small SDK/helper is useful only where it removes real
integration friction. The existing CLI and OpenAPI already provide agent entry points.

Client authentication/consent still matters even when one agent writes the code.
First-party Clerk sessions and personal API tokens exist. Fine-grained scopes and
the standard remote MCP OAuth connection/consent flow are proposed follow-up work,
not implemented features. Browser/mobile code should use an appropriate user flow,
not a shared server credential.

## Implementation and release snapshot

- The rewrite lives entirely in `apps/api` and is deployed at
  <https://api-next.myzine.app>. REST is `/v1`, MCP is `/mcp`.
- Current resource names/configuration are in `../wrangler.jsonc`. D1, R2, Queues,
  Vectorize and the Worker are separate from the original backend. Workers AI
  derives understanding and embeddings. Cron runs every five minutes.
- Subscription polls become due fifteen minutes after success; queue/provider
  delays can extend the observed interval.
- The live authenticated inspector is `/`; API reference is `/docs`; the public
  explanatory walkthrough is `/architecture`. The walkthrough is illustrative and
  does not make live requests or change the library.
- At review time the checkout was detached at `da8d917`, with `apps/api`, the new
  API checks workflow, root agent-routing documentation and `bun.lock` edits still uncommitted. Recheck git; do not
  overwrite or silently claim this work has been merged or run in GitHub CI.
- The API workflow currently checks lint/typecheck/test/build; it is not an
  automated staging/production deployment pipeline. The configured environment
  label remains `preview` despite the publicly reachable deployment.

## Current acceptance blocker

Live Google-authorized YouTube metadata and playlist/channel pagination need an
approved usable grant/API key, or access to the key that decrypts the original
Google grant. The original application supports Google integration. Its production
Worker has an `ENCRYPTION_KEY` secret binding; the settings API exposes no value.
The inspected local key did not decrypt the existing grant. Do not describe this
as the original application's integration being absent.

Public YouTube extraction and channel-feed intake have live evidence. Their
success is separate from official authorized API acceptance. Metadata inventory
and prior investigation are in `../evidence/google-credential-availability.json`
and `google-grant-reuse.json`. Never paste keys into the handoff.

## Implemented behavior and evidence

Read the blueprint and completion audit for the full contract. Core behavior
includes durable saves, private context, lifecycle/progress, collections/synthesis,
annotations, rich contributions/corrections, six-provider integration, subscriptions,
keyword/semantic/hybrid search, strong identity reconciliation, private relationships,
export/erasure, revocable tokens, CLI/MCP adapters and job/recovery machinery.

Evidence locations:

- `verification.md`: artifact inventory and scope limits.
- `completion-audit.md`: requirement-by-requirement acceptance, including the blocker.
- `../evidence/deployment.json`: timestamped active-version/resource inspection.
- `../evidence/library-import.json` and `remote-library-import.json`: real-library
  capture/readback, separate from fresh provider extraction.
- `../evidence/identity-journeys.json`, `remote-isolation.json`, `search-quality.json`
  and `live-sources.json`: bounded live behavior checks.
- `../evidence/erasure-concurrency.json`: controlled Worker races and isolated
  real-library erasure; it is not deployed real-account deletion.
- `../evidence/repository-checks.json`: recorded checks and runtime versions. The
  architecture guide has separate interaction/delivery evidence in
  `architecture-guide.json`; do not extrapolate a previous suite count to new code.

Browser use was disabled during walkthrough verification. DOM interactions, static
checks and HTTP delivery passed; visual browser review was not observed. Recheck
current tool availability rather than assuming that limitation is permanent.
Private `.local-data` inputs are not committed and are not required for isolated
fixture tests. Never fabricate unavailable original-library artifacts.

## Active production work

Erik authorized completing all discussed productionization work except OAuth.
Follow [productionization.md](productionization.md) for the acceptance requirements,
current work order and proof. This supersedes the earlier planning-only wording.

New OAuth flows/consent and Google-authorized acceptance are excluded from this
production task. Preserve existing Clerk verification. Scoped PATs, operational
controls, client helpers, events/webhooks, staging/release/recovery and live proof
are included. The original Google acceptance issue remains a separately deferred
item; it must not silently block this authorized non-OAuth work.

The goal tool rejected creating a replacement while the older goal remained
unfinished. Erik said replacing it is unnecessary and can be a TODO. Track the
work in the repository and continue; do not mark the older objective complete to
work around the tracker.
