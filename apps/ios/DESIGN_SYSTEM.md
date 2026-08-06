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
| Canvas         | `#F5F7F8` | `#000000` | Screen backgrounds and navigation chrome                      |
| Surface        | `#FFFFFF` | `#14171A` | Cards, sheets, reader surfaces, and tab chrome                |
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
- Do not scatter raw hex, RGB, `Color.primary`, or `Color.secondary` values
  through supported native views. If the product needs a new reusable role,
  add it to `ZineTheme.Role`, define both appearances, and update
  `ZineThemeTests`.
- Keep orange restrained. It is for selection, actions, progress, links, and
  small brand moments—not card backgrounds, large decorative regions, or
  long-form reading surfaces.
- Keep the reading hierarchy neutral: body content uses surface and text roles,
  while links and narrow annotations may use the accent roles.
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
