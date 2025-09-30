# How to Add YouTube API Key for Local Development

Since you already have OAuth credentials set up, you're already in the Google Cloud Console. You just need to create an API key:

## Steps to Get YouTube API Key:

1. **Go to Google Cloud Console**
   - https://console.cloud.google.com
   - Select your existing project (the one with YouTube OAuth)

2. **Create API Key**
   - Go to "APIs & Services" → "Credentials"
   - Click "+ CREATE CREDENTIALS" → "API key"
   - Copy the generated API key

3. **Restrict the API Key (Optional but Recommended)**
   - Click on the new API key to edit it
   - Under "Application restrictions":
     - For local dev: "None" or "IP addresses" (127.0.0.1)
   - Under "API restrictions":
     - Select "Restrict key"
     - Choose "YouTube Data API v3"
   - Click "Save"

4. **Add to .dev.vars**
   ```bash
   cd packages/api
   echo "YOUTUBE_API_KEY=your_api_key_here" >> .dev.vars
   ```

5. **Restart the API server**
   ```bash
   # Kill existing
   lsof -ti:8787 | xargs kill -9 2>/dev/null || true
   
   # Restart
   cd packages/api && bun run dev
   ```

## Why You Need This

- **OAuth tokens (CLIENT_ID/SECRET)** require user login and tokens stored in Durable Objects
- **API Key** works directly without user authentication
- **Durable Objects don't work in local dev** (`wrangler dev --local`)
- **Solution**: Use API key for local development

## Test It

Once you've added the API key:

```bash
# The test script will now work
AUTH_TOKEN="your_clerk_token" ./test-local-youtube-save.sh
```

You should see in the logs:
```
[DualModeTokenService] 🔑 YOUTUBE_API_KEY found in environment!
[ApiEnrichment] Using API key authentication
[ApiEnrichment] Channel thumbnails: [URLs shown here]
```

## Note

The API key approach is ONLY for local development. In production on Cloudflare, the OAuth flow with Durable Objects works properly.