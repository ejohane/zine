# Mobile App Environment Variables Setup

## Overview

The mobile app uses environment variables for configuration across different environments (development, preview, production). These are loaded using `dotenv-cli` for local builds and referenced in `eas.json` for EAS builds.

## Environment Files

- `.env.development` - Local development environment
- `.env.preview` - Preview/staging environment  
- `.env.production` - Production environment
- `.env.example` - Example template (committed to git)

## Required Environment Variables

```bash
# API URL for the backend
EXPO_PUBLIC_API_URL=https://api.myzine.app

# Clerk authentication publishable key
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_key_here

# Optional: Tailscale API URL for local development
EXPO_PUBLIC_TAILSCALE_API_URL=http://100.90.89.84:8787
```

## Setup Instructions

1. **Copy the example file** to create your environment files:
   ```bash
   cp .env.example .env.development
   cp .env.example .env.preview
   cp .env.example .env.production
   ```

2. **Fill in your environment-specific values** in each file.

3. **Never commit these files** to git (they're already in `.gitignore`).

## Usage

### Development

All development scripts automatically load `.env.development`:

```bash
# Start development server
bun run dev

# Run on iOS simulator
bun run ios

# Run on Android emulator
bun run android
```

### Building for Different Environments

The build scripts automatically load the appropriate environment file:

```bash
# Build for iOS
bun run build:ios:development  # Uses .env.development
bun run build:ios:preview      # Uses .env.preview
bun run build:ios:production   # Uses .env.production

# Build for Android
bun run build:android:development  # Uses .env.development
bun run build:android:preview      # Uses .env.preview
bun run build:android:production   # Uses .env.production
```

## Local vs Cloud Builds

### Local Builds (with `--local` flag)
- Environment variables are loaded from local `.env` files
- Uses `dotenv-cli` to inject variables before building
- Good for development and testing

### Cloud Builds (EAS)
- Environment variables come from EAS Secrets
- Set secrets using: `eas secret:create --scope project --name VARIABLE_NAME`
- List secrets using: `eas secret:list`

## Technical Details

1. **Package.json scripts** use `dotenv-cli` to load environment files:
   ```json
   "build:ios:preview": "dotenv -e .env.preview -- eas build ..."
   ```

2. **eas.json** defines which variables to include in builds:
   ```json
   "env": {
     "EXPO_PUBLIC_API_URL": "EXPO_PUBLIC_API_URL",
     "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY": "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"
   }
   ```

3. **In your code**, access variables via `process.env`:
   ```typescript
   const apiUrl = process.env.EXPO_PUBLIC_API_URL;
   ```

## Security Notes

- Only use the `EXPO_PUBLIC_` prefix for variables that are safe to expose client-side
- Never commit actual keys or secrets to git
- Use EAS Secrets for production builds
- Keep `.env.example` updated with all required variables (but with placeholder values)