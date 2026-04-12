# Web Design System Guide

Last updated: April 11, 2026

## Purpose

This document explains how the web design system currently works in this repo, how to use it when building product UI, and how to contribute changes without fragmenting the component language.

The short version:

- The source of truth is not a single React component folder.
- Shared visual semantics live in `packages/design-system`.
- Web-specific primitives and wrappers live in `apps/web`.
- Storybook is the primary visual reference for the browser channel.
- The browser UI should feel like the same editorial product as mobile, not a separate design language.

## Product Direction

The browser channel is intentionally:

- dark-first
- editorial rather than decorative
- dense enough for serious reading without feeling cramped
- mostly monochrome, with color used as metadata and state
- consistent with the mobile token baseline unless there is a strong platform-specific reason not to be

When a design decision is ambiguous, favor readability, hierarchy, and reuse over novelty.

## Architecture

The web design system is layered. Each layer has a different job.

### 1. Shared foundations

`packages/design-system/src/foundations.ts`

This is the baseline token layer.

It defines:

- semantic color roles through `Colors`
- typography scales through `Typography`
- spacing through `Spacing`
- corner radii through `Radius`
- motion timing and feedback through `Motion`
- content/provider metadata palettes through `ContentColors`, `ProviderColors`, and `FilterChipPalette`

These tokens are deliberately aligned with the mobile baseline. The current package tests explicitly protect that alignment.

### 2. Shared component contracts

`packages/design-system/src/primitives.ts`

This layer defines the supported API surface for core primitives.

Examples:

- `ButtonSpec`
- `BadgeSpec`
- `SurfaceSpec`
- `FilterChipSpec`
- `TextSpec`

If the team wants a new shared tone, size, or variant, this is where the contract should usually be introduced first.

### 3. Shared recipes

`packages/design-system/src/recipes.ts`

This layer translates tokens and specs into usable values.

Examples:

- `getButtonPalette()`
- `getButtonMetrics()`
- `getBadgePalette()`
- `getSurfaceBackgroundColor()`
- `getSurfaceBorderColor()`
- `getFilterChipPalette()`

This is the layer that answers questions like:

- what is the border color for an error surface?
- how tall is a medium button?
- what foreground should a selected article filter chip use?

If a rule should be shared across platforms or across multiple web components, prefer putting it here instead of re-encoding it in React components.

### 4. Web theme adapter

`packages/design-system/src/web/theme.ts`

`packages/design-system/src/web/theme.css`

This layer maps the shared token system into browser-friendly CSS variables and Tailwind theme values.

In practice it does two jobs:

- creates semantic CSS custom properties such as `--background`, `--text-subheader`, `--surface-raised`, and `--filter-chip-article-accent`
- exposes those values to Tailwind 4 through `@theme inline`

This means the browser channel can use the same shared token definitions through either:

- direct TypeScript imports from `@zine/design-system`
- semantic CSS variables in `apps/web/src/styles.css`
- Tailwind utility classes that resolve to those variables

### 5. Web primitives

`apps/web/src/components/ui/*`

This is the low-level React implementation layer for the web app.

Current examples:

- `button.tsx`
- `badge.tsx`
- `filter-chip.tsx`
- `card.tsx`

These primitives are not the source of truth for design semantics. They are adapters that read from the shared package and render browser UI.

The repo still carries some shadcn-style structure here, and `apps/web/components.json` exists for generator compatibility, but that file is scaffolding configuration, not the design-system authority.

### 6. App-facing wrappers and composites

`apps/web/src/components.tsx`

`apps/web/src/components/item-card.tsx`

This layer is what most product code should consume.

It does things like:

- normalize legacy props onto the current primitive API
- expose `Surface`, `Button`, `Badge`, `PageHeader`, `StatCard`, and `EmptyState`
- compose dense product-ready structures like `ItemCard`

If you are building page UI in `apps/web/src`, start here before reaching for raw primitive files.

### 7. Storybook references

`apps/web/src/storybook/*`

Storybook is the main visual contract for the web design system.

The taxonomy currently reflects the intended structure:

- `Foundations/*` for principles and token references
- `Primitives/*` for shared building blocks
- `Cards/*` for reusable card patterns
- `Layout/*` for full-page surface references

If a new shared primitive, card, or surface pattern is added, Storybook should show it.

### 8. Shared fixtures and tests

`packages/design-system/src/fixtures/item-card.ts`

`packages/design-system/test/design-system.test.ts`

Fixtures keep stories realistic and consistent across surfaces. Tests protect the shared token baseline and recipe behavior.

## How To Use It

Use the highest-level layer that solves the problem cleanly.

### For product pages and feature UI

Prefer app-facing wrappers and composites from `apps/web/src/components.tsx` and nearby feature components.

Reach for:

- `Button` instead of styling a raw button from scratch
- `Badge` instead of inventing a new status pill
- `Surface` instead of creating one-off dark panels
- `ItemCard` or `ItemCardView` instead of rebuilding content cards

### For low-level shared controls

Use `apps/web/src/components/ui/*` when you are implementing or extending a primitive itself, not when you just need a product surface.

### For spacing, type, and color

Prefer semantic tokens over literals.

Good:

- `Typography.headlineSmall`
- `Radius.lg`
- `getSurfaceBackgroundColor(Colors.dark, 'elevated')`
- `var(--text-subheader)`
- `border-border`

Avoid:

- new raw hex values in shared UI
- one-off font sizes in shared components
- ad hoc corner radii that do not map to `Radius`
- custom status colors when the system already has success, warning, error, or info roles

### For typography in React styles

Use `typographyStyle()` with `Typography.*` tokens when inline style composition is the clearest option.

This is already the pattern used by shared web components such as `ItemCard` and `HomePage`.

### For surfaces

Use surface semantics, not descriptive styling names.

Current surface roles:

- `canvas`: full-page background
- `subtle`: quiet containers and grouped controls
- `elevated`: default card/module surface
- `raised`: stronger contrast or interaction emphasis
- `success`, `warning`, `error`, `info`: stateful surfaces

If a design needs a panel that feels different, first ask whether it is really a new surface role or just a composition of existing ones.

### For metadata color

Treat color as metadata and state, not decoration.

Current intended uses:

- status semantics through buttons, badges, and surfaces
- content-type emphasis through `FilterChip`
- restrained provider/content hints when already supported by shared tokens

Do not turn provider or content colors into dominant page backgrounds.

## Preferred Workflow

When touching shared browser UI, work in this order:

1. Check Storybook to confirm whether the pattern already exists.
2. Choose the correct layer to edit.
3. Reuse tokens and recipe helpers before inventing new values.
4. Update Storybook so the change is visible and reviewable.
5. Validate with tests, lint, typecheck, and a Storybook build.

## How To Decide Where A Change Belongs

Use this decision rule:

- If the change affects visual semantics shared across multiple components, start in `packages/design-system`.
- If the change is web-only but still primitive-level, update `apps/web/src/components/ui/*`.
- If the change is about composition or a product surface, update wrappers or feature-level components in `apps/web/src`.
- If the change is only a page-specific exception, keep it local and do not silently expand the shared system.

Examples:

- New button tone used across the app: update `primitives.ts`, `recipes.ts`, tests, then the web button.
- New browser-only card composition built from existing surfaces and typography: implement in `apps/web/src/components` or feature code.
- New CSS variable that simply mirrors an existing shared token for web consumption: update the web theme adapter.

## Contribution Rules

### Rules For Shared Changes

- Do not treat `apps/web/src/components/ui/*` as an isolated mini design system.
- Do not add raw colors or typography literals to shared web components when a shared token already exists.
- Do not add a new primitive variant before deciding whether the shared spec should own it.
- Do not use shadcn defaults as authority when they conflict with the package tokens.
- Do not duplicate logic that already exists in `recipes.ts`.

### Rules For New Components

- Prefer composition over introducing another foundational primitive.
- Keep public APIs small and semantic.
- Match the current naming taxonomy in Storybook.
- Use realistic fixtures for stories when content density matters.
- Favor calm density over oversized marketing-style layouts.

### Rules For Extending Tokens

Before adding a token, ask:

- Is this truly reusable?
- Does it belong to foundations, a primitive contract, or only a single component?
- Is it aligned with the mobile baseline, or is the divergence intentional and defensible?

If the web channel needs to diverge from mobile, document why in the PR or follow-up docs rather than letting the drift happen implicitly.

## Verification

When contributing to the web design system or shared browser UI, run the checks that match the layer you touched.

Recommended baseline:

- `bun test packages/design-system/test/design-system.test.ts`
- `bun run --cwd apps/web lint`
- `bun run --cwd apps/web typecheck`
- `bun run --cwd apps/web storybook:build`

For interactive review, run:

- `bun run storybook:web`

Use Storybook to confirm:

- token changes still read correctly in dark mode
- primitive variants still align visually
- card density and truncation still hold up under realistic content
- layout surfaces still feel like the same product family

## Current Reference Inventory

The current visual references live here:

- `apps/web/src/storybook/foundations-principles.stories.tsx`
- `apps/web/src/storybook/foundations-tokens.stories.tsx`
- `apps/web/src/storybook/primitives-button.stories.tsx`
- `apps/web/src/storybook/primitives-badge.stories.tsx`
- `apps/web/src/storybook/primitives-filter-chip.stories.tsx`
- `apps/web/src/storybook/primitives-surface.stories.tsx`
- `apps/web/src/storybook/cards-item-card.stories.tsx`
- `apps/web/src/storybook/layout-page-surfaces.stories.tsx`

If you introduce a new shared design-system concept and it is not represented in this inventory, the work is probably under-documented.

## Checklist

Before landing shared web design-system work:

1. Confirm the right layer owns the change.
2. Reuse or extend shared tokens instead of adding literals.
3. Update or add Storybook coverage.
4. Update package tests if shared semantics changed.
5. Run the relevant validation commands.
6. Leave the browser channel more consistent than you found it.
