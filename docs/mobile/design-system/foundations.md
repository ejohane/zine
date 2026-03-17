# Mobile Design System Foundations

Last updated: March 7, 2026

## Scope

This document defines the foundation rules for mobile UI in `apps/mobile`.
Token source of truth is `apps/mobile/constants/theme.ts`.
Shared theme access should go through `apps/mobile/hooks/use-app-theme.ts`.
Product taste and composition guidance lives in `docs/mobile/design-system/principles.md`.

## Theme Mode Policy

1. The app currently runs dark-only through `apps/mobile/hooks/use-color-scheme.ts`.
2. `Colors.light` remains for compatibility and transition safety.
3. New component work should target dark behavior first.
4. Any new light-mode behavior must be intentional and documented in the PR.

## Color Tokens

Use `Colors[scheme]` and semantic tokens before literal color values.

Core dark tokens:

- `text`
- `textSubheader`
- `textSecondary`
- `textTertiary`
- `background`
- `backgroundSecondary`
- `backgroundTertiary`
- `primary`
- `primaryLight`
- `primaryDark`
- `border`
- `card`
- `success`
- `warning`
- `error`

Semantic aliases for new shared component work:

- Text: `textPrimary`, `textSubheader`, `textSecondary`, `textTertiary`, `textInverse`
- Surface: `surfaceCanvas`, `surfaceSubtle`, `surfaceElevated`, `surfaceRaised`
- Accent: `accent`, `accentMuted`, `accentForeground`
- Border: `borderDefault`, `borderSubtle`
- Status: `statusSuccess`, `statusWarning`, `statusError`, `statusInfo`, `statusWarningForeground`
- Status surfaces: `statusSuccessSurface`, `statusWarningSurface`, `statusErrorSurface`, `statusInfoSurface`
- Overlays: `overlaySoft`, `overlayStrong`, `overlayHeavy`, `overlayScrim`
- Overlay text: `overlayForeground`, `overlayForegroundMuted`, `overlayForegroundSubtle`

Specialized token groups:

- `ContentColors`: `podcast`, `video`, `article`, `post`
- `ProviderColors`: `youtube`, `spotify`, `gmail`, `substack`, `twitter`, `x`, `pocket`, `web`

Color usage rules:

1. Prefer semantic tokens over raw hex values.
2. Raw color literals are allowed only for overlays, media badges, and platform-imposed values.
3. If a literal color is required, add a short code comment explaining why.
4. Avoid introducing new brand shades directly inside component files.

## Typography Tokens

Typography scale groups:

- Display: `displayLarge`, `displayMedium`
- Headline: `headlineLarge`, `headlineMedium`, `headlineSmall`
- Title: `titleLarge`, `titleMedium`, `titleSmall`
- Body: `bodyLarge`, `bodyMedium`, `bodySmall`
- Label: `labelLarge`, `labelMedium`, `labelSmall`
- Alternate label: `labelSmallPlain`

Typography usage rules:

1. Use `Typography.*` tokens directly in style objects.
2. Keep `labelSmall` uppercase behavior unless the component explicitly opts out.
3. Do not introduce ad hoc font sizes in shared DS components unless there is a proven gap.
4. If a component needs a new text role repeatedly, add a token before reusing the literal.

## Spacing, Radius, and Shadows

Spacing scale (`4px` base):

- `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`, `5xl`

Radius scale:

- `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `full`

Shadow scale:

- `Shadows.sm`
- `Shadows.md`
- `Shadows.lg`

Layout usage rules:

1. Use spacing tokens for padding, margin, and gaps.
2. Use radius tokens for all shared card, chip, and button corners.
3. Use defined shadow tokens instead of custom shadow stacks.
4. Favor `gap` for row/column spacing where supported.

## Icon and Glyph Sizes

Use `IconSizes.*` for emoji, initials, and glyph-only text treatments in shared components.

- `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`

## Motion and Interaction Conventions

Current motion patterns across components:

- Press feedback opacity changes on `Pressable`.
- Spring-based press scaling in `home/pressable-scale.tsx` (legacy pattern).
- 200-300ms transition windows for media and state changes.

Motion token source:

- `Motion.duration.fast`
- `Motion.duration.normal`
- `Motion.duration.slow`
- `Motion.opacity.pressed`
- `Motion.opacity.subdued`
- `Motion.scale.pressed`
- `Motion.scale.subtle`

Motion rules:

1. Keep interaction feedback fast and predictable.
2. Prefer one motion axis at a time (opacity or scale, not both unless needed).
3. Avoid decorative motion in foundational primitives.
4. Use `Motion.*` tokens before introducing literal durations or press opacity values.

## Automated Guardrails

Run `bun run design-system:check` from the repo root before landing shared mobile UI.

The checker currently enforces:

1. No new raw color literals in tracked mobile shared components.
2. No new ad hoc typography literals in tracked mobile shared components.
3. Storybook story presence for tracked mobile shared components.
4. No imports from legacy component paths in tracked mobile shared components.

If a literal or legacy dependency is intentional and temporary, annotate the line or the line above it with `design-system-exception:` and a short reason.

## Foundation Freeze Rules

1. Shared components should read theme values via `useAppTheme()` instead of passing `colors` props through multiple layers.
2. New shared components should prefer semantic aliases (`surface*`, `text*`, `accent*`) over legacy low-level names (`background*`, `buttonPrimary*`) when either works.
3. New raw color literals in `apps/mobile/components` require a short justification comment or should be moved into `theme.ts`.
4. New literal font sizes or line heights in canonical components require a proven typography gap and a follow-up token decision.
5. If a new shared component introduces repeated layout or state values, promote them into a foundation token instead of duplicating them.

## Accessibility Baselines

1. Tap targets should be at least `44x44` where practical.
2. Text must remain readable over imagery and overlays.
3. Interactive controls should expose role and disabled state when relevant.
4. Status and empty/error states should provide descriptive copy, not icon-only signals.

## Implementation Checklist for New Components

1. Uses theme tokens for color, typography, spacing, and radius.
2. Uses `useAppTheme()` for shared theme access or a documented theme override.
3. Prefers `apps/mobile/components/primitives/text.tsx`, `surface.tsx`, `badge.tsx`, `button.tsx`, and `icon-button.tsx` before adding local button/text/container patterns.
4. Avoids unscoped literals unless explicitly justified.
5. Supports realistic null and long-content states.
6. Includes Storybook stories per `docs/mobile/design-system/story-map.md`.
7. Added to `docs/mobile/design-system/components.md` with status and story priority.

## Known Gaps to Address

1. Introduce lint rules for hardcoded color literals in shared components.
2. Consolidate legacy template components (`themed-*`, `ui/*`) into either canonical or archived status.
3. Migrate canonical components from low-level color names to semantic aliases.
4. Introduce lint rules for ad hoc typography values in shared components.
