---
name: sim-launch
description: Launch the Zine mobile app in the iOS simulator. Use when starting the app or switching to a different app.
---

# Launch Zine App in Simulator

Launch the Zine mobile app in the iOS simulator.

## Critical: Expo Go Only

**You MUST use Expo Go** - Never create development builds or install custom .ipa/.app files.

To test the Zine app:

1. Ensure Metro is running (`pnpm dev` in apps/mobile)
2. Open Expo Go on the simulator
3. Load the app via the Expo Go interface (QR code or URL)

Do NOT use `launch_app` with `app.zine.mobile` - this is for development builds only.

## Instructions

1. First check if a simulator is booted using `get_booted_sim_id`
2. If no simulator is running, boot one using `open_simulator`
3. Open Expo Go using bundle ID `host.exp.Exponent`
4. Direct the user to load the app in Expo Go via the dev server URL

## Default Bundle ID

`app.zine.mobile`

## Arguments

- `$ARGUMENTS` - Optional: alternative bundle ID to launch

## Example Usage

```
/sim-launch
/sim-launch com.other.app
```
