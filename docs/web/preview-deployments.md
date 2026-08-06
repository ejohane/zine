# Web branch previews

Zine web branches can be published to isolated Cloudflare Workers at:

```text
https://<normalized-branch>-<digest>.preview.myzine.app
```

The workflow lives in `.github/workflows/deploy-web-preview.yml`. It deploys pushes to non-`main`
branches when web-facing paths change, and it can also be run manually with a branch ref. The
production `myzine.app` Worker and its workflow are separate.

## GitHub configuration

The workflow uses the existing repository configuration:

- Secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`
- Variables: `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`
- Optional variables: `VITE_SPOTIFY_CLIENT_ID`, `VITE_YOUTUBE_CLIENT_ID`

Create a GitHub environment named `web-preview`. Requiring approval on that environment is
recommended if branches can be pushed by anyone beyond trusted maintainers. The Cloudflare token
must be limited to the Zine account and have permission to edit Workers and the `myzine.app` zone's
Worker domains.

Fork and Dependabot pull requests do not receive preview credentials. Never change this workflow to
use `pull_request_target` while checking out and building pull-request code.

## Runtime boundary

Each branch receives a separate static-assets Worker and exact custom domain. Browser requests to
`/trpc` and `/api/v1` stay on the preview origin; the preview Worker forwards only those paths to
`VITE_API_URL`. Authorization headers are preserved, while browser cookies and origin headers are
not forwarded. Other backend, admin, and webhook paths are not proxied.

Preview assets and API responses include `X-Robots-Tag: noindex, nofollow, noarchive`. The web app
also displays a persistent preview badge stating that it is connected to live Zine data.

Clerk can use the production account because previews remain beneath `myzine.app`. Provider OAuth
connections are intentionally blocked because Google and Spotify require exact registered callback
URLs for every origin. Existing sources, reading, bookmarks, and other authenticated behavior use
the live account and can mutate live data.

## Verification and cleanup

Every deployment verifies `/_preview/health` and checks that the returned Git SHA matches the
checked-out commit. The preview URL is attached to the GitHub deployment environment and written to
the workflow summary.

Deleting a branch removes its Worker. A preview can also be deployed or removed from the workflow's
manual `workflow_dispatch` action by supplying the branch ref and choosing `deploy` or `delete`.

For local validation without uploading:

```bash
bun run --cwd apps/web build
bunx wrangler@4.119.0 deploy --config apps/web/wrangler.preview.toml --dry-run
```
