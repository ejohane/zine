# Personal publications: product specification

Status: all eleven decisions agreed. Implementation details are in the accompanying
contracts and workstream briefs. This is the first-release scope, not a claim of
implemented behavior.

## 1. Ownership and identity

Each person has one publication containing their weekly and independent issues.
A distinct publication name is optional; the editor's identity is visible. The
publication has its own identity, description, and cover presentation. Subscriptions
follow this publication rather than requiring mutual friendship.

## 2. Issue types and lifecycle

Both types begin as private drafts and require explicit publication. Nothing
publishes automatically.

- Weekly issues start from a recap of a specific week. Before publication the editor
  selects, arranges, and edits freely. After publication corrections are allowed,
  but no new selections may be added.
- Independent issues can be created anytime and continue growing after publication.
  New selections become eligible for daily subscriber updates.

Both retain permanent shareable issue links and appear in the publication archive.
The public archive contains published issues, never drafts. Post-publication
removal/correction semantics are detailed as technical proposals in contracts.

## 3. Weekly boundary and timing

Weeks run from Sunday 00:00 inclusive to the next Sunday 00:00 exclusive in the
publisher's saved IANA timezone: Saturday night at midnight closes the week. Travel
does not automatically change this setting. Wrapped becomes available Sunday after
closure. Publishing is optional with no deadline; older recaps remain accessible
for later issue creation. Skipping leaves a private recap, not a public issue or
subscriber notification. Calendar boundaries must account for daylight saving.

## 4. Issue contents

Selections come from content already saved in Zine, across supported content types.
Direct link entry in the issue editor and standalone essays are out of scope.
Issues support a title, cover, optional introduction, optional selection commentary,
sections, and manual order. Weekly drafts may include older saved material beyond
that week's suggestions. Wrapped suggests candidates; it does not constrain the
editor's final selection to that week.

## 5. Audience and access

Publications and published issues are public. Anonymous readers can browse and read
issue metadata and commentary. Saving and subscribing require a Zine account.
Drafts and Wrapped are private. No unlisted issues, private publications, or
restricted sharing audiences in the first release. A link sent in a private chat
can be forwarded; the issue itself is public.

## 6. Original content and private sources

Issues display titles, author/source attribution, artwork, and curator commentary,
then link to originals. They do not republish stored article bodies, transcripts,
or private provider content. Paywalled content is allowed when publicly linkable;
the original source governs access. Private-only content is excluded. A newsletter
may be selected using its public web edition. Mere possession of a URL does not
prove it is safe for public sharing. Unavailable originals retain the selection and
commentary with an unavailable indicator when known; editors can remove or replace
according to the issue's mutation rules.

## 7. Subscriptions and connections

Subscriptions are one-way and need no approval or reciprocal subscription. They
cover the entire publication: weekly issues, independent issues, and eligible
updates. Readers can unsubscribe or mute notifications while staying subscribed.
Subscriber lists are visible only to the editor. No individual-issue subscription
controls initially.

## 8. Notifications and updates

Explicit publication triggers a new-issue notification. Additions to existing
independent issues are grouped into at most one daily update per publication per
subscriber, naming affected issues. Delivery is in the subscriber's morning and
timezone. Corrections, removals, and rearrangements do not notify. Returning readers
can identify selections added since their last visit. Delivery includes an in-app
activity inbox and optional push. Muting suppresses push but retains in-app activity.
Email delivery is excluded. No additions means no daily update.

## 9. Saving and discovery attribution

A saved selection becomes a regular Library bookmark with a link back to its
publication and issue, alongside original author/source attribution. Curator
commentary belongs to the discovery reference, separate from the reader's notes.
Saving already-owned content adds a discovery reference rather than a duplicate
bookmark. Multiple issue references are retained; show the first with access to the
others. Viewing alone does not create attribution. If an issue/publication disappears,
the bookmark and text attribution remain, without a link to an unavailable destination.

## 10. Wrapped evidence and editorial control

Wrapped draws from content saved or interacted with during the week, including older
bookmarks revisited that week. Distinguish saved, opened, and finished using reliable
signals. External player navigation proves only opening, not consumption/completion.
Use content highlights and patterns only where evidence supports them. Nothing is
preselected for publication. Users select candidates, then edit the ordinary issue
draft. Activity statistics remain private; only selected content and the editor's
writing appear in the public issue. An interacted-with item that is not saved must
be saved before it can become a selection, consistent with decision 4.

## 11. First release

The release includes publication identity/home/archive; the full issue editor and
both issue types; Weekly Wrapped; public web reading and iMessage previews; native
link opening; publication subscriptions/muting; in-app activity and push; daily
updates; and bookmark provenance. Staged implementation does not reduce this scope.

Beyond the exclusions above, comments, reactions, direct messaging, collaborative
editing, algorithmic discovery, and public activity statistics are deferred.

## Reader and editor journeys

- Editor selects saved public-linkable content, composes an independent issue,
  publishes explicitly, and shares the link through the system share sheet.
- Anonymous iMessage recipient sees a useful preview, opens a readable issue, and
  follows an original link without being forced to sign in.
- Recipient chooses Save or Subscribe, authenticates if needed, and returns to the
  intended action. The issue and selection identity survive the handoff.
- Subscriber receives a newly published weekly or independent issue; additions to
  independent issues appear in a daily batch and are marked on return.
- Sunday editor reviews a private recap, chooses nothing or some candidates,
  edits a weekly draft, and optionally publishes now or later.
