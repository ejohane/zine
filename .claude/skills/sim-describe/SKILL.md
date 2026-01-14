---
name: sim-describe
description: Describe UI elements on the iOS simulator screen. Use when the user wants to see what's on screen or find a specific element.
---

# Describe iOS Simulator Screen

Get a description of all UI elements currently visible on the iOS simulator screen.

## Instructions

1. Use the MCP `ui_describe_all` tool to get the accessibility tree
2. Parse the response and present a concise summary of:
   - Main screen/view name if identifiable
   - Key interactive elements (buttons, inputs, tabs)
   - Current state (loading, error, content displayed)
3. If an element query is provided, focus on finding that specific element

## Arguments

- `$ARGUMENTS` - Optional: element to search for (e.g., "login button", "email input")

## Example Usage

```
/sim-describe
/sim-describe settings button
```
