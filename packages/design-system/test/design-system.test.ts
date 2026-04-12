import { describe, expect, test } from 'bun:test';

import {
  ButtonSpec,
  Colors,
  FilterChipPalette,
  FilterChipForegrounds,
  ItemCardFixtures,
  Motion,
  Radius,
  Spacing,
  Typography,
  createWebThemeVariables,
  getBadgeMetrics,
  getBadgePalette,
  getButtonMetrics,
  getButtonPalette,
  getFilterChipMetrics,
  getFilterChipPalette,
  getSurfaceBackgroundColor,
  getSurfaceBorderColor,
} from '../src/index';

describe('design-system foundations', () => {
  test('preserves the mobile dark token baseline', () => {
    expect(Colors.dark.background).toBe('#000000');
    expect(Colors.dark.surfaceElevated).toBe('#1A1A1A');
    expect(Colors.dark.textSubheader).toBe('rgba(255, 255, 255, 0.82)');
    expect(Colors.dark.statusErrorSurface).toBe('rgba(239, 68, 68, 0.16)');
    expect(Spacing.lg).toBe(16);
    expect(Radius.lg).toBe(16);
    expect(Typography.headlineLarge.fontSize).toBe(28);
    expect(Motion.opacity.pressed).toBe(0.8);
  });

  test('keeps the filter chip palette aligned with mobile semantics', () => {
    expect(FilterChipPalette.article.accent).toBe('#3B82F6');
    expect(FilterChipPalette.video.surface).toBe('rgba(255, 59, 48, 0.16)');
  });
});

describe('design-system primitive specs', () => {
  test('defines the button API shared by web and mobile wrappers', () => {
    expect(ButtonSpec.variants).toEqual(['primary', 'secondary', 'outline', 'ghost']);
    expect(ButtonSpec.sizes).toEqual(['sm', 'md', 'lg']);
    expect(ButtonSpec.tones).toEqual(['default', 'danger']);
  });

  test('preserves the mobile primitive palettes for shared button and badge semantics', () => {
    expect(getButtonPalette(Colors.dark, 'primary', 'default')).toEqual({
      backgroundColor: Colors.dark.accent,
      foregroundColor: Colors.dark.accentForeground,
    });
    expect(getButtonPalette(Colors.dark, 'outline', 'danger')).toEqual({
      backgroundColor: Colors.dark.statusErrorSurface,
      borderColor: Colors.dark.statusError,
      foregroundColor: Colors.dark.statusError,
    });
    expect(getBadgePalette(Colors.dark, 'subtle')).toEqual({
      backgroundColor: Colors.dark.surfaceSubtle,
      borderColor: Colors.dark.borderSubtle,
      foregroundColor: Colors.dark.textSecondary,
    });
    expect(getBadgePalette(Colors.dark, 'accent')).toEqual({
      backgroundColor: Colors.dark.accent,
      foregroundColor: Colors.dark.accentForeground,
    });
  });

  test('preserves the mobile primitive metrics for shared controls', () => {
    expect(getButtonMetrics('md')).toMatchObject({
      minHeight: 44,
      paddingX: Spacing.lg,
      paddingY: Spacing.md,
      borderRadius: Radius.lg,
      fontSize: Typography.labelLarge.fontSize,
    });
    expect(getBadgeMetrics('sm')).toMatchObject({
      paddingX: Spacing.sm,
      paddingY: Spacing.xs,
      borderRadius: Radius.sm,
      fontSize: Typography.labelSmallPlain.fontSize,
    });
    expect(getFilterChipMetrics('small')).toMatchObject({
      paddingX: Spacing.sm,
      paddingY: Spacing.xs,
      borderRadius: Radius.full,
      iconSize: 12,
      textTransform: 'uppercase',
    });
  });

  test('derives surface and filter chip states from the shared mobile baseline', () => {
    expect(getSurfaceBackgroundColor(Colors.dark, 'warning')).toBe(
      Colors.dark.statusWarningSurface
    );
    expect(getSurfaceBorderColor(Colors.dark, 'error', 'tone')).toBe(Colors.dark.statusError);
    expect(getFilterChipPalette(Colors.dark, 'default', false)).toEqual({
      backgroundColor: Colors.dark.surfaceSubtle,
      borderColor: Colors.dark.borderSubtle,
      foregroundColor: Colors.dark.textSubheader,
    });
    expect(getFilterChipPalette(Colors.dark, 'article', true)).toEqual({
      backgroundColor: FilterChipPalette.article.surface,
      borderColor: FilterChipPalette.article.accent,
      foregroundColor: FilterChipForegrounds.article,
    });
  });
});

describe('design-system fixtures', () => {
  test('exposes realistic item-card fixtures for cross-platform stories', () => {
    expect(ItemCardFixtures.video.title).toContain('Design systems');
    expect(ItemCardFixtures.article.contentType).toBe('ARTICLE');
    expect(ItemCardFixtures.stress.title.length).toBeGreaterThan(80);
  });
});

describe('design-system web adapter', () => {
  test('maps the shared tokens to shadcn-compatible CSS variables', () => {
    const variables = createWebThemeVariables();

    expect(variables['--background']).toBe(Colors.dark.surfaceCanvas);
    expect(variables['--foreground']).toBe(Colors.dark.textPrimary);
    expect(variables['--card']).toBe(Colors.dark.surfaceElevated);
    expect(variables['--primary']).toBe(Colors.dark.accent);
    expect(variables['--primary-foreground']).toBe(Colors.dark.accentForeground);
    expect(variables['--text-subheader']).toBe(Colors.dark.textSubheader);
    expect(variables['--surface-raised']).toBe(Colors.dark.surfaceRaised);
    expect(variables['--radius']).toBe(`${Radius.lg / 16}rem`);
    expect(variables['--filter-chip-article-accent']).toBe(FilterChipPalette.article.accent);
    expect(variables['--filter-chip-article-foreground']).toBe('#BFDBFE');
    expect(variables['--filter-chip-video-surface']).toBe(FilterChipPalette.video.surface);
    expect(variables['--filter-chip-video-foreground']).toBe('#FCA5A5');
  });
});
