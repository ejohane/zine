# Zine Browser Extension

The browser extension saves the active browser tab to Zine through the public
personal access token API.

## Build

```bash
bun run --cwd apps/chrome-extension build
```

The loadable extension is written to `apps/chrome-extension/dist`.

To also create packaged browser files:

```bash
bun run --cwd apps/chrome-extension package
```

This creates:

```text
apps/chrome-extension/dist/zine-chrome.zip
apps/chrome-extension/dist/zine-firefox.xpi
```

## Chrome or Chromium Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `apps/chrome-extension/dist/chrome`.

## Firefox Install

For a file-based install, use:

```text
apps/chrome-extension/dist/zine-firefox.xpi
```

Firefox Release generally requires installed add-ons to be signed by Mozilla. For
local development without signing, use the temporary install flow:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on**.
3. Select `apps/chrome-extension/dist/firefox/manifest.json`.

Temporary Firefox add-ons are removed when Firefox restarts.

## Configure

Create a token in Zine web Settings with **Add bookmarks** enabled, then paste it
into the extension options page. The default API URL is:

```text
https://api.myzine.app
```

## Behavior

- The popup saves the active `http` or `https` tab.
- The page context menu includes **Save page to Zine**.
- Browser-internal pages such as `chrome://extensions` cannot be saved.
- Private content behind a site login is saved as a URL; Zine's server-side
  preview can only fetch metadata that is reachable from the Worker.
