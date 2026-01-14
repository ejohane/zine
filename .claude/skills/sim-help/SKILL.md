---
name: sim-help
description: Display help for all available iOS simulator slash commands and MCP tools.
---

# iOS Simulator Commands Help

Display help for all available iOS simulator slash commands.

## Available Commands

| Command                           | Description                | Example                 |
| --------------------------------- | -------------------------- | ----------------------- |
| `/sim-screenshot [name]`          | Take a screenshot          | `/sim-screenshot login` |
| `/sim-describe [element]`         | Describe screen elements   | `/sim-describe`         |
| `/sim-tap <x> <y>` or `<element>` | Tap coordinates or element | `/sim-tap Login button` |
| `/sim-launch [bundle-id]`         | Launch the Zine app        | `/sim-launch`           |
| `/sim-help`                       | Show this help             | `/sim-help`             |

## MCP Tools Reference

These commands use the ios-simulator-mcp server which provides:

- `get_booted_sim_id` - Get active simulator ID
- `open_simulator` - Launch Simulator app
- `ui_tap` - Tap at coordinates
- `ui_type` - Input text
- `ui_swipe` - Swipe gestures
- `ui_describe_all` - Full accessibility tree
- `ui_describe_point` - Element at coordinates
- `screenshot` - Save screenshot
- `launch_app` - Launch app by bundle ID

## Natural Language Alternative

You can also interact with the simulator using natural language:

- "Take a screenshot of the current screen"
- "What's on the screen right now?"
- "Tap the Settings tab"
- "Navigate to the subscriptions page"

## Prerequisites

Ensure the MCP server is configured in your Claude Code settings. See `apps/mobile/AGENTS.md` for setup instructions.
