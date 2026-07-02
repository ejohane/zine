# Web Deployment on Cloudflare

This repo now supports production web deployment to Cloudflare Workers from GitHub Actions. Cloudflare Pages is no longer part of the intended production path.

## What is automated

- `.github/workflows/deploy-web.yml` builds `apps/web` on every push to `main` when the web app or its shared dependencies change.
- `apps/web/wrangler.toml` declares the web app as a static-assets Worker and maps the production deployment to both the `www.myzine.app` and `myzine.app` custom domains.
- The build output from `apps/web/dist` is deployed with `wrangler deploy --env production`.
- SPA route fallback is handled by `assets.not_found_handling = "single-page-application"`, so direct loads of routes like `/bookmarks`, `/settings`, `/sign-in`, and `/oauth/callback` resolve correctly on Workers.

## GitHub configuration

Set these repository secrets:

- `CLOUDFLARE_API_TOKEN`: API token with access to Worker deployments.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID for the target zone.

Set these repository variables:

- `VITE_API_URL`: `https://api.myzine.app`
- `VITE_CLERK_PUBLISHABLE_KEY`: Production Clerk publishable key for the web app.
- `VITE_YOUTUBE_CLIENT_ID`: Google OAuth client ID used by both YouTube and Gmail web flows.
- `VITE_SPOTIFY_CLIENT_ID`: Spotify OAuth client ID for the web flow.

## Cloudflare Worker configuration

The web app now deploys as its own Worker from `apps/web/wrangler.toml`.

Production details:

- Worker name: `zine-web-production`
- Custom domains: `www.myzine.app`, `myzine.app`
- Static asset directory: `apps/web/dist`

Before the first deploy, remove any existing Cloudflare Pages attachment for `www.myzine.app` or `myzine.app`. A custom domain cannot be owned by both Pages and a Worker deployment at the same time.

## Cloudflare DNS and Worker configuration

The API Worker production route is still declared separately in `apps/worker/wrangler.toml` for `api.myzine.app/*`.

Manual checks still required:

- Ensure the `myzine.app` zone exists in the same Cloudflare account used by CI.
- Ensure `api.myzine.app` is still routed to the backend Worker.
- Ensure `www.myzine.app` and `myzine.app` are not attached to a Pages project or conflicting DNS target before the first web Worker deploy.
- After the first deploy, confirm Cloudflare has provisioned both custom domains and certificates for the web Worker.

## Worker production secrets and bindings

The web deployment depends on the API Worker being correctly configured in production.

Required Cloudflare Worker secrets or vars:

- `CLERK_WEBHOOK_SECRET`: Required for `POST /api/auth/webhook`.
- `ENCRYPTION_KEY`: Required for storing and refreshing OAuth tokens.
- `GOOGLE_CLIENT_ID`: Used for YouTube and Gmail OAuth.
- `GOOGLE_CLIENT_SECRET`: Supported as optional in code, but should be set for a production web client.
- `SPOTIFY_CLIENT_ID`: Required for Spotify OAuth and Spotify API usage.
- `SPOTIFY_CLIENT_SECRET`: Required for Spotify token exchange and refresh.
- `OAUTH_REDIRECT_URI`: Recommended only if you want the backend to force a single canonical callback origin. The web app derives its callback from the current origin, so this is not required when serving both `https://www.myzine.app` and `https://myzine.app` directly.
- `CLERK_JWKS_URL`: Set this if you are not using the default `https://clerk.myzine.app/.well-known/jwks.json`.

Personal access tokens are managed by signed-in users from Web Settings. No
Worker secret is required for the `/api/v1` personal API.

Personal API examples:

```bash
curl -H "Authorization: Bearer $ZINE_PAT" \
  "https://api.myzine.app/api/v1/inbox?limit=10"

curl -H "Authorization: Bearer $ZINE_PAT" \
  "https://api.myzine.app/api/v1/bookmarks?limit=10"

curl -X POST "https://api.myzine.app/api/v1/bookmarks" \
  -H "Authorization: Bearer $ZINE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/article"}'
```

Cloudflare production resources that must already exist and match `apps/worker/wrangler.toml`:

- Production D1 database
- Production KV namespaces
- Production R2 bucket
- Production queues

## Clerk configuration

The web app uses Clerk on these routes:

- `https://www.myzine.app/sign-in`
- `https://www.myzine.app/sign-up`
- `https://myzine.app/sign-in`
- `https://myzine.app/sign-up`

Manual Clerk setup:

- Add both `https://www.myzine.app` and `https://myzine.app` as allowed origins.
- Add both `https://www.myzine.app` and `https://myzine.app` as allowed redirect origins if your Clerk instance requires an explicit redirect allowlist.
- Set the sign-in URL and sign-up URL to the hostname you want to treat as canonical for Clerk-hosted flows.
- Set post-auth redirects to either `/bookmarks` or the canonical absolute URL for your chosen host.
- Create a Clerk webhook pointing to `https://api.myzine.app/api/auth/webhook`.
- Copy the Clerk webhook signing secret into the Worker secret `CLERK_WEBHOOK_SECRET`.
- If you use a Clerk custom domain other than `clerk.myzine.app`, set `CLERK_JWKS_URL` on the Worker to that domain’s JWKS endpoint.

## Google OAuth configuration for YouTube and Gmail

The web app initiates both YouTube and Gmail OAuth from the same Google client ID. The callback URLs are:

- `https://www.myzine.app/oauth/callback`
- `https://myzine.app/oauth/callback`

Manual Google Cloud setup:

- Create or reuse a Google OAuth client that allows both callback URLs above.
- Put that client ID in both:
  - GitHub variable `VITE_YOUTUBE_CLIENT_ID`
  - Worker secret or var `GOOGLE_CLIENT_ID`
- Put the client secret in Worker secret `GOOGLE_CLIENT_SECRET`.
- Enable the YouTube Data API v3.
- Enable the Gmail API.
- Configure the OAuth consent screen for the requested scopes.

Scopes requested by the app:

- YouTube: `https://www.googleapis.com/auth/youtube.readonly`
- Gmail: `https://www.googleapis.com/auth/gmail.readonly`
- Shared Google identity scopes: `userinfo.email`, `userinfo.profile`

Important production note:

- Gmail read access is a high-friction Google scope. If the app will be used by anyone outside your Google test users, expect OAuth consent review and possibly app verification before Gmail works broadly in production.

## Spotify OAuth configuration

Spotify uses these callback URLs:

- `https://www.myzine.app/oauth/callback`
- `https://myzine.app/oauth/callback`

Manual Spotify setup:

- Add both callback URLs above in the Spotify developer dashboard.
- Put the client ID in both:
  - GitHub variable `VITE_SPOTIFY_CLIENT_ID`
  - Worker secret or var `SPOTIFY_CLIENT_ID`
- Put the client secret in Worker secret `SPOTIFY_CLIENT_SECRET`.

Scope requested by the app:

- `user-library-read`

## First production deploy checklist

1. Confirm the Worker is already deploying successfully from `.github/workflows/deploy-worker.yml`.
2. Remove `www.myzine.app` and `myzine.app` from any existing Cloudflare Pages project.
3. Set the GitHub secrets and variables listed above.
4. Set the Worker production secrets in Cloudflare.
5. Configure Clerk, Google, and Spotify dashboards.
6. Push to `main` or run the `Deploy Web` workflow manually.
7. Verify that both custom domains are attached to the deployed web Worker.

## Post-deploy verification

- Open `https://www.myzine.app/sign-in` and `https://myzine.app/sign-in` and verify Clerk renders.
- Open `https://www.myzine.app/bookmarks` and `https://myzine.app/bookmarks` and confirm the app loads after authentication.
- Verify `https://api.myzine.app/health` returns a healthy production response.
- Test a YouTube connection.
- Test a Spotify connection.
- Test a Gmail connection.
- Confirm direct page loads on `/settings`, `/bookmarks`, and `/oauth/callback` do not 404.
