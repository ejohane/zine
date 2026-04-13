# Web Deployment on Cloudflare

This repo now supports production web deployment to Cloudflare Pages from GitHub Actions.

## What is automated

- `.github/workflows/deploy-web.yml` builds `apps/web` on every push to `main` when the web app or its shared dependencies change.
- The build output from `apps/web/dist` is uploaded to Cloudflare Pages with `wrangler pages deploy`.
- SPA route fallback is handled by `apps/web/public/_redirects`, so direct loads of routes like `/bookmarks`, `/settings`, `/sign-in`, and `/oauth/callback` resolve correctly on Pages.

## GitHub configuration

Set these repository secrets:

- `CLOUDFLARE_API_TOKEN`: API token with access to Pages deployments and Worker deployments.
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID for the target zone.
- `D1_DATABASE_ID`: Existing secret used by `.github/workflows/deploy-worker.yml` for production migrations.

Set these repository variables:

- `CLOUDFLARE_PAGES_PROJECT_NAME`: The Cloudflare Pages project name for the production web app.
- `VITE_API_URL`: `https://api.myzine.app`
- `VITE_CLERK_PUBLISHABLE_KEY`: Production Clerk publishable key for the web app.
- `VITE_YOUTUBE_CLIENT_ID`: Google OAuth client ID used by both YouTube and Gmail web flows.
- `VITE_SPOTIFY_CLIENT_ID`: Spotify OAuth client ID for the web flow.

## Cloudflare Pages configuration

Create a Cloudflare Pages project manually before the first CI deployment.

- Framework preset: none required.
- Production branch: `main`
- Build command: not used by CI direct upload.
- Build output directory: not used by CI direct upload.

After the project exists, connect the custom domain:

- Attach `www.myzine.app` to the Pages project.
- If you want the apex domain to resolve cleanly, add a redirect from `myzine.app` to `https://www.myzine.app`.

## Cloudflare DNS and Worker configuration

The Worker production route is already declared in `apps/worker/wrangler.toml` for `api.myzine.app/*`.

Manual checks still required:

- Ensure the `myzine.app` zone exists in the same Cloudflare account used by CI.
- Ensure `api.myzine.app` has a proxied DNS record in Cloudflare so the Worker route can resolve publicly.
- Ensure `www.myzine.app` is attached to the Pages project and resolves through Cloudflare.

## Worker production secrets and bindings

The web deployment depends on the API Worker being correctly configured in production.

Required Cloudflare Worker secrets or vars:

- `CLERK_WEBHOOK_SECRET`: Required for `POST /api/auth/webhook`.
- `ENCRYPTION_KEY`: Required for storing and refreshing OAuth tokens.
- `GOOGLE_CLIENT_ID`: Used for YouTube and Gmail OAuth.
- `GOOGLE_CLIENT_SECRET`: Supported as optional in code, but should be set for a production web client.
- `SPOTIFY_CLIENT_ID`: Required for Spotify OAuth and Spotify API usage.
- `SPOTIFY_CLIENT_SECRET`: Required for Spotify token exchange and refresh.
- `OAUTH_REDIRECT_URI`: Recommended to set to `https://www.myzine.app/oauth/callback` for production consistency.
- `CLERK_JWKS_URL`: Set this if you are not using the default `https://clerk.myzine.app/.well-known/jwks.json`.

Cloudflare production resources that must already exist and match `apps/worker/wrangler.toml`:

- Production D1 database
- Production KV namespaces
- Production R2 bucket
- Production queues

## Clerk configuration

The web app uses Clerk on these routes:

- `https://www.myzine.app/sign-in`
- `https://www.myzine.app/sign-up`

Manual Clerk setup:

- Add `https://www.myzine.app` as an allowed origin.
- Set the sign-in URL to `https://www.myzine.app/sign-in`.
- Set the sign-up URL to `https://www.myzine.app/sign-up`.
- Set post-auth redirects to `https://www.myzine.app/bookmarks` or `/bookmarks`.
- Create a Clerk webhook pointing to `https://api.myzine.app/api/auth/webhook`.
- Copy the Clerk webhook signing secret into the Worker secret `CLERK_WEBHOOK_SECRET`.
- If you use a Clerk custom domain other than `clerk.myzine.app`, set `CLERK_JWKS_URL` on the Worker to that domain’s JWKS endpoint.

## Google OAuth configuration for YouTube and Gmail

The web app initiates both YouTube and Gmail OAuth from the same Google client ID. The callback URL is:

- `https://www.myzine.app/oauth/callback`

Manual Google Cloud setup:

- Create or reuse a Google OAuth client that allows the callback URL above.
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

Spotify uses this callback URL:

- `https://www.myzine.app/oauth/callback`

Manual Spotify setup:

- Add the callback URL above in the Spotify developer dashboard.
- Put the client ID in both:
  - GitHub variable `VITE_SPOTIFY_CLIENT_ID`
  - Worker secret or var `SPOTIFY_CLIENT_ID`
- Put the client secret in Worker secret `SPOTIFY_CLIENT_SECRET`.

Scope requested by the app:

- `user-library-read`

## First production deploy checklist

1. Confirm the Worker is already deploying successfully from `.github/workflows/deploy-worker.yml`.
2. Create the Cloudflare Pages project.
3. Set the GitHub secrets and variables listed above.
4. Set the Worker production secrets in Cloudflare.
5. Configure Clerk, Google, and Spotify dashboards.
6. Attach `www.myzine.app` to the Pages project.
7. Push to `main` or run the `Deploy Web` workflow manually.

## Post-deploy verification

- Open `https://www.myzine.app/sign-in` and verify Clerk renders.
- Open `https://www.myzine.app/bookmarks` and confirm the app loads after authentication.
- Verify `https://api.myzine.app/health` returns a healthy production response.
- Test a YouTube connection.
- Test a Spotify connection.
- Test a Gmail connection.
- Confirm direct page loads on `/settings`, `/bookmarks`, and `/oauth/callback` do not 404.
