# Zine Mobile App - AI Agent Instructions

## Overview

Generic instructions for AI agents working on the Zine mobile app. These instructions work with any MCP-compatible AI tool (Claude Code, Cursor, VS Code, Zed, etc.).

## Project Tracking

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## iOS Simulator Integration

### MCP Server Configuration

To enable iOS simulator interaction, add this to your MCP configuration:

```json
{
  "mcpServers": {
    "ios-simulator": {
      "command": "npx",
      "args": ["-y", "ios-simulator-mcp"],
      "env": {
        "IOS_SIMULATOR_MCP_DEFAULT_OUTPUT_DIR": "./apps/mobile/tmp"
      }
    }
  }
}
```

### Configuration by Tool

| Tool        | Config Location           |
| ----------- | ------------------------- |
| Claude Code | `~/.claude/settings.json` |
| Cursor      | `~/.cursor/mcp.json`      |
| VS Code     | `.vscode/mcp.json`        |
| Zed         | `~/.config/zed/mcp.json`  |

### Prerequisites

1. **IDB (iOS Development Bridge)**:

   ```bash
   brew install idb-companion
   pip3 install fb-idb
   ```

2. **Xcode with iOS simulators**:

   ```bash
   xcode-select --install
   ```

3. **Node.js** (for MCP server):
   ```bash
   node --version  # Any recent version
   ```

### Available MCP Tools

| Tool                | Description                     |
| ------------------- | ------------------------------- |
| `get_booted_sim_id` | Get active simulator ID         |
| `open_simulator`    | Launch iOS Simulator app        |
| `ui_tap`            | Tap at coordinates              |
| `ui_type`           | Input text                      |
| `ui_swipe`          | Swipe gestures                  |
| `ui_describe_all`   | Get full accessibility tree     |
| `ui_describe_point` | Identify element at coordinates |
| `ui_view`           | Compressed screenshot data      |
| `screenshot`        | Save screenshot to file         |
| `record_video`      | Start screen recording          |
| `stop_recording`    | Stop recording                  |
| `install_app`       | Deploy .app or .ipa             |
| `launch_app`        | Launch app by bundle ID         |

### Tool Invocation Example

```json
{
  "tool": "screenshot",
  "arguments": {
    "filename": "test-screenshot.png"
  }
}
```

## Tech Stack

- **Framework**: Expo SDK 54, React Native 0.81
- **Navigation**: Expo Router (typed routes)
- **State**: TanStack Query + tRPC
- **Auth**: Clerk
- **Styling**: TailwindCSS via uniwind
- **Bundle ID**: `app.zine.mobile`

## Development Workflows

### Expo Go Only (Critical Constraint)

**IMPORTANT**: When testing or interacting with the iOS simulator, agents MUST:

- **Only use Expo Go** - Never create development builds or custom native builds
- **Run in Expo Go mode** - Use `pnpm dev` which starts Metro for Expo Go
- **Never run EAS builds** - Do not use `eas build`, `pnpm build:ios:*`, or similar commands
- **Never install custom .ipa/.app files** - Only use the Expo Go app from the App Store

Expo Go provides a pre-built native runtime that loads JavaScript bundles over the network. This is sufficient for testing UI, navigation, and most app functionality.

### Running the App

```bash
cd apps/mobile
pnpm dev           # Start Metro with Expo Go
```

Then open Expo Go on the simulator and scan the QR code or enter the URL.

### Testing

```bash
pnpm test          # Run unit tests
pnpm lint          # Run ESLint
```

## Project Structure

```
apps/mobile/
├── app/                    # Expo Router pages
│   ├── (auth)/            # Auth screens
│   ├── (tabs)/            # Main tab navigation
│   ├── onboarding/        # Onboarding flow
│   ├── settings/          # Settings screens
│   └── subscriptions/     # Subscription management
├── components/            # Reusable components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities and helpers
├── providers/             # Context providers
├── tmp/                   # Simulator screenshots/recordings
└── assets/                # Images and fonts
```

## Landing the Plane (Session Completion)

**When ending a work session**, complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
