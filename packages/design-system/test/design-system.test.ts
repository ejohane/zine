import { describe, expect, test } from 'bun:test';

import {
  BrandColors,
  ButtonSpec,
  Colors,
  CoolReadingScale,
  FilterChipPalette,
  FilterChipForegrounds,
  ItemCardFixtures,
  Motion,
  OrangeScale,
  Radius,
  SemanticColorRoles,
  Spacing,
  StatusColors,
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
  test('codifies the Zine brand and reading scales', () => {
    expect(BrandColors).toEqual({ black: '#000000', orange: '#EF661F' });
    expect(OrangeScale).toEqual({
      50: '#FEF7F1',
      100: '#FCEADD',
      300: '#F3B181',
      500: '#DF702F',
      700: '#A94A1E',
      950: '#3A170A',
    });
    expect(CoolReadingScale).toEqual({
      50: '#F8F9FA',
      100: '#F1F2F4',
      300: '#D0D4DA',
      500: '#828892',
      800: '#26292D',
      950: '#000000',
    });
  });

  test('maps the cross-platform semantic roles into the existing theme contract', () => {
    expect(SemanticColorRoles.light).toEqual({
      canvas: '#F5F7F8',
      surface: '#FFFFFF',
      raised: '#E9EDF0',
      primaryText: '#151719',
      secondaryText: '#5D646C',
      border: '#CFD4DA',
      brandAccent: '#EF661F',
      onAccent: '#000000',
      inlineLink: '#B64012',
    });
    expect(SemanticColorRoles.dark.surface).toBe('#14171A');
    expect(SemanticColorRoles.dark.inlineLink).toBe('#FFAD7C');
    expect(StatusColors.danger).toEqual({ accent: '#B83A32', surface: '#F5E4E2' });

    expect(Colors.light.surfaceCanvas).toBe(SemanticColorRoles.light.canvas);
    expect(Colors.light.accent).toBe(BrandColors.orange);
    expect(Colors.light.accentForeground).toBe(BrandColors.black);
    expect(Colors.dark.background).toBe('#000000');
    expect(Colors.dark.surfaceElevated).toBe('#14171A');
    expect(Colors.dark.textSubheader).toBe('#B2BAC2');
    expect(Colors.dark.statusErrorSurface).toBe('#F5E4E2');
    expect(Spacing.lg).toBe(16);
    expect(Radius.lg).toBe(16);
    expect(Typography.headlineLarge.fontSize).toBe(28);
    expect(Motion.opacity.pressed).toBe(0.8);
  });

  test('keeps filter chips on the shared orange selection treatment', () => {
    expect(FilterChipPalette.article.accent).toBe(BrandColors.orange);
    expect(FilterChipPalette.video.surface).toBe(BrandColors.orange);
    expect(FilterChipForegrounds.post).toBe(BrandColors.black);
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
      backgroundColor: Colors.dark.accent,
      borderColor: Colors.dark.accent,
      foregroundColor: Colors.dark.accentForeground,
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

    expect(variables['--background']).toBe(Colors.light.surfaceCanvas);
    expect(variables['--foreground']).toBe(Colors.light.textPrimary);
    expect(variables['--card']).toBe(Colors.light.surfaceElevated);
    expect(variables['--primary']).toBe(Colors.light.accent);
    expect(variables['--primary-foreground']).toBe(Colors.light.accentForeground);
    expect(variables['--text-subheader']).toBe(Colors.light.textSubheader);
    expect(variables['--surface-raised']).toBe(Colors.light.surfaceRaised);
    expect(variables['--radius']).toBe(`${Radius.lg / 16}rem`);
    expect(variables['--filter-chip-article-accent']).toBe(FilterChipPalette.article.accent);
    expect(variables['--filter-chip-article-foreground']).toBe(BrandColors.black);
    expect(variables['--filter-chip-video-surface']).toBe(FilterChipPalette.video.surface);
    expect(variables['--filter-chip-video-foreground']).toBe(BrandColors.black);
    expect(variables['--font-sans']).toContain('Inter Variable');
    expect(variables['--font-editorial']).toBeUndefined();
    expect(variables['--brand-orange']).toBe(BrandColors.orange);
    expect(variables['--orange-300']).toBe(OrangeScale[300]);
    expect(variables['--cool-reading-800']).toBe(CoolReadingScale[800]);
    expect(variables['--workbench-paper']).toBe(SemanticColorRoles.light.canvas);
    expect(variables['--workbench-sidebar']).toBe(BrandColors.black);
    expect(variables['--workbench-sidebar-text-active']).toBe(SemanticColorRoles.dark.primaryText);
  });
});
