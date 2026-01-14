---
name: sim-tap
description: Tap at coordinates or on a named element in the iOS simulator. Use when the user wants to interact with the app.
---

# Tap on iOS Simulator

Tap at specific coordinates or on a named element in the iOS simulator.

## Instructions

1. If coordinates are provided (two numbers), use MCP `ui_tap` directly
2. If an element name/description is provided:
   - First use `ui_describe_all` to find the element
   - Extract the element's coordinates
   - Then use `ui_tap` at those coordinates
3. Report success or failure

## Arguments

- `$ARGUMENTS` - Either: `<x> <y>` coordinates OR element description

## Example Usage

```
/sim-tap 200 300
/sim-tap Login button
/sim-tap Settings tab
```
