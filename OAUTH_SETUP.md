# OAuth Setup Guide

This guide will help you set up OAuth integration with Spotify and YouTube for the subscription features.

## Prerequisites

- Node.js and Bun installed
- Access to Spotify Developer Dashboard
- Access to Google Cloud Console

## Step 1: Create OAuth Applications

### Spotify Application

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click "Create an App"
3. Fill in app details:
   - **App name**: Zine Development (or your preferred name)
   - **App description**: Personal content aggregator
   - **Website**: http://localhost:3000 (for development)
4. In your app settings, add redirect URIs:
   - Development: `http://localhost:8787/api/v1/auth/spotify/callback`
   - Production: `https://api.myzine.app/api/v1/auth/spotify/callback`
5. Note down your **Client ID** and **Client Secret**

### YouTube Application

1. Go to [Google Cloud Console](https://console.developers.google.com)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3:
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Choose "Web application"
   - Add redirect URIs:
     - Development: `http://localhost:8787/api/v1/auth/youtube/callback`
     - Production: `https://api.myzine.app/api/v1/auth/youtube/callback`
5. Note down your **Client ID** and **Client Secret**

## Step 2: Configure Local Environment

1. Navigate to the API directory:
   ```bash
   cd packages/api
   ```

2. Copy the example environment file:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Edit `.dev.vars` with your OAuth credentials:
   ```
   # Clerk Authentication (get from Clerk dashboard)
   CLERK_SECRET_KEY=sk_test_your_actual_clerk_secret_key

   # OAuth Configuration
   API_BASE_URL=http://localhost:8787

   # Spotify OAuth
   SPOTIFY_CLIENT_ID=your_actual_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_actual_spotify_client_secret

   # YouTube OAuth
   YOUTUBE_CLIENT_ID=your_actual_youtube_client_id
   YOUTUBE_CLIENT_SECRET=your_actual_youtube_client_secret
   ```

## Step 3: Test the Setup

1. Start the development servers:
   ```bash
   # From the root directory
   turbo dev
   ```

2. Open your browser and navigate to:
   - Frontend: http://localhost:3000
   - API: http://localhost:8787

3. Sign in to the app and go to the "Accounts" page
4. Try connecting your Spotify and YouTube accounts

## Troubleshooting

### Common Issues

1. **Invalid redirect URI**: Make sure the redirect URIs in your OAuth applications match exactly with the environment variables.

2. **CORS errors**: Ensure your OAuth applications are configured with the correct origins.

3. **Authentication errors**: Verify your Client ID and Client Secret are correct and properly set in `.dev.vars`.

4. **Scope errors**: Make sure your OAuth applications have the required scopes:
   - Spotify: `user-read-playback-position`, `user-library-read`
   - YouTube: `https://www.googleapis.com/auth/youtube.readonly`

### Debug Steps

1. Check the browser console for JavaScript errors
2. Check the terminal where the API is running for server errors
3. Verify environment variables are loaded correctly:
   ```bash
   cd packages/api
   bun run dev
   # Check if OAuth endpoints are available at http://localhost:8787/api/v1/accounts
   ```

## Security Notes

- Never commit `.dev.vars` to git (it's already in `.gitignore`)
- Keep your Client Secrets secure
- Use environment variables for all sensitive configuration
- The OAuth implementation uses PKCE for additional security

## Production Deployment

For production deployment, you'll need to:

1. Add the OAuth credentials to your Cloudflare Workers environment
2. Update the redirect URIs in your OAuth applications to use your production domain
3. Configure the production environment variables in your CI/CD pipeline

See the main CLAUDE.md file for detailed deployment instructions.