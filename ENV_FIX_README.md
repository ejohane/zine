# Environment Configuration Fix for iOS Simulator

## Problem Summary

The iOS Simulator was failing to connect to the API server with "Network request timed out" errors. The root cause was incorrect IP address configuration in `.env.local` files.

## Root Causes

1. **Hardcoded incorrect IP in `.env.local`**: The file had `http://192.168.86.41:8787` but the Mac's actual IP is `192.168.86.26`
2. **Port included in `EXPO_PUBLIC_TAILSCALE_API_URL`**: The port should be calculated dynamically from `PORT_OFFSET`, not hardcoded
3. **Hardcoded `EXPO_PUBLIC_API_URL` in `.env.development`**: This prevented automatic detection of simulator vs physical device

## Solution

### Changes Made to Branch Worktree

1. **Updated `.env.local`**:
   - Removed `EXPO_PUBLIC_API_URL` override to allow automatic detection
   - Fixed `EXPO_PUBLIC_TAILSCALE_API_URL` to use correct IP without port
   - Port is now calculated from `PORT_OFFSET` in `.env.development`

2. **Added debug logging to `apps/mobile/lib/api.ts`**:
   - Shows device detection: `Constants.isDevice` value
   - Shows whether simulator or physical device logic is used
   - Helps troubleshoot connection issues

### How It Works

The `apps/mobile/lib/api.ts` file determines the API URL as follows:

1. **iOS Simulator**: Uses `http://localhost:${apiPort}` (detected via `Constants.isDevice === false`)
2. **Physical iOS Device**: Uses `EXPO_PUBLIC_TAILSCALE_API_URL` with port from `PORT_OFFSET`
3. **Port Calculation**: `apiPort = 8787 + PORT_OFFSET`
   - Main worktree: `PORT_OFFSET=0` → port `8787`
   - Branch worktree: `PORT_OFFSET=450` → port `9237`

## What Needs to Be Done After Merging

Since `.env.local` and `.env.development` are **gitignored** (not tracked in version control), you need to manually fix the main worktree after merging:

### Option 1: Run the Fix Script (Recommended)

```bash
cd /Users/erikjohansson/dev/2025/zine
./FIX_MAIN_ENV.sh
```

This script will:
- Detect your Mac's current IP address
- Update `.env.local` with the correct IP (without port)
- Update `.env.development` to remove hardcoded values
- Create backups of the original files

### Option 2: Manual Fix

1. **Edit `/Users/erikjohansson/dev/2025/zine/apps/mobile/.env.local`**:
   ```bash
   # Clerk Authentication
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_Z3Jvd2luZy1maWxseS00NS5jbGVyay5hY2NvdW50cy5kZXYk

   # API Configuration
   # Leave EXPO_PUBLIC_API_URL unset for automatic detection

   # For physical devices - NO PORT, it will be calculated
   EXPO_PUBLIC_TAILSCALE_API_URL=http://192.168.86.26
   ```

2. **Edit `/Users/erikjohansson/dev/2025/zine/apps/mobile/.env.development`**:
   ```bash
   # Development environment variables
   # EXPO_PUBLIC_API_URL=http://localhost:8787
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
   EXPO_PUBLIC_TAILSCALE_API_URL=http://100.90.89.84
   EXPO_PUBLIC_PORT_OFFSET=0
   ```
   
   Make sure to:
   - Remove any `EXPO_PUBLIC_API_URL=` line (should be commented out)
   - Set `EXPO_PUBLIC_PORT_OFFSET=0` for main worktree

## Worktree Setup Process

When you run `scripts/setup-branch-worktree.sh <branch-name>`, it:

1. Creates a git worktree in `.branches/<branch-name>`
2. Runs `setup-worktree-env.sh` which:
   - Calculates a unique `PORT_OFFSET` based on branch name hash
   - Creates `.env.worktree` with port configuration
   - Runs `sync-env-to-worktrees.sh` to copy env files from main
   - Updates `.env.development` with the calculated `PORT_OFFSET`

### Environment File Sync

The `sync-env-to-worktrees.sh` script copies these files from main to worktrees:
- `packages/api/.dev.vars`
- `packages/api/.env`
- `packages/api/local.db*`
- `apps/web/.env.local`
- **`apps/mobile/.env.local`** ← This is why fixing main is important!
- `apps/mobile/.env.development`
- `apps/mobile/.env.preview`
- `apps/mobile/.env.production`

After copying, it updates `.env.development` with the worktree's `PORT_OFFSET`.

## Testing

After fixing the main worktree and setting up a new branch worktree:

1. **Verify API server is running**: `curl http://localhost:<port>/health`
   - Main: `curl http://localhost:8787/health`
   - Branch: `curl http://localhost:9237/health` (or whatever PORT_OFFSET calculates)

2. **Check iOS Simulator connection**:
   - Start the app: `bun dev`
   - Look for these logs:
     ```
     🔍 Device Detection: Constants.isDevice = false, isSimulator = true
     ✅ Using localhost for iOS Simulator
     🔗 API URL: http://localhost:9237
     ```

3. **Check physical device connection**:
   - Should see:
     ```
     🔍 Device Detection: Constants.isDevice = true, isSimulator = false
     📱 Physical iOS device detected, using network IP
     🔄 Replaced port in http://192.168.86.26 → http://192.168.86.26:9237
     🔗 API URL: http://192.168.86.26:9237
     ```

## Important Notes

- **`.env.local` is machine-specific**: Each developer needs their own with their Mac's IP
- **`.env.development` contains defaults**: Shared configuration that applies to all worktrees
- **PORT_OFFSET is auto-calculated**: No need to manually manage ports for different branches
- **Main worktree uses port 8787**: Always uses base ports (PORT_OFFSET=0)
- **Branch worktrees use unique ports**: Determined by branch name hash to avoid conflicts

## Troubleshooting

### "Network request timed out"

1. Check API server is running: `ps aux | grep wrangler`
2. Verify port: `lsof -i :<port>` or `netstat -an | grep <port>`
3. Test connectivity: `curl http://localhost:<port>/health`
4. Check device detection logs in app

### Wrong IP Address

1. Find your Mac's IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`
2. Update `.env.local` in main worktree
3. Run `sync-env-to-worktrees.sh` to propagate to branches

### Port Conflicts

1. Check `.env.worktree` for PORT_OFFSET
2. Verify calculated port isn't in use: `lsof -i :<calculated-port>`
3. If conflict, delete worktree and recreate (gets new hash/offset)
