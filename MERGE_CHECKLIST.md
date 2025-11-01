# Merge Checklist for fix-ios-sim Branch

## Changes in This Branch

### Code Changes (Will be committed to git)

1. **`apps/mobile/lib/api.ts`** - Enhanced API URL detection:
   - Fixed `getApiPort()` to use `EXPO_PUBLIC_PORT_OFFSET` instead of `PORT_OFFSET`
   - Added comprehensive debug logging for troubleshooting
   - Improved device detection logging (simulator vs physical device)
   - Better error logging for port replacement failures

2. **`apps/mobile/package.json`** - Added workspace root flag:
   - Added `EXPO_NO_METRO_WORKSPACE_ROOT=1` to all expo commands
   - Ensures Expo uses correct workspace root in monorepo worktrees

3. **`scripts/setup-worktree-env.sh`** - Auto-inject PORT_OFFSET:
   - Added Step 4 to update `.env.development` with calculated `PORT_OFFSET`
   - Ensures mobile app always has correct port configuration

4. **`scripts/sync-env-to-worktrees.sh`** - Sync PORT_OFFSET:
   - Updates `.env.development` in worktrees with their unique `PORT_OFFSET`
   - Ensures consistency when syncing env files from main

### Documentation (New files to commit)

- `ENV_FIX_README.md` - Comprehensive troubleshooting guide
- `FIX_MAIN_ENV.sh` - Script to fix main worktree's environment files

## What Will NOT Be Committed (gitignored files)

These files were fixed in the branch but need manual fixing in main:

1. **`apps/mobile/.env.local`**:
   - Fixed IP address from `192.168.86.41` to `192.168.86.26`
   - Removed port from `EXPO_PUBLIC_TAILSCALE_API_URL` (now calculated dynamically)
   - Removed `EXPO_PUBLIC_API_URL` override

2. **`apps/mobile/.env.development`**:
   - Set `EXPO_PUBLIC_PORT_OFFSET=450` (specific to this branch)
   - Main should have `EXPO_PUBLIC_PORT_OFFSET=0`

## Steps to Merge Back to Main

### 1. Commit and Push Branch Changes

```bash
cd /Users/erikjohansson/dev/2025/zine/.branches/fix-ios-sim

# Review changes
git diff

# Stage changes (exclude the fix script, keep the README)
git add apps/mobile/lib/api.ts
git add apps/mobile/package.json
git add scripts/setup-worktree-env.sh
git add scripts/sync-env-to-worktrees.sh
git add ENV_FIX_README.md

# Commit
git commit -m "fix(mobile): improve iOS Simulator API connection and worktree port handling

- Fix API port detection to use EXPO_PUBLIC_PORT_OFFSET
- Add comprehensive debug logging for device/simulator detection
- Auto-inject PORT_OFFSET into mobile .env.development via worktree scripts
- Add EXPO_NO_METRO_WORKSPACE_ROOT=1 for proper monorepo support
- Document environment setup and troubleshooting"

# Push
git push origin fix-ios-sim
```

### 2. Merge to Main

```bash
cd /Users/erikjohansson/dev/2025/zine
git checkout main
git merge fix-ios-sim
```

### 3. Fix Main Worktree Environment Files (CRITICAL!)

Run the fix script:
```bash
cd /Users/erikjohansson/dev/2025/zine
./FIX_MAIN_ENV.sh
```

Or manually update:
- `apps/mobile/.env.local` - Remove port, fix IP
- `apps/mobile/.env.development` - Set `PORT_OFFSET=0`, remove `EXPO_PUBLIC_API_URL`

### 4. Sync to Existing Worktrees

After fixing main, sync to all worktrees:
```bash
cd /Users/erikjohansson/dev/2025/zine
./scripts/sync-env-to-worktrees.sh
```

### 5. Test Main Worktree

```bash
cd /Users/erikjohansson/dev/2025/zine
bun dev

# In another terminal
curl http://localhost:8787/health
```

The mobile app should connect to `http://localhost:8787` (no offset).

### 6. Test Branch Worktrees

For any existing branch worktrees:
```bash
cd /Users/erikjohansson/dev/2025/zine/.branches/<branch-name>
bun dev

# Check the calculated port in logs, then test
curl http://localhost:<calculated-port>/health
```

### 7. Clean Up Fix Script

After verifying everything works, you can remove the temporary fix script:
```bash
rm /Users/erikjohansson/dev/2025/zine/FIX_MAIN_ENV.sh
```

## Verification Checklist

After merging and fixing main worktree:

- [ ] Main worktree `.env.local` has correct IP without port
- [ ] Main worktree `.env.development` has `PORT_OFFSET=0`
- [ ] Main worktree mobile app connects to `http://localhost:8787`
- [ ] Branch worktrees receive updated env files via sync script
- [ ] Branch worktrees have their own `PORT_OFFSET` calculated
- [ ] iOS Simulator shows "✅ Using localhost for iOS Simulator" in logs
- [ ] No "Network request timed out" errors in simulator
- [ ] API `/health` endpoint responds successfully

## Future Worktrees

For any new branch worktrees created after this merge:

```bash
cd /Users/erikjohansson/dev/2025/zine
./scripts/setup-branch-worktree.sh <new-branch-name>
```

The setup script will automatically:
1. Calculate a unique `PORT_OFFSET` based on branch name
2. Create `.env.worktree` with port configuration
3. Sync environment files from main (including fixed `.env.local`)
4. Inject `PORT_OFFSET` into `.env.development`

Everything should "just work" without manual intervention.

## Troubleshooting

If you still see connection issues after merging:

1. **Check debug logs**: Look for "🔍 Device Detection" logs to see what the app detects
2. **Verify IP**: Run `ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1`
3. **Check API server**: `ps aux | grep wrangler` and `lsof -i :8787`
4. **Re-run sync**: `./scripts/sync-env-to-worktrees.sh` to propagate fixes

See `ENV_FIX_README.md` for detailed troubleshooting steps.
