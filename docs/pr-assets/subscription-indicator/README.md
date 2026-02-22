# Subscription Indicator Screenshots

Captured from iOS Simulator (iPhone 17 Pro Max):

- `inbox-after.png` – app launch state (splash/loading)
- `inbox-after-2.png` – authenticated gate (sign-in screen)

## Verification status

The reconnect-indicator UI is implemented and unit-tested, but visual verification of the Inbox indicator is currently blocked because the simulator session is at the authentication screen and no test account/session is available in this run.

Once signed in, capture and add:

- `inbox-indicator-visible.png` (dot visible when connection status is EXPIRED/REVOKED)
- `inbox-indicator-hidden.png` (dot hidden when all connections are ACTIVE)
