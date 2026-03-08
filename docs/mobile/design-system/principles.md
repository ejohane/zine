# Mobile Design System Principles

Last updated: March 7, 2026

## Purpose

This document defines the visual and interaction north star for mobile UI in `apps/mobile`.
Use it for product taste and composition decisions.
Use `foundations.md` for token rules and `components.md` for component ownership/status.

## Product Character

Zine mobile should feel:

- Calm, not sterile
- Dense enough for serious readers, never cramped
- Editorial and utility-first, not playful or ornamental
- Confident in dark mode, with contrast doing most of the work
- Tactile in interaction, but restrained in motion

The app is a reading and curation tool.
UI should support focus on content, not compete with it.

## Core Principles

### 1. Content Leads

Content title, creator, status, and primary action should be obvious in that order.
If decorative treatment competes with readability, remove the decoration.

### 2. Hierarchy Comes from Contrast, Not Noise

Prefer a small number of reliable hierarchy tools:

- surface contrast
- typography step changes
- spacing rhythm
- iconography only when it reduces scan time

Avoid stacking multiple emphasis treatments on the same element.

### 3. Dark-First Means Intentional Surfaces

The app is dark-first.
Backgrounds should feel layered, not flat.
Reach for semantic surface tokens before inventing new fills.

Default surface roles:

- `surfaceCanvas`: full-screen background
- `surfaceSubtle`: quiet chips, grouped rows, secondary containers
- `surfaceElevated`: cards and interactive modules
- `surfaceRaised`: pressed, highlighted, or stronger separation states

### 4. Monochrome by Default, Brand Color by Exception

Zine’s base language is restrained and mostly monochrome.
Use provider/content colors as metadata and wayfinding, not as the dominant screen color.
Brand color is strongest when it appears sparingly.

### 5. Motion Should Clarify State

Motion should answer one of these questions:

- What changed?
- What is tappable?
- What is loading or progressing?

Avoid decorative motion in foundational UI.
Fast opacity feedback is preferred over elaborate choreography.

### 6. Components Should Feel Related

Shared components should use the same corner language, spacing rhythm, and text roles.
If a component needs a one-off size, color, or surface treatment, first ask whether the system is missing a token or variant.

## Preferred Patterns

- Strong title readability over image flourish
- Rounded corners used consistently, not as decoration
- Compact controls with clear tap affordance
- Muted metadata rows that stay legible at a glance
- Single strong call to action per surface
- Empty and error states that sound clear and direct

## Anti-Patterns

Avoid these unless a specific product need justifies them:

- bright accent colors used as a default background
- multiple colored badges competing in the same row
- generic “AI app” gradients or glossy glassmorphism
- hero treatments that reduce content density without earning it
- stacked shadows, border effects, and motion on the same component
- ad hoc typography sizes added directly in shared components
- introducing a new card style when an existing variant can be extended

## Design Review Questions

Before landing new shared UI, check:

1. Is the content still the focal point?
2. Does this use existing semantic surfaces and text roles?
3. Is the new styling reusable, or is it a one-off?
4. Would this still look coherent beside `ItemCard`, `FilterChip`, and `ListStates`?
5. Is motion doing work, or just adding activity?

## Agent Checklist

When an agent edits shared mobile UI:

1. Read `principles.md`, `foundations.md`, and `components.md`.
2. Prefer canonical components and semantic theme tokens.
3. Run `bun run design-system:check` before handoff.
4. Add or update Storybook coverage for new canonical shared UI.
