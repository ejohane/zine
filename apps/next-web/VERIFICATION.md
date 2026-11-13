# PWA verification — 2026-11-10 UTC

The full receipts below describe the initial baseline. The later feed cleanup
removes the utility icons, scope row and resume banner; older full-journey scripts
that target those removed controls need revision before reuse. This cleanup passed
typecheck, lint, production build and direct Tailscale browser observation, with
tablet/phone captures in `output/playwright/clean-home.png` and `clean-phone.png`.
The baseline receipt hashes are historical after this rebuild.

This is evidence for the local **production build**, not a claim that all browsers,
physical devices or future deployments behave identically. No live API is used.

## Requirements and evidence

| Requirement                            | Observed evidence                                                                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recreate native mock                   | Same native fixture/artwork hashes; planner invariants; measured article/podcast/post geometry; actual light/dark renders                                                        |
| One vertical feed and floating filters | Chrome journey checks pinned header position, computed blur, five format filters, header scrub and inert horizontal body drag                                                    |
| Existing mock capabilities             | Real forms/buttons exercise capture, repeat capture, notes, search evidence, collection synthesis/membership, inbox decisions, following controls, annotations and related saves |
| Durable local state                    | Reload after notes/progress/archive/completion; cold offline opening and offline note creation plus deep-link reload                                                             |
| Installable PWA                        | Chrome 157 reports no manifest/installability errors; CDP installs an OS-registered app and launches it; standalone display mode is true                                         |
| Installed offline use                  | The installed standalone window reloads with networking disabled and shows the feed                                                                                              |
| Responsive and accessible operation    | 320/390/951/1024/1440 widths, 200% text, light/dark, reduced motion; modal focus loop, Escape and focus return; axe has zero violations in three checked states                  |
| Additional engine                      | WebKit 26.4 iPad-sized touch filter, square podcasts, search, note creation and note/deep-link reload pass with zero runtime errors                                              |
| Direct visible review                  | Codex Browser interaction opened search, selected “attention and craft”, opened The Running Novelist, returned with query preserved, then visibly reviewed Home                  |

Artifacts under ignored `output/playwright/` contain sample content and stay local:

- `verification.json`: consolidated receipts and SHA256 artifact/build hashes.
- `browser-walkthrough.webm`: actual browser interaction recording.
- `chromium-trace.zip`: DOM/action/network trace, inspect with Playwright trace viewer.
- `chromium-result.json`: 13 passing browser journeys, zero runtime errors.
- `install.log`: actual installed/standalone/offline result, loaded bundle identity.
- `accessibility.log`: axe results, including manual-review/incomplete rules.
- `webkit-result.json` and `webkit-trace.zip`: separate engine scope and limitation.
- `home-light.png`, `home-dark.png`, `home-scrolled.png`, `phone-light.png`,
  `ipad-light.png`, `large-text.png`, `search-evidence.png`, `collection.png`,
  `offline-persistence.png`, `installed-standalone.png`, `installed-offline.png`.

## Limits

WebKit's automated offline `page.reload` returns an internal engine error on this
host. Its offline result is recorded **false**, not passed or silently skipped.
Chrome offline journeys passed. This does not establish physical iPad Safari
installation/offline acceptance. No physical haptic, fold-state, or native UI claim
comes from these browser tests. Axe's zero violations are bounded checks, not a
complete accessibility certification; home contrast/ARIA incomplete rules need
manual review. Update activation is implemented but no deployed-version upgrade
acceptance is claimed. The API fixtures do not prove authenticated integration.

## Reproduce

Run from `apps/next-web` with the production preview running:

```sh
bun run test
bun run typecheck
bun run lint
bun run build
node verification/run-browser.mjs chromium
node verification/run-browser.mjs webkit
node verification/capture-layouts.mjs
node verification/walkthrough.mjs
```

The journey sources are raw Playwright functions usable by `playwright-cli
run-code --filename verification/browser-flow.js` and the other named scripts.
The matching repository Playwright 1.59.1 runner is a fallback for the latest CLI's
incompatible protocol with the cached WebKit engine. No Playwright test specs or
extra browser download is required. Chromium uses the installed Chrome channel.

For OS installation verification, use a dedicated persistent Chrome profile with
Playwright CLI, then run `verification/install.js`. It installs the localhost app
if absent, sets standalone mode, launches it and verifies an offline reload.
`verification/accessibility.js` additionally uses the workspace axe-core script.
Run `python3 scripts/collect-evidence.py` after those receipts exist.

`bun run apps/next-ios/scripts/validate-api-preview.ts` from the repository root
checks 98 source fixture responses against actual `/v1` schemas. Native tests and
physical iOS delivery are separate from this web verification.
