# Zine Native Design System

This document defines the visual foundation for the canonical native iOS app in
`apps/ios`. The supported implementation is the semantic theme in
`ZineNative/Core/ZineTheme.swift`; update that implementation and its focused
tests whenever this contract changes.

## Color palette

Zine uses a cool, editorial palette with one restrained orange brand accent.
Views consume semantic roles rather than choosing colors directly so that the
same hierarchy works in light and dark appearances.

| Role                      | Light     | Dark      | Intended use                                                  |
| ------------------------- | --------- | --------- | ------------------------------------------------------------- |
| Canvas                    | `#F5F7F8` | `#000000` | Screen backgrounds beneath system navigation chrome           |
| Surface                   | `#FFFFFF` | `#14171A` | Cards, sheets, reader surfaces, and elevated regions          |
| Raised                    | `#E9EDF0` | `#20252A` | Placeholders, subdued controls, and elevated regions          |
| Primary text              | `#151719` | `#F5F7F8` | Titles, body copy, and primary icons                          |
| Reader body text          | `#151719` | `#D8DCE0` | Article body only; headings and controls retain primary text  |
| Secondary text            | `#5D646C` | `#B2BAC2` | Metadata, supporting copy, and inactive controls              |
| Border                    | `#CFD4DA` | `#343A40` | Dividers, outlines, and control boundaries                    |
| Brand accent              | `#EF661F` | `#EF661F` | Selection, primary actions, progress, and small brand moments |
| On accent                 | `#000000` | `#000000` | Text and icons placed directly on the brand accent            |
| Inline link               | `#B64012` | `#FFAD7C` | Links in reading and content surfaces                         |
| Bookmark description link | `#000000` | `#FFFFFF` | Un-underlined links in bookmark descriptions                  |

The Zine logo is a fixed brand asset and must not be recolored or redrawn when
the surrounding theme changes.

## Implementation rules

- Use `ZineTheme.canvas`, `surface`, `raised`, `primaryText`, `secondaryText`,
  `border`, `brandAccent`, `onAccent`, and `inlineLink` in SwiftUI views. Use
  `ZineTheme.tertiaryText` for de-emphasized metadata.
- Use `zineAppTheme()` at an app-level container and `zineScreenChrome()` for
  list-style screens when those modifiers fit the view structure.
- Keep navigation bars and tab bars system-managed. The navigation-bar
  background must remain hidden at both the scroll edge and the collapsed
  scroll position. SwiftUI's automatic background visibility must not own this
  state: UIKit shares the navigation bar across the stack, so an opaque
  scrolled background can otherwise crossfade above the outgoing destination
  during an interactive pop. Screen-owned semantic backgrounds provide visual
  continuity and compact-title readability without global UIKit appearance
  customization; those backdrops must remain in the screen's view hierarchy,
  beneath pushed destinations. Native floating controls may retain their
  system material; pushed destinations cover the intact tab shell instead of
  changing the tab bar's visibility state.
- Keep the shared `TabView` intact inside the app shell's outer
  `NavigationStack`. Pushed destinations cover that shell instead of toggling
  tab-bar visibility. During an interactive pop, the root screen and its tab
  bar are therefore uncovered together from the first frame; do not reintroduce
  navigation-depth or destination-level tab-bar visibility changes. Card and
  bookmark-row routes retain their matched `.zoom` transition; non-card routes
  use the standard stack transition. Bookmark detail owns its over-image back
  control inside the destination view and hides the system navigation bar, so
  the control is present in the matched transition's first frame instead of
  fading in as separate toolbar chrome. The transition style remains independent
  of navigation-bar background ownership and must not be removed as a workaround
  for interactive-pop chrome.
- Keep the root compact-title toolbar registered independently of navigation
  depth. The root entry explicitly requests a visible navigation bar; detail
  and reader entries own their hidden-bar preferences. Do not remove the root
  principal item while pushing a destination: it must survive returning to a
  scrolled list, including interactive swipe-back.
- Do not scatter raw hex, RGB, `Color.primary`, or `Color.secondary` values
  through supported native views. If the product needs a new reusable role,
  add it to `ZineTheme.Role`, define both appearances, and update
  `ZineThemeTests`.
- Keep orange restrained. It is for selection, actions, progress, links, and
  small brand moments—not card backgrounds, large decorative regions, or
  long-form reading surfaces.
- Keep the reading hierarchy neutral: body content uses surface and text roles,
  while links and narrow annotations may use the accent roles.
- When a list intentionally uses surface-backed rows, extend `surface` through
  its title, filters, empty space, navigation chrome, and tab-bar safe area so
  the screen reads as one continuous background. Keep canvas-backed lists on
  `canvas` throughout instead of mixing the two roles.
- Full-screen loading views must fill their container with the destination's
  semantic background. Loading, error, and empty rows inside a `List` must set
  the same `listRowBackground` as the surrounding content instead of falling
  back to a system background.
- Check both light and dark appearances. Preserve Dynamic Type, system control
  behavior, sufficient contrast, and non-color indicators for meaningful
  state.

## Intentional exceptions

Colors outside `ZineTheme` are acceptable when their meaning belongs to the
content or another established system rather than Zine's interface. Examples
include remote artwork, provider logos and provider-specific buttons, media
overlays that require black or white for contrast, and semantic success,
warning, or destructive feedback. Keep these exceptions local and do not use
them to create parallel app chrome or palette logic.

Third-party account UI may inherit its SDK or system appearance. Zine-owned
containers around it should still use the semantic palette where possible.

The media, article, and X post bookmark-detail proof of concept uses the contextual
`ZineTheme.ArtworkPalette` roles. It derives one dark tonal background from a
creator's avatar and uses that color continuously behind the artwork,
title, actions, and description. Its foreground, divider, and control roles are
derived for that surface. Articles and X posts without artwork begin with the
title and creator, without a placeholder hero. Articles flow directly into
their reading content below the header; X posts use a monochrome Open in X action. Both share the
same palette. Other non-media
details retain the standard semantic palette. Home article cards resume in the
same bookmark/content page at their saved reading position; ordinary bookmark
entries begin at the header. The article header offers a quiet Continue reading
row above the divider when an unfinished
article has progress that rounds above zero. A compact tonal pill sits close to
the divider and jumps to the saved text position with a heavy haptic. Its darker
background and compact caption distinguish it from the main action controls;
the touch target remains at least 44 points. Article text begins 32 points below
the divider.
This contextual treatment does not change the app-wide brand accent. Episodes with the same
creator avatar share a palette; missing or failed avatars use the neutral
fallback rather than the episode cover.

Creator pages use the same contextual avatar palette across their header,
provider action, saved and latest content lists, and empty states. Palette
extraction uses one fixed avatar image-processing size on both creator and
bookmark pages, so display size does not change the resulting colors.

The palette experiment balances colored pixel coverage with a modest saturation
preference. Bright, pale colors receive a gradual penalty rather than being
excluded; grayscale and very dark pixels still fall back to neutral. Colored
surfaces follow Zine's Appearance setting. Light uses the brighter tones at a
shared relative luminance of 0.075, with saturation between 0.50 and 0.80. Dark
uses the deeper tones at HSB brightness 0.22, with saturation between 0.32 and
0.72. System follows the device. Both variants retain the same creator hue;
changing appearance resolves the cached color without reloading the avatar.
White titles retain at least 7:1 contrast; secondary text and metadata retain
at least 4.5:1. Neutral fallback brightness remains unchanged. This applies to
bookmark details, creator pages, and their contextual article bodies.

Reading controls use one bottom bar, ordered bookmark, complete, tag,
appearance, then More. Share, original-source access, copy link, and article
links live in More. The bookmark header controls remain unchanged across
content types. Native back navigation stays in the same place when reader
controls are visible; immersive reading hides the controls together.
The bottom bar uses native regular, interactive Liquid Glass on iOS 26 and
later, with the existing solid capsule on earlier versions. Contextual reading
uses dark glass to maintain contrast with its light controls.

Tags, reader appearance, and article-link sheets use
`ZineTheme.ContentSheetPalette`: an opaque charcoal surface with a restrained
hint of the existing creator palette, lifted slightly above the page. White
primary actions use black text; supporting text, grouped controls, and separators
share sheet-specific semantic roles. Sheets keep native rounding, drag indicators,
and medium/large detents. Standalone reader sheets use neutral charcoal and do
not extract creator colors. System share sheets retain their native appearance.

## Verification

When changing a semantic role or applying the palette to a new screen:

1. Update or extend `ZineNativeTests/ZineThemeTests.swift` when token resolution
   changes.
2. Build and run the `ZineNative` scheme.
3. Inspect representative content, loading, empty, error, and selected states in
   both light and dark mode.
4. For changes that affect reading or saved content, verify Library, bookmark
   detail, and the article reader rather than checking navigation chrome alone.

Widget background customization is a user-controlled color exception. Saved
opaque sRGB colors are resolved through `ZineTheme.WidgetPalette`, with black or
white labels chosen by WCAG contrast. Custom-background cards inherit that
surface and foreground. Native settings retain the standard semantic app roles;
Clear/Tinted widget appearances defer to system rendering. Core widget color
tests cover contrast across a sampled sRGB cube and stable saved-color identities.

## Agent-composed Home

Home Lab uses `HomeView` with one persisted composition of real account-owned items.
Each section is a custom collection scoped to this page, not a permanent Library
collection. Publishing replaces the entire arrangement. Missing or empty
arrangements show a Home Lab empty state, without inserting regular Home sections.
Named collection headings open the current collection in a native list.
The seven card types are featured, landscape, cover, compact, tile, row and grid;
containers are single, horizontal, two-column and vertical. Implementations live
in `ZineNative/Features/Home/Components` and the existing Home view files.
`HomeComposedSectionView` reuses these actual cards and Home navigation routes.

Agents select item IDs, card types, container types and short section headings.
All titles, covers, authors, excerpts and metadata come from real items. Do not
use editorial story blocks or generate prose to fill the Home screen. The page
title, sans-serif typography, 16pt gutters, 18pt section spacing, neutral card
surfaces, Dynamic Type and interaction behavior remain owned by native Home.
See [the composition contract](../../docs/home-composition.md).

## Adaptive reading and browsing

Library and Search use system split navigation inside the shared tab shell,
retaining the selected bookmark when a window collapses. The tab bar spans the
whole window; Library’s Add Bookmark action lives in the shared top trailing
toolbar, matching Home’s Settings position. Home uses one continuous vertical feed at every size. Wide landscape windows
place the featured Jump Back In item beside its two-column tile grid within the
same section, followed by full-width Inbox and saved-content rails. Portrait
and compact windows stack the featured item and grid. Jump Back In keeps
its two-column, three-row tile grid, with one column at accessibility text sizes.

On iOS 27.1, active division reserved regions define a reading face and a
supplementary references face. Reader controls stay within the reading face in
book pose and on the stable lower face in seated pose. Article links remain
available through More at every size. Artwork is bounded by both the current
viewport width and height; wide detail headers can place artwork beside actions.
Expanded landscape bookmark details place artwork, title, metadata and actions
in the left column, with descriptions or article text in the right column. Both
columns share one scroll surface: gestures anywhere scroll the right-hand text,
while the left overview stays fixed. Short text does not require scrolling.
Media overviews anchor directly to the scroll viewport and do not rubber-band.
Expanded media and article scroll views hide the top-edge effect; no horizontal
blur or fade strip overlays the artwork or text. Native trailing controls remain visible.
The expanded page extends through the navigation bar's changing top safe area,
with a fixed 32-point overview gutter, so collapsing chrome cannot move the overview.
Artwork can fill the column's inner width, bounded by 52 percent of its height.
Narrow detail panes retain the sequential layout.
No layout checks identify a device model or infer pose from physical orientation.

Expanded content details use a cover-led composition: bounded artwork, centered
title and creator, quiet provider metadata, and one pill-shaped primary action
flanked by bookmark and completion controls. Share and More use the native
trailing toolbar; Edit tags remains available in More. Articles offer Read or
Continue reading into the right column of the shared scrolling page. Artwork-derived palette
resolution stays unchanged, and compact details keep the sequential layout.

Portrait article reading fills the window across a division. Reader immersion
hides the surrounding navigation and tab chrome and temporarily collapses the
Library sidebar; revealing controls restores its previous visibility. This is
a reading-state exception to the stable tab shell, not a push-depth toggle.
Use the whole window's aspect ratio so narrow landscape detail columns do not
trigger portrait immersion or oscillate as the sidebar expands and collapses.

Reader immersion is sent to the owning shell through an environment action,
with a separate lifetime token for each reader. Do not carry it through a
PreferenceKey: nested navigation containers can stop that preference before
it reaches the TabView. Apply Library/Search tab-bar visibility to their tab
content so the native tab container receives the request.

Bookmark detail content scrolls beneath the transparent navigation bar. Its
artwork-derived background continues through the top safe area; do not overlay
an opaque navigation backdrop that masks the scrolling article or description.
Library’s Add Bookmark toolbar action is shown only while browsing its list.
