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

3. Follow the selected browser skill's bootstrap exactly, including reading its complete browser documentation. Reuse or claim an existing authenticated X tab when available.
4. Navigate to `https://x.com/home`. If signed out, ask the user to sign in. Select the **Following** timeline and verify it is active before extracting.
5. In the persistent browser-control JavaScript session:
   - Import `apps/x-collector/src/browser-extractor.mjs` by absolute path.
   - Keep a `Set` of accepted primary tweet IDs, a `Set` of seen ad keys, and a monotonically increasing position counter.
   - Call `extractVisibleTimelineBatch` through the documented Playwright page-evaluation API, passing the seen ad keys as its argument. Add returned `adKeys` to the set before the next call.
   - Remove timeline items already accepted. Assign new items positions `0...N-1` in observed DOM order.
   - Keep every returned canonical post needed by those items, including quoted posts. Do not count quoted embedded posts toward N.
   - POST each small batch directly from the JavaScript session to `<receiverUrl>/batch`. Do not emit raw post bodies through `nodeRepl.write` or copy them into the conversation.
   - Scroll roughly one viewport, wait for X to settle, and repeat.

6. Stop when one of these occurs:
   - N unique organic primary timeline entries have been accepted: complete as `COMPLETE`.
   - Five consecutive scrolls add no new primary entries: complete as `PARTIAL` with `timeline_stalled`.
   - X blocks loading or the connection fails after supported recovery: complete as `PARTIAL` with a concise reason.

7. POST the completion state to `<receiverUrl>/complete`. The receiver validates, chunks, uploads, finalizes the manifest, and reads the run back from the archive.
8. Wait for the receiver process to exit successfully. Report the run ID, requested count, collected count, excluded-ad count, and verification result.

## Invariants

- “Latest N” means the first N unique organic entries observed top-to-bottom in Following.
- Never upload cookies, local storage, request headers, CSRF values, or authentication data from X.
- Never include promoted or sponsored entries.
- Treat a repost as a timeline presentation pointing to the original canonical tweet; do not manufacture a duplicate tweet.
- Preserve the first observed position when a tweet repeats in one run.
- Let the receiver/API perform canonical deduplication across runs.
- Do not download media; retain media URLs and visible metadata only.
- Leave an interrupted run resumable. Do not fabricate success when the browser connection or upload verification fails.
