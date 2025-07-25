# Fix: Missing Clerk Publishable Key in Production

## Issue
Production deployment is failing with error:
```
index-DjBu6LDZ.js:68 Uncaught Error: Missing Publishable Key
```

## Root Cause
The production environment variable `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` is not set in GitHub repository secrets.

## Solution

### Step 1: Add GitHub Repository Secrets

You need to add the following secrets to your GitHub repository:

1. Go to your repository: `https://github.com/ejohane/zine`
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add the following repository secrets:

#### Required Clerk Secrets:
- **`VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION`**
  - Value: Your Clerk production publishable key (starts with `pk_live_`)
  - This is used for main branch deployments

- **`VITE_CLERK_PUBLISHABLE_KEY_DEV`** (if not already set)
  - Value: Your Clerk development publishable key (starts with `pk_test_`)
  - This is used for pull request preview deployments

#### Backend API Secrets (should already be set):
- **`CLERK_SECRET_KEY_PRODUCTION`**: Production secret key for API
- **`CLERK_SECRET_KEY_DEV`**: Development secret key for API

### Step 2: Get Your Clerk Keys

1. Visit your Clerk Dashboard: https://dashboard.clerk.com/
2. Select your application
3. Go to **API Keys** section
4. Copy the following keys:
   - **Production Publishable Key** (pk_live_xxx) → Use for `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION`
   - **Development Publishable Key** (pk_test_xxx) → Use for `VITE_CLERK_PUBLISHABLE_KEY_DEV`

### Step 3: Alternative Quick Fix

If you want to use a single environment variable for all environments, you can:

1. Set **`VITE_CLERK_PUBLISHABLE_KEY`** in GitHub secrets
2. Use your production publishable key as the value
3. The code will automatically use this as a fallback

### Step 4: Verify the Fix

1. Push a new commit to the main branch (or merge a PR)
2. Check the GitHub Actions deployment log
3. Look for successful build output without the "Missing Publishable Key" error
4. Verify that the production site loads without authentication errors

## How the Environment Variable Selection Works

The application uses this priority order:

1. **Production**: `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION` (when `import.meta.env.PROD` is true)
2. **Fallback**: `VITE_CLERK_PUBLISHABLE_KEY` (generic variable)
3. **Development**: `VITE_CLERK_PUBLISHABLE_KEY_DEV` (for local development)

## GitHub Actions Workflow Context

Your deployment workflow (`.github/workflows/deploy.yml`) is configured to:

- **Production builds** (main branch): Use `VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION`
- **Preview builds** (pull requests): Use `VITE_CLERK_PUBLISHABLE_KEY_DEV`

The workflow creates environment files during build:
```yaml
# Production build
echo "VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION=$VITE_CLERK_PUBLISHABLE_KEY_PRODUCTION" > .env.production
bunx dotenv-cli -e .env.production -- bun run build
```

## Testing the Fix

After adding the secrets:

1. Create a small commit and push to main branch
2. Monitor the GitHub Actions workflow
3. Check that the build completes successfully
4. Verify the production site loads with authentication working

## Debugging

If you're still getting errors, check the GitHub Actions build logs for:
- Environment variable setup steps
- Build process output
- Any remaining authentication-related errors

The code now includes debug logging in development mode that will show which environment variables are available.