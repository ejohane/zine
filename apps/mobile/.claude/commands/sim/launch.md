# Launch Zine App in Simulator

Launch the Zine mobile app in the iOS simulator.

## Instructions

1. First check if a simulator is booted using `get_booted_sim_id`
2. If no simulator is running, boot one using `open_simulator`
3. Launch the Zine app using bundle ID `app.zine.mobile`
4. Wait for app to launch and report status

## Default Bundle ID

`app.zine.mobile`

## Arguments

- `$ARGUMENTS` - Optional: alternative bundle ID to launch

## Example Usage

```
/project:sim:launch
/project:sim:launch com.other.app
```
