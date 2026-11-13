# Zine Next visual direction

A quiet, spacious reading room with one continuous vertical page. Health inspires
floating navigation and content hierarchy; it does not supply the subject matter.

## Header

Home, Podcasts, Articles, Videos, Posts: one SF Symbol and one label each. No
subtitles, counts, or supporting copy. Native Liquid Glass tiles float over the
page in a GlassEffectContainer. There is no opaque full-width header band.
Content can pass visibly underneath the controls as the page scrolls. Scope the
filter GlassEffectContainer inside its scroll viewport so offscreen glass cannot
cover the separately composed Save button.

Tap a filter or swipe the strip: left advances, right returns. Longer swipes can
cross several choices; selection changes request a single native selection tick.
The strip centers the chosen tile when a gesture ends so overflow remains usable.
Controls and the page's initial inset grow with Dynamic Type. At accessibility
sizes, a native selected-filter menu exposes all choices without shrinking text. Reduce Motion skips
centering animation. VoiceOver gets named selected buttons and scroll actions.

## Page rhythm

One mixed, vertically scrolling bento page combines the accepted tall-editorial
and paired-square compositions. Three equal base columns form a shared grid,
with a 14-point gap and 24-point corners. Articles occupy one column and three
half-square rows; podcasts occupy a square; videos span two columns and two
rows; posts occupy one column and one row. First-fit packing preserves all saves
and fills gaps, with VoiceOver ordered top-to-bottom, then left-to-right.

The first selection opens with a tall article and two square podcasts. Smaller
posts share the remaining spaces; wide videos and tall typographic articles
continue below. There are no separate format lanes or sidebar. Category filters
reuse the same format shapes. Compact widths and text larger than xxLarge use
self-sizing stacked cards so full titles remain readable.

Photography gets a local contrast scrim and white media text; ordinary text and
controls consume independent NextTheme semantic roles. Glass belongs to the
floating controls, not to reading surfaces. Flat-open Duo landscape is primary;
partial-fold transitions still need device validation.

## Verification boundary

Offscreen UIKit captures cover top, scrolled-under-header, and later-page states,
light/dark appearances, large text, and compact size. Native gesture tests are
separate from those captures. Physical haptic feel must be assessed on the phone.

Sample metadata and bundled thumbnails come from the local Zine dev snapshot. Saving a link is local and
does not imply extraction, syncing, or a finished backend.

## Contract-shaped additions

Preserve the floating format filters and mixed bento. Below that chrome, keep
search, collections and following as compact native utility actions. Lifecycle
and collection selection scope the same feed; inbox is not another competing
column. A quiet resume strip returns to an unfinished item.

Put source understanding, personal context, notes, coverage, annotations and
related saves in the item detail. Disclosure groups keep retained material and
availability secondary. Collections show a short synthesis with supporting
references. Search explains what matched. Sample semantics, source states and
retained passages are labeled as mock data; the UI never implies a live provider
poll, an AI run, or actual playback.
