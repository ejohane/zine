# Mobile Design System Foundations

Last updated: February 22, 2026

## Scope

This document defines the foundation rules for mobile UI in `apps/mobile`.
Token source of truth is `apps/mobile/constants/theme.ts`.

## Theme Mode Policy

1. The app currently runs dark-only through `apps/mobile/hooks/use-color-scheme.ts`.
2. `Colors.light` remains for compatibility and transition safety.
3. New component work should target dark behavior first.
4. Any new light-mode behavior must be intentional and documented in the PR.

## Color Tokens

Use `Colors[scheme]` and semantic tokens before literal color values.

Core dark tokens:

- `text`
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

Specialized token groups:

- `ContentColors`: `podcast`, `video`, `article`, `post`
- `ProviderColors`: `youtube`, `spotify`, `gmail`, `substack`, `twitter`, `x`, `pocket`

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

Typography usage rules:

1. Use `Typography.*` tokens directly in style objects.
2. Keep `labelSmall` uppercase behavior unless the component explicitly opts out.
3. Do not introduce ad hoc font sizes in shared DS components unless there is a proven gap.

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

## Motion and Interaction Conventions

Current motion patterns across components:

- Press feedback opacity changes on `Pressable`.
- Spring-based press scaling in `home/pressable-scale.tsx` (legacy pattern).
- 200-300ms transition windows for media and state changes.

Motion rules:

1. Keep interaction feedback fast and predictable.
2. Prefer one motion axis at a time (opacity or scale, not both unless needed).
3. Avoid decorative motion in foundational primitives.

## Accessibility Baselines

1. Tap targets should be at least `44x44` where practical.
2. Text must remain readable over imagery and overlays.
3. Interactive controls should expose role and disabled state when relevant.
4. Status and empty/error states should provide descriptive copy, not icon-only signals.

## Implementation Checklist for New Components

1. Uses theme tokens for color, typography, spacing, and radius.
2. Avoids unscoped literals unless explicitly justified.
3. Supports realistic null and long-content states.
4. Includes Storybook stories per `docs/mobile/design-system/story-map.md`.
5. Added to `docs/mobile/design-system/components.md` with status and story priority.

## Known Gaps to Address

1. Introduce lint rules for hardcoded color literals in shared components.
2. Consolidate legacy template components (`themed-*`, `ui/*`) into either canonical or archived status.
3. Define shared motion tokens if animation usage expands beyond current patterns.
