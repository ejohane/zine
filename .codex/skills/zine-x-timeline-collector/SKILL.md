---
name: zine-x-timeline-collector
description: Collect the latest configurable number of organic entries from the authenticated X Following timeline in Chrome or the integrated Codex browser and upload them to Zine's Cloudflare X archive. Use when the user asks to collect, crawl, capture, sync, or archive their X following feed or latest N timeline posts.
---

# Zine X Timeline Collector

Collect top-to-bottom Following timeline entries without exposing browser credentials or large tweet payloads to the conversation. Keep replies, reposts, and quote posts. Exclude ads.

## Requirements

- Work from the Zine repository root.
- Use the browser the user explicitly selects. Follow `chrome:control-chrome` for Chrome or `browser:control-in-app-browser` for the integrated Codex browser. If the user does not select one, prefer Chrome for its existing signed-in session and use the integrated browser only with the user's approval.
- Require `ZINE_X_ARCHIVE_TOKEN` with `x-archive:write` and `x-archive:read`. Never print it.
- Read [references/extraction-contract.md](references/extraction-contract.md) before collection.

## Workflow

1. Resolve the requested count. Default to `500`; accept larger values as requested.
2. Start the local receiver in a PTY and keep the session alive:

   ```bash
   bun run --cwd apps/x-collector receive --count <N>
   ```

   Wait for its one-line JSON readiness response. Record `receiverUrl` and `runId`.
   If browser control restarts while the receiver is alive, reconnect to the same receiver and GET `<receiverUrl>/checkpoint`; do not start a second run.

3. Follow the selected browser skill's bootstrap exactly, including reading its complete browser documentation. Reuse or claim an existing authenticated X tab when available.
4. Navigate to `https://x.com/home`. If signed out, ask the user to sign in. Select the **Following** timeline and verify it is active before extracting.
5. In the persistent browser-control JavaScript session:
   - Import `apps/x-collector/src/browser-extractor.mjs` and `apps/x-collector/src/browser-session.mjs` by absolute path.
   - GET `<receiverUrl>/checkpoint` and pass it to `createCollectionSession`. For a new receiver, the empty checkpoint starts positions at zero; after a browser-control restart, it restores accepted tweet IDs, accepted ad keys, and the next position.
   - Call `extractVisibleTimelineBatch` through the documented Playwright page-evaluation API, passing the session's accepted ad keys as its argument.
   - Pass the result, session state, and N to `prepareTimelineBatch`. It removes accepted primary posts, assigns stable positions, keeps quoted canonical posts, and produces the exact receiver payload.
   - POST each non-empty prepared payload directly from the JavaScript session to `<receiverUrl>/batch`. Do not emit raw post bodies through `nodeRepl.write` or copy them into the conversation.
   - Scroll roughly one viewport, wait for X to settle, and repeat.

6. Recover transient stalls without splitting the logical capture:
   - After five consecutive scrolls add no new primary entries, keep the receiver alive and perform one recovery cycle: wait three seconds, scroll up roughly one viewport, wait briefly, scroll down roughly two viewports, wait three seconds, then extract again.
   - If recovery adds an entry, reset the stall and failed-recovery counters and continue the same run.
   - If recovery adds nothing, increment the failed-recovery counter and repeat the cycle. Finalize as `PARTIAL` with `timeline_stalled` only after three consecutive recovery cycles fail.
   - If browser control disconnects, reconnect, GET `/checkpoint`, rebuild the browser session state, and continue the same receiver/run when possible.

7. Stop when one of these occurs:
   - N unique organic primary timeline entries have been accepted: complete as `COMPLETE`.
   - Three stall-recovery cycles fail: complete as `PARTIAL` with `timeline_stalled`.
   - X blocks loading or the connection fails after supported recovery: complete as `PARTIAL` with a concise reason.

8. POST the completion state to `<receiverUrl>/complete`. The receiver validates, chunks, uploads, finalizes the manifest, and reads the run back from the archive. Large uploads may outlive the browser request timeout; treat the receiver process result as authoritative.
9. Wait for the receiver process to exit successfully. Report the run ID, requested count, collected count, excluded-ad count, recovery count, and verification result.

## Invariants

- “Latest N” means the first N unique organic entries observed top-to-bottom in Following.
- Never upload cookies, local storage, request headers, CSRF values, or authentication data from X.
- Never include promoted or sponsored entries.
- Treat a repost as a timeline presentation pointing to the original canonical tweet; do not manufacture a duplicate tweet.
- Preserve the first observed position when a tweet repeats in one run.
- Keep one receiver alive through browser reconnections and transient X stalls so a logical capture remains one run.
- Let the receiver/API perform canonical deduplication across runs.
- Do not download media; retain media URLs and visible metadata only.
- Leave an interrupted run resumable. Do not fabricate success when the browser connection or upload verification fails.
