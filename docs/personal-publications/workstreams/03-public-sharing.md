# Workstream 3: public sharing and iMessage

## Assignment

Make a shared issue a complete anonymous reading experience in the existing web and
Worker architecture. Treat iMessage as the first sharing environment; standard URLs
and share metadata must also serve WhatsApp and other chat apps.

## Deliverables

- Mobile-first public publication home/archive and issue pages with cover, sections,
  commentary, original-source links, editor identity, Save, and Subscribe.
- Stable canonical issue/publication URLs; server-delivered title/description/image
  metadata for unfurlers without requiring JavaScript or authentication.
- Public-safe preview artwork with fallback, cache invalidation on corrections and
  unavailable destinations, and no draft previews.
- Universal-link association configuration coordinated with iOS entitlements,
  published through the chosen existing hosting/domain deployment.
- Anonymous-to-auth Save/Subscribe continuation retaining issue/selection identity;
  graceful web behavior when the native app is absent.
- Web accessibility/component/Storybook coverage as applicable and public-preview
  integration checks. Follow existing web semantic tokens and wrappers.

## Boundaries

Do not build another authenticated mobile client, expose private Library details,
republish full source content, or make installation a requirement for reading.
Do not launch external deployments as part of this planning assignment; identify
configuration needs for the implementation/release owner.

## Acceptance

Logged-out readers can read both issue types and follow originals. Draft lookup and
preview requests leak nothing. Save/Subscribe reaches the correct action after login.
Published issue title, cover, and magazine identity appear in a real iMessage link
preview on phone, and forwarding preserves the link. Installed native app opens the
same issue; web remains usable without installation. Browser/Open Graph inspection
is necessary but not sufficient proof of the real iMessage result.

## Handoff

Deliver URL/association-file contract, public renderer/metadata fixtures, deployment
configuration needs, and native/auth continuation details. Record actual preview and
phone behavior separately from automated web checks.
