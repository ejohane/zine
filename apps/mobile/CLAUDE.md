# Zine Mobile App - Claude Code Instructions

## Overview

Zine is an Expo/React Native mobile app for content aggregation and reading. Built with:

- **Framework**: Expo SDK 54 with React Native 0.81
- **Navigation**: Expo Router with typed routes
- **State**: TanStack Query + tRPC
- **Auth**: Clerk
- **Styling**: TailwindCSS via uniwind

**Bundle Identifier**: `app.zine.mobile`

## iOS Simulator Integration

This project has ios-simulator-mcp configured for visual debugging and testing.

### Available MCP Tools

| Tool                | Description                           |
| ------------------- | ------------------------------------- |
| `get_booted_sim_id` | Get active simulator ID               |
| `open_simulator`    | Launch iOS Simulator app              |
| `ui_tap`            | Tap at coordinates                    |
| `ui_type`           | Input text                            |
| `ui_swipe`          | Swipe gestures                        |
| `ui_describe_all`   | Get full accessibility tree           |
| `ui_describe_point` | Identify element at coordinates       |
| `ui_view`           | Compressed screenshot data            |
| `screenshot`        | Save screenshot to `apps/mobile/tmp/` |
| `record_video`      | Start screen recording                |
| `stop_recording`    | Stop recording                        |
| `install_app`       | Deploy .app or .ipa                   |
| `launch_app`        | Launch app by bundle ID               |

### ios-simulator-skill

Documentation lives at `.opencode/skill/ios-simulator-skill/SKILL.md`. The skill is installed at `~/.claude/skills/ios-simulator-skill/` and provides optimized scripts for simulator automation with significant token savings.

**Key Scripts**:

- `screen_mapper.py` - Map all UI elements (97.5% token reduction vs raw screenshots)
- `navigator.py` - Semantic element finding and interaction
- `simctl_boot.py` / `simctl_shutdown.py` - Simulator lifecycle
- `accessibility_audit.py` - Check accessibility compliance
- `build_and_test.py` - Build app and run tests

Use natural language for complex interactions:

- "Check what's on the current screen"
- "Find and tap the Settings tab"
- "Navigate to the subscriptions page"

### Slash Commands

Quick commands for simulator interaction:

| Command                   | Description                      |
| ------------------------- | -------------------------------- |
| `/project:sim:screenshot` | Take a screenshot                |
| `/project:sim:describe`   | Describe current screen elements |
| `/project:sim:tap`        | Tap at coordinates or element    |
| `/project:sim:launch`     | Launch the Zine app              |
| `/project:sim:help`       | Show all simulator commands      |

## Development Workflows

### Expo Go Only (Critical Constraint)

**IMPORTANT**: When testing or interacting with the iOS simulator, you MUST:

- **Only use Expo Go** - Never create development builds or custom native builds
- **Run in Expo Go mode** - Use `pnpm dev` which starts Metro for Expo Go
- **Never run EAS builds** - Do not use `eas build`, `pnpm build:ios:*`, or similar commands
- **Never install custom .ipa/.app files** - Only use the Expo Go app from the App Store

Expo Go provides a pre-built native runtime that loads JavaScript bundles over the network. This is sufficient for testing UI, navigation, and most app functionality.

### Running the App

```bash
# Start Metro bundler (from apps/mobile)
pnpm dev

# Or with specific port
METRO_PORT=8082 pnpm dev
```

Then open Expo Go on the simulator and scan the QR code or enter the URL shown in the terminal.

### Testing

```bash
# Run unit tests
pnpm test

# With coverage
pnpm test:coverage
```

### Linting

```bash
pnpm lint
```

## Project Structure

```
apps/mobile/
├── app/                    # Expo Router pages
│   ├── (auth)/            # Auth screens (sign-in, sign-up)
│   ├── (tabs)/            # Main tab navigation
│   ├── onboarding/        # Onboarding flow
│   ├── settings/          # Settings screens
│   └── subscriptions/     # Subscription management
├── components/            # Reusable components
│   ├── home/             # Home screen components
│   ├── icons/            # SVG icon components
│   └── ui/               # UI primitives
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and helpers
├── providers/            # Context providers
├── tmp/                  # Simulator screenshots/recordings
└── assets/               # Images and fonts
```

## Common Tasks

### Debugging UI Issues

1. Take a screenshot: Use `/project:sim:screenshot`
2. Describe elements: Use `/project:sim:describe` or ask "What's on the current screen?"
3. Inspect specific element: "Describe the element at coordinates 200, 400"

### Testing Navigation

1. Launch app: `/project:sim:launch`
2. Navigate semantically: "Tap the Explore tab"
3. Verify: "What screen am I on?"

### Accessibility Testing

Use the accessibility_audit.py skill:
"Run an accessibility audit on the current screen"
