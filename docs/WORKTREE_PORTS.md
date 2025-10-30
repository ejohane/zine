# Worktree Port Management

This document explains how port assignments work for multiple worktree development environments.

## Overview

Each worktree gets a unique set of ports based on a deterministic hash of the branch name. This allows you to run multiple development environments simultaneously without port conflicts.

## Port Calculation

- **Main branch**: Always uses default ports (offset = 0)
- **Worktrees**: Port offset = `(hash(branch_name) % 90 + 1) * 10`
  - This gives offsets from 10 to 900 in increments of 10
  - Example: `feed-init-fix` might get offset 200, so API runs on port 8987

## Port Assignments

Each environment uses these base ports + offset:

| Service | Base Port | Example (offset 350) |
|---------|-----------|----------------------|
| API (Wrangler) | 8787 | 9137 |
| Web (Vite) | 3000 | 3350 |
| Expo Metro | 8081 | 8431 |
| Expo Dev Server | 19000 | 19350 |

## Configuration Files

### `.env.worktree`
Created automatically by `scripts/setup-worktree-env.sh`. Contains:
```bash
PORT_OFFSET=350
```

This file is:
- Generated when you run `setup-branch-worktree.sh`
- Read by all dev servers to determine their ports
- Ignored by git (add to `.gitignore`)

## How It Works

### 1. API (Wrangler)
**File**: `packages/api/package.json`

The dev script sources `.env.worktree` and calculates the port:
```bash
source ../../.env.worktree 2>/dev/null || true
PORT=$((8787 + ${PORT_OFFSET:-0}))
wrangler dev --port $PORT
```

### 2. Web (Vite)
**File**: `apps/web/vite.config.ts`

Reads `.env.worktree` at config time:
```typescript
const envWorktree = readFileSync('.env.worktree', 'utf-8')
const portOffset = parseInt(match[1], 10)
const webPort = 3000 + portOffset
const apiPort = 8787 + portOffset
```

The API proxy is automatically configured to use the correct API port.

### 3. Mobile (Expo)
**Files**: 
- `apps/mobile/metro.config.js` - Metro bundler port
- `apps/mobile/lib/api.ts` - API client URL
- `apps/mobile/package.json` - Exports PORT_OFFSET env var

Metro reads `.env.worktree`:
```javascript
const portOffset = parseInt(envWorktree.match(/PORT_OFFSET=(\d+)/)[1], 10)
config.server.port = 8081 + portOffset
```

The API client calculates the correct port:
```typescript
const apiPort = 8787 + parseInt(process.env.PORT_OFFSET || '0', 10)
```

## Usage

### View Port Assignments
```bash
./scripts/show-worktree-ports.sh
```

Output:
```
=== Worktree Port Assignments ===

Main branch (zine)
  API (Wrangler):    8787
  Web (Vite):        3000
  Expo Metro:        8081
  Expo Dev Server:   19000

Branch: ports-per-env (offset: 350)
  API (Wrangler):    9137
  Web (Vite):        3350
  Expo Metro:        8431
  Expo Dev Server:   19350
  ✓ API server running
```

### Setup New Worktree
```bash
./scripts/setup-branch-worktree.sh my-feature
```

This automatically:
1. Creates the git worktree
2. Calculates and assigns port offset
3. Creates `.env.worktree`
4. Syncs database and env vars
5. Installs dependencies

### Start Development
```bash
cd .branches/my-feature
bun dev  # Starts all servers on unique ports
```

### For Main Branch

To ensure the main branch uses default ports, create `.env.worktree` in the root:

```bash
# In /Users/erikjohansson/dev/2025/zine/.env.worktree
PORT_OFFSET=0
```

## Troubleshooting

### Ports Still Conflict
1. Check `.env.worktree` exists in each worktree
2. Verify `PORT_OFFSET` is set correctly
3. Run `./scripts/show-worktree-ports.sh` to see assignments
4. Check for processes using ports: `lsof -i :8787`

### Mobile App Can't Connect to API
1. Ensure you're using the correct API URL
2. For simulators: localhost should work automatically
3. For physical devices: Set `EXPO_PUBLIC_TAILSCALE_API_URL` in `.env.development`
4. Check the console logs - API URL is logged on startup

### Web App Can't Connect to API
1. Vite proxy should automatically use correct port
2. Check `apps/web/vite.config.ts` is reading `.env.worktree`
3. Restart Vite dev server after changing ports

## Adding to .gitignore

Add this to your root `.gitignore`:
```
# Worktree port configuration
.env.worktree
```

## Future Improvements

- [ ] Add port conflict detection
- [ ] Support manual port assignment via config file
- [ ] Add health check to verify all services are running
- [ ] Integrate with tmux for automatic session management
