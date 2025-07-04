# Deployment Setup Guide

This guide explains how to set up automated deployment of the Zine web app to Cloudflare Pages using GitHub Actions.

## Required GitHub Secrets

Before the deployment workflow can run, you need to add the following secrets to your GitHub repository:

### 1. CLOUDFLARE_API_TOKEN

Create a Cloudflare API token with the following permissions:
- **Account**: `Cloudflare Pages:Edit`
- **Zone**: `Zone:Read` (if using custom domain)
- **Account**: `Account:Read`

To create the token:
1. Go to [Cloudflare Dashboard > My Profile > API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use "Custom token" template
4. Set the permissions listed above
5. Add your account in the "Account Resources" section
6. Click "Continue to Summary" and "Create Token"
7. Copy the token and add it to GitHub repository secrets as `CLOUDFLARE_API_TOKEN`

### 2. CLOUDFLARE_ACCOUNT_ID

Find your Cloudflare Account ID:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. In the right sidebar, you'll see your Account ID
3. Copy this ID and add it to GitHub repository secrets as `CLOUDFLARE_ACCOUNT_ID`

## Workflow Overview

The GitHub Actions workflow (`.github/workflows/deploy-web.yml`) is triggered by:

### Production Deployments
- **Trigger**: Push to `main` branch
- **Target**: Production environment (`zine-web-production`)
- **URL**: Your production domain or `zine-web.pages.dev`

### Preview Deployments
- **Trigger**: Pull requests to `main` branch
- **Target**: Preview environment
- **URL**: Unique preview URL (e.g., `https://abc12345.zine-web.pages.dev`)
- **Feature**: Automatic PR comment with preview link

## Workflow Steps

1. **Checkout**: Gets the latest code
2. **Setup Bun**: Installs Bun package manager
3. **Install dependencies**: Runs `bun install --frozen-lockfile`
4. **Type check**: Ensures TypeScript compilation
5. **Lint**: Checks code quality
6. **Build**: Creates production build in `apps/web/dist`
7. **Deploy**: Uploads to Cloudflare Pages using Wrangler

## Path-based Triggering

The workflow only runs when changes are made to:
- `apps/web/**` - Web app source code
- `packages/shared/**` - Shared packages that affect the web app
- `package.json` - Root package configuration
- `bun.lockb` - Dependency lock file
- `turbo.json` - Turborepo configuration

This ensures efficient CI/CD by only deploying when relevant files change.

## Cloudflare Pages Project Setup

Make sure your Cloudflare Pages project is configured correctly:

1. **Project Name**: `zine-web` (matches `wrangler.toml`)
2. **Production Branch**: `main`
3. **Build Configuration**: 
   - Build command: Not needed (handled by GitHub Actions)
   - Build output directory: `dist`
   - Root directory: `apps/web`

## Environment Variables

If your web app needs environment variables:

1. Add them to Cloudflare Pages dashboard:
   - Go to your Pages project
   - Navigate to Settings > Environment variables
   - Add variables for both Production and Preview environments

2. Reference them in your Vite config or React app as usual:
   ```typescript
   // Vite automatically exposes VITE_ prefixed env vars
   const apiUrl = import.meta.env.VITE_API_URL
   ```

## Troubleshooting

### Common Issues

1. **"API token is invalid"**
   - Check that your `CLOUDFLARE_API_TOKEN` has the correct permissions
   - Ensure the token hasn't expired

2. **"Account ID not found"**
   - Verify your `CLOUDFLARE_ACCOUNT_ID` is correct
   - Make sure the API token has access to the account

3. **"Project not found"**
   - Create the Cloudflare Pages project manually first
   - Ensure the project name matches your `wrangler.toml`

4. **Build failures**
   - Check the GitHub Actions logs for specific error messages
   - Ensure all dependencies are properly defined in `package.json`
   - Verify TypeScript compilation passes locally

### Useful Commands for Local Testing

```bash
# Test the build locally
bun build --filter=@zine/web

# Preview the built app
cd apps/web && bun preview

# Test Cloudflare Pages deployment locally
cd apps/web && bun deploy
```

## Security Notes

- API tokens are securely stored as GitHub secrets
- Never commit API tokens or account IDs to your repository
- The workflow only runs on your repository, triggered by your code changes
- Preview deployments are automatically cleaned up by Cloudflare Pages

## Monitoring Deployments

You can monitor deployments in:
- **GitHub Actions**: See workflow runs and logs
- **Cloudflare Dashboard**: View deployment history and analytics
- **Pull Request Comments**: Preview links for PR deployments