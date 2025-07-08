# Authentication Setup Guide

This guide explains how to set up Clerk authentication for the Zine application.

## Prerequisites

- A Clerk account (free tier available)
- Clerk application configured with desired authentication providers

## Step 1: Create Clerk Application

1. Go to [Clerk Dashboard](https://dashboard.clerk.com/)
2. Create a new application
3. Choose your authentication providers:
   - Email/Password
   - Google OAuth
   - Apple OAuth (optional)
4. Note down your publishable key and secret key

## Step 2: Configure Environment Variables

### Frontend Configuration

Create `apps/web/.env.local`:
```bash
# Copy from .env.local.example
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
```

### Backend Configuration

For development, add to `packages/api/wrangler.toml`:
```toml
[vars]
CLERK_SECRET_KEY = "sk_test_your_secret_key_here"
```

For production, use Wrangler secrets:
```bash
cd packages/api
wrangler secret put CLERK_SECRET_KEY --env production
```

## Step 3: Configure Database

The users table and foreign key constraints are already set up in the schema. You need to run the migrations:

```bash
cd packages/api
bun run db:generate
bun run db:migrate
```

## Step 4: Configure Clerk Dashboard

### Redirect URLs
Set the following redirect URLs in your Clerk dashboard:

**Development:**
- Sign-in redirect URL: `http://localhost:3000/`
- Sign-up redirect URL: `http://localhost:3000/`
- After sign-out URL: `http://localhost:3000/sign-in`

**Production:**
- Sign-in redirect URL: `https://myzine.app/`
- Sign-up redirect URL: `https://myzine.app/`
- After sign-out URL: `https://myzine.app/sign-in`

### CORS Settings
Add the following domains to your Clerk CORS allowlist:
- Development: `http://localhost:3000`
- Production: `https://myzine.app`

## Step 5: User Data Management

When users sign up, they will automatically get isolated bookmark collections. The system will:

1. Verify JWT tokens on all API requests
2. Associate all bookmarks with the authenticated user's ID
3. Ensure users can only access their own data
4. Provide user profile information in the UI

## Security Features

- **JWT Verification**: All API endpoints verify Clerk JWTs
- **User Isolation**: Database-level user data separation
- **Route Protection**: Frontend routes require authentication
- **Secure Headers**: Proper CORS and security headers configured

## Testing Authentication

1. Start the development servers:
   ```bash
   turbo dev
   ```

2. Visit `http://localhost:3000`
3. You should be redirected to sign in
4. After signing in, you should see an empty bookmark collection
5. Create a bookmark to test user-scoped functionality

## Troubleshooting

**Token Verification Fails:**
- Check that CLERK_SECRET_KEY is set correctly
- Verify the publishable key matches your Clerk application

**Redirect Issues:**
- Ensure redirect URLs are configured in Clerk dashboard
- Check that CORS domains are properly set

**Database Errors:**
- Run database migrations to ensure user table exists
- Check that foreign key constraints are properly set up