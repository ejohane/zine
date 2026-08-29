# Zine Native Design System

This document defines the visual foundation for the canonical native iOS app in
`apps/ios`. The supported implementation is the semantic theme in
`ZineNative/Core/ZineTheme.swift`; update that implementation and its focused
tests whenever this contract changes.

## Color palette

Zine uses a cool, editorial palette with one restrained orange brand accent.
Views consume semantic roles rather than choosing colors directly so that the
same hierarchy works in light and dark appearances.

| Role           | Light     | Dark      | Intended use                                                  |
| -------------- | --------- | --------- | ------------------------------------------------------------- |
| Canvas         | `#F5F7F8` | `#000000` | Screen backgrounds beneath system navigation chrome           |
| Surface        | `#FFFFFF` | `#14171A` | Cards, sheets, reader surfaces, and elevated regions          |
| Raised         | `#E9EDF0` | `#20252A` | Placeholders, subdued controls, and elevated regions          |
| Primary text   | `#151719` | `#F5F7F8` | Titles, body copy, and primary icons                          |
| Secondary text | `#5D646C` | `#B2BAC2` | Metadata, supporting copy, and inactive controls              |
| Border         | `#CFD4DA` | `#343A40` | Dividers, outlines, and control boundaries                    |
| Brand accent   | `#EF661F` | `#EF661F` | Selection, primary actions, progress, and small brand moments |
| On accent      | `#000000` | `#000000` | Text and icons placed directly on the brand accent            |
| Inline link    | `#B64012` | `#FFAD7C` | Links in reading and content surfaces                         |

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

## Verification

When changing a semantic role or applying the palette to a new screen:

1. Update or extend `ZineNativeTests/ZineThemeTests.swift` when token resolution
   changes.
2. Build and run the `ZineNative` scheme.
3. Inspect representative content, loading, empty, error, and selected states in
   both light and dark mode.
4. For changes that affect reading or saved content, verify Library, bookmark
   detail, and the article reader rather than checking navigation chrome alone.
