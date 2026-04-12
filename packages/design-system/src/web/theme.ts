import { Colors, FilterChipPalette, Radius } from '../foundations';

export type WebThemeVariables = Record<string, string>;

const FILTER_CHIP_FOREGROUNDS = {
  article: '#BFDBFE',
  podcast: '#BBF7D0',
  video: '#FCA5A5',
  post: '#F5F5F5',
} as const;

const WEB_THEME_EXTRAS = {
  '--shadow': '0 18px 40px rgba(0, 0, 0, 0.2)',
  '--frame-width': '70rem',
  '--font-sans': "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
} as const;

export function createWebThemeVariables(): WebThemeVariables {
  const colors = Colors.dark;

  return {
    '--background': colors.surfaceCanvas,
    '--foreground': colors.textPrimary,
    '--card': colors.surfaceElevated,
    '--card-foreground': colors.textPrimary,
    '--popover': '#111111',
    '--popover-foreground': colors.textPrimary,
    '--primary': colors.accent,
    '--primary-foreground': colors.accentForeground,
    '--secondary': colors.surfaceSubtle,
    '--secondary-foreground': colors.textPrimary,
    '--muted': colors.surfaceSubtle,
    '--muted-foreground': colors.textSecondary,
    '--accent': colors.surfaceSubtle,
    '--accent-foreground': colors.textPrimary,
    '--destructive': colors.statusError,
    '--destructive-foreground': colors.overlayForeground,
    '--border': colors.borderDefault,
    '--input': colors.borderDefault,
    '--ring': 'rgba(255, 255, 255, 0.16)',
    '--radius': `${Radius.lg / 16}rem`,
    '--surface-canvas': colors.surfaceCanvas,
    '--surface-subtle': colors.surfaceSubtle,
    '--surface-elevated': colors.surfaceElevated,
    '--surface-raised': colors.surfaceRaised,
    '--line': colors.borderSubtle,
    '--line-strong': colors.borderDefault,
    '--text': colors.textPrimary,
    '--text-subheader': colors.textSubheader,
    '--text-dim': colors.textSecondary,
    '--text-tertiary': colors.textTertiary,
    '--danger': colors.statusError,
    '--success': colors.statusSuccess,
    '--warning': colors.statusWarning,
    '--info': colors.statusInfo,
    '--status-success-surface': colors.statusSuccessSurface,
    '--status-warning-surface': colors.statusWarningSurface,
    '--status-error-surface': colors.statusErrorSurface,
    '--status-info-surface': colors.statusInfoSurface,
    '--filter-chip-article-accent': FilterChipPalette.article.accent,
    '--filter-chip-article-foreground': FILTER_CHIP_FOREGROUNDS.article,
    '--filter-chip-article-surface': FilterChipPalette.article.surface,
    '--filter-chip-podcast-accent': FilterChipPalette.podcast.accent,
    '--filter-chip-podcast-foreground': FILTER_CHIP_FOREGROUNDS.podcast,
    '--filter-chip-podcast-surface': FilterChipPalette.podcast.surface,
    '--filter-chip-video-accent': FilterChipPalette.video.accent,
    '--filter-chip-video-foreground': FILTER_CHIP_FOREGROUNDS.video,
    '--filter-chip-video-surface': FilterChipPalette.video.surface,
    '--filter-chip-post-accent': FilterChipPalette.post.accent,
    '--filter-chip-post-foreground': FILTER_CHIP_FOREGROUNDS.post,
    '--filter-chip-post-surface': FilterChipPalette.post.surface,
    ...WEB_THEME_EXTRAS,
  };
}

export function serializeCssVariables(selector: string, variables: WebThemeVariables): string {
  const lines = Object.entries(variables).map(([name, value]) => `  ${name}: ${value};`);
  return `${selector} {\n${lines.join('\n')}\n}`;
}
