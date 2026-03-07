# Zine Mobile App - AI Agent Instructions

## Overview

Generic instructions for AI agents working on the Zine mobile app. These instructions work with any MCP-compatible AI tool (Claude Code, Cursor, VS Code, Zed, etc.).

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

## Design System Rules

Before editing shared UI in `apps/mobile/components`, read:

- `docs/mobile/design-system/principles.md`
- `docs/mobile/design-system/foundations.md`
- `docs/mobile/design-system/components.md`
- `docs/mobile/design-system/story-map.md`

Non-negotiable rules for shared mobile UI:

- Use `useAppTheme()` and semantic theme tokens for shared components.
- Prefer `@/components/primitives` (`Badge`, `Button`, `IconButton`, `Surface`, `Text`) before writing new shared press, text, or container styles.
- Prefer canonical components before adding a new shared variant or surface.
- Do not add new raw hex/rgb colors in tracked shared components unless the line or the line above it includes `design-system-exception:` with a short reason.
- Do not add ad hoc `fontSize`, `lineHeight`, or `letterSpacing` values in tracked shared components unless the line or the line above it includes `design-system-exception:` with a short reason.
- Do not add new imports from legacy UI paths: `components/home/*`, `components/themed-*`, `components/ui/*`.
- New canonical shared components must ship with Storybook coverage and update the design-system docs when scope changes.

Validation command:

```bash
bun run design-system:check
```

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
bun run dev           # Start Metro with Expo Go
```

Then open Expo Go on the simulator and scan the QR code or enter the URL.

### Testing

```bash
bun run test          # Run unit tests
bun run lint          # Run ESLint
bun run design-system:check
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

1. **Document remaining work** - Capture any follow-up work in your handoff
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Review git state** - Make sure only the intended changes are staged or committed
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
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
