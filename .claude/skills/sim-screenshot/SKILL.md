---
name: sim-screenshot
description: Take a screenshot of the iOS simulator and save it to apps/mobile/tmp/. Use when the user wants to capture the current screen.
---

# Take iOS Simulator Screenshot

Take a screenshot of the currently booted iOS simulator and save it to `apps/mobile/tmp/`.

## Instructions

1. Use the MCP `screenshot` tool to capture the current simulator screen
2. Save with a descriptive filename including timestamp if no name provided
3. Report the file path when complete

## Arguments

- `$ARGUMENTS` - Optional: custom filename (without extension)

## Example Usage

```
/sim-screenshot
/sim-screenshot login-screen
```
