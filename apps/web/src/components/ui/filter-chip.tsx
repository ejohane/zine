import type { ComponentPropsWithoutRef, ComponentType } from 'react';

import {
  Colors,
  getFilterChipMetrics,
  getFilterChipPalette,
  type FilterChipToneKey,
} from '@zine/design-system';
import { ContentType } from '@zine/shared';

import { cn, typographyStyle } from '@/lib/utils';

type FilterChipIconProps = {
  className?: string;
  strokeWidth?: number;
  size?: number;
};

export type FilterChipTone = 'default' | ContentType;

export interface FilterChipProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children'> {
  label: string;
  count?: number;
  icon?: ComponentType<FilterChipIconProps>;
  selected?: boolean;
  tone?: FilterChipTone;
  size?: 'small' | 'medium';
}

function resolveFilterChipTone(tone: FilterChipTone): FilterChipToneKey | 'default' {
  switch (tone) {
    case ContentType.ARTICLE:
      return 'article';
    case ContentType.PODCAST:
      return 'podcast';
    case ContentType.VIDEO:
      return 'video';
    case ContentType.POST:
      return 'post';
    default:
      return 'default';
  }
}

export function FilterChip({
  label,
  count,
  icon: Icon,
  selected = false,
  tone = 'default',
  size = 'medium',
  className,
  style,
  ...props
}: FilterChipProps) {
  const displayedCount = typeof count === 'number' ? (count > 99 ? '99+' : String(count)) : null;
  const metrics = getFilterChipMetrics(size);
  const palette = getFilterChipPalette(Colors.dark, resolveFilterChipTone(tone), selected);
  const textStyle = typographyStyle(metrics);

  return (
    <button
      type="button"
      aria-pressed={selected}
      data-state={selected ? 'active' : 'inactive'}
      className={cn(
        'inline-flex shrink-0 items-center border-solid transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      style={{
        paddingInline: metrics.paddingX,
        paddingBlock: metrics.paddingY,
        gap: metrics.gap,
        borderRadius: metrics.borderRadius,
        backgroundColor: palette.backgroundColor,
        color: palette.foregroundColor,
        borderColor: palette.borderColor,
        borderWidth: 1,
        ...textStyle,
        ...style,
      }}
      {...props}
    >
      {Icon ? <Icon className="shrink-0" size={metrics.iconSize} strokeWidth={2.2} /> : null}
      <span>{label}</span>
      {displayedCount ? (
        <span className="tabular-nums" style={{ minWidth: metrics.countMinWidth }}>
          {displayedCount}
        </span>
      ) : null}
    </button>
  );
}
