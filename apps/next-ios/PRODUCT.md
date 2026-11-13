# Zine Next

## Platform

ios

## Purpose

A fresh interpretation of Zine as a place to save content and return to it.
This app may eventually replace the current app, but must develop independently.

## Confirmed constraints

- Standalone app, identifier, icon, navigation, components, state, and models.
- The intended backend is the independent `apps/api` service and `/v1` contract.
  The current capability preview uses local fixtures; no live API auth or transport.
- First pass uses a curated bundled snapshot of local Zine development metadata
  and thumbnail artwork, with independent local storage only.
- Health inspires design and UX, never health features or content.
- Open iPhone Duo landscape is the primary experience.
- Top sections: Home, Podcasts, Articles, Videos, Posts. Scrub/tap the strip to
  select; haptic ticks on changes. Page content never pages horizontally.

## Open decisions

Final name, client authentication, syncing, playback, and migration remain future
experience work. The service capabilities are documented in API_CAPABILITIES.md. “Zine Next” is a working name.
