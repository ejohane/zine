---
name: zine-x-timeline-collector
description: Collect source-aware organic entries from the authenticated X Following timeline or a configured X List, capture list membership, and upload them to Zine's Cloudflare X archive.
---

# Zine X Timeline Collector

Collect top-to-bottom Following or configured-list timeline entries without exposing browser credentials or large tweet payloads to the conversation. Keep replies, reposts, and quote posts. Exclude ads.

## Requirements

- Work from the Zine repository root.
- Use the browser the user explicitly selects. Follow `chrome:control-chrome` for Chrome or `browser:control-in-app-browser` for the integrated Codex browser. If the user does not select one, prefer Chrome for its existing signed-in session and use the integrated browser only with the user's approval.
- Require `ZINE_X_ARCHIVE_TOKEN` with `x-archive:write` and `x-archive:read`. Never print it.
- Read [references/extraction-contract.md](references/extraction-contract.md) before collection.

## Workflow

1. Resolve the source and collection policy. Following is count-bounded and defaults to `500`. A configured Favorites list is time-bounded to the rolling previous `24` hours, uses `FAVORITES/x-list:<id>` and its stable `https://x.com/i/lists/<id>` URL, and defaults to a separate `5000`-post safety guard. The safety guard is not the Favorites target: reaching it before the time boundary makes the run partial.
2. Start the local receiver in a PTY and keep the session alive:

   ```bash
   bun run --cwd apps/x-collector receive [--count <N>] \
     --source-type <FOLLOWING|FAVORITES|LIST> --source-id <id> \
     --source-name <name> [--source-url <url>] \
     [--window-hours 24] [--safety-limit 5000]
   ```

   Wait for its one-line JSON readiness response. Record `receiverUrl` and `runId`.
   If browser control restarts while the receiver is alive, reconnect to the same receiver and GET `<receiverUrl>/checkpoint`; do not start a second run.

3. Follow the selected browser skill's bootstrap exactly, including reading its complete browser documentation. Reuse or claim an existing authenticated X tab when available.
4. Navigate to the configured source. If signed out, ask the user to sign in. For Following, select **Following** and verify it is active. For a list, verify the exact list ID remains in the URL and the expected list name is visible before every extraction.
   - For list sources, visit the list's Members view, import `list-members-extractor.mjs`, collect unique mounted member usernames through bounded scrolling, and POST small batches to `<receiverUrl>/source-members`. When the roster reaches its visible total or exhausts three stall-recovery cycles, send a final empty batch with `status: COMPLETE`, or `status: PARTIAL` plus `failureReason`. Until that final marker arrives, the receiver deliberately records membership as partial.
5. In the persistent browser-control JavaScript session:
   - Import `apps/x-collector/src/browser-extractor.mjs` and `apps/x-collector/src/browser-session.mjs` by absolute path.
   - GET `<receiverUrl>/checkpoint` and pass it to `createCollectionSession`. For a new receiver, the empty checkpoint starts positions at zero; after a browser-control restart, it restores accepted tweet IDs, accepted ad keys, and the next position.
   - Call `extractVisibleTimelineBatch` through the documented Playwright page-evaluation API, passing the session's accepted ad keys as its argument.
   - Pass the result, session state, and the receiver's requested count/safety limit to `prepareTimelineBatch`. It removes accepted primary posts, assigns stable positions, keeps quoted canonical posts, excludes Favorites posts older than the persisted cutoff, and produces the exact receiver payload plus rolling-window completion state.
   - POST each non-empty prepared payload directly from the JavaScript session to `<receiverUrl>/batch`. Do not emit raw post bodies through `nodeRepl.write` or copy them into the conversation.
   - Scroll roughly one viewport, wait for X to settle, and repeat.
   - For Favorite posts marked as replies or quotes, use `reserveContextExpansion(state, tweetId, 40)` before opening their permalink. If allowed, call the same extractor on the focused thread, pass the result to `prepareContextBatch`, POST the payload to `/batch`, then call `finishContextExpansion` and POST its returned record to `/context-status`. Use `COMPLETE`, `TRUNCATED`, or `FAILED` honestly. If the 40-permalink budget is reached, POST the returned `TRUNCATED/context_budget_reached` record without opening another permalink. Context posts have no timeline item and never count toward N.

6. Recover transient stalls without splitting the logical capture:
   - After five consecutive scrolls add no new primary entries, keep the receiver alive and perform one recovery cycle: wait three seconds, scroll up roughly one viewport, wait briefly, scroll down roughly two viewports, wait three seconds, then extract again.
   - If recovery adds an entry, reset the stall and failed-recovery counters and continue the same run.
   - If recovery adds nothing, increment the failed-recovery counter and repeat the cycle. Finalize as `PARTIAL` with `timeline_stalled` and termination reason `TIMELINE_STALLED` only after three consecutive recovery cycles fail.
   - If browser control disconnects, reconnect, GET `/checkpoint`, rebuild the browser session state, and continue the same receiver/run when possible.

7. Stop when one of these occurs:
   - Following: N unique organic primary timeline entries have been accepted; complete as `COMPLETE` with `COUNT_REACHED`.
   - Favorites/List: three distinct primary entries older than the persisted 24-hour cutoff have been observed; complete as `COMPLETE` with `WINDOW_BOUNDARY_REACHED`. Those boundary-evidence posts are not uploaded.
   - Favorites/List: the 5000-post safety guard is reached before the time boundary; complete as `PARTIAL` with `safety_limit_reached` and `SAFETY_LIMIT_REACHED`.
   - Any rolling-window item lacks a publication timestamp: keep collecting, but the run cannot be complete; finalize as `PARTIAL` with the missing-timestamp count and `COLLECTOR_FAILED`.
   - Three stall-recovery cycles fail: complete as `PARTIAL` with `timeline_stalled`.
   - X blocks loading or the connection fails after supported recovery: complete as `PARTIAL` with a concise reason.

8. POST the completion state and explicit `terminationReason` to `<receiverUrl>/complete`. The receiver validates the termination against count/window coverage, chunks, uploads, finalizes the manifest, and reads the run back from the archive. Large uploads may outlive the browser request timeout; treat the receiver process result as authoritative.
9. Wait for the receiver process to exit successfully. Report the run ID, requested count, collected count, excluded-ad count, recovery count, and verification result.

## Invariants

- For Following, “Latest N” means the first N unique organic entries observed top-to-bottom in the verified source.
- For Favorites, the product boundary is the persisted rolling 24-hour cutoff. The numeric safety guard must never be described as the requested Favorites count.
- A repost card exposes the original post timestamp, not a reliable repost-event timestamp. Before the boundary is proven, retain reposts according to verified list activity order; never use an old reposted original as boundary evidence. Preserve the reposter provenance so the API can disclose this distinction.
- Never collect from For You. A source verification failure stops or pauses extraction rather than silently changing provenance.
- A Favorites run and its membership snapshot are primary Daily View inputs; Following remains a separate run and secondary context.
- Context expansion is capped at 40 Favorite permalinks per run. Every attempted, failed, or budget-truncated expansion is recorded in run provenance.
- Never upload cookies, local storage, request headers, CSRF values, or authentication data from X.
- Never include promoted or sponsored entries.
- Treat a repost as a timeline presentation pointing to the original canonical tweet; do not manufacture a duplicate tweet.
- Preserve the first observed position when a tweet repeats in one run.
- Keep one receiver alive through browser reconnections and transient X stalls so a logical capture remains one run.
- Let the receiver/API perform canonical deduplication across runs.
- Do not download media; retain media URLs and visible metadata only.
- Leave an interrupted run resumable. Do not fabricate success when the browser connection or upload verification fails.
