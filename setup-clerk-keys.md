# Quick Clerk Setup Instructions

## Step 1: Get Your Keys from Clerk Dashboard

After creating your Clerk application with email authentication:

1. Copy your **Publishable Key** (starts with `pk_test_`)
2. Copy your **Secret Key** (starts with `sk_test_`)

## Step 2: Update Environment Files

**Frontend** - Edit `apps/web/.env.local`:
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_actual_key_here
```

**Backend** - Edit `packages/api/.dev.vars`:
```bash
CLERK_SECRET_KEY=sk_test_your_actual_key_here
```

Note: `.dev.vars` is the secure way to handle secrets in Wrangler development - it's already in .gitignore so won't be committed.

## Step 3: Configure Clerk Dashboard

In your Clerk dashboard:

1. **Paths** section:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up` 
   - After sign-in URL: `/`
   - After sign-up URL: `/`

2. **Domains** section:
   - Add: `http://localhost:3000`

## Step 4: Test the Setup

Run the development servers:
```bash
turbo dev
```

Then visit http://localhost:3000 - you should be redirected to sign in!

## What to Expect

1. Visit http://localhost:3000
2. You'll be redirected to the sign-in page
3. Click "Don't have an account? Sign up" 
4. Enter email and password to create account
5. After sign-up, you'll be redirected to the main app
6. You should see an empty bookmark collection (since you're a new user)
7. Try saving a bookmark to test the authentication flow

## Troubleshooting

- **"Missing Clerk publishable key" error**: Check your .env.local file
- **Authentication failed**: Verify your secret key in wrangler.toml
- **CORS errors**: Make sure you added http://localhost:3000 to Clerk domains