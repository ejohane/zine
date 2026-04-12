import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

import { Radius, Typography } from '@zine/design-system';
import type { ContentType, Provider } from '@zine/shared';

import { formatDuration, formatRelativeDate, mapContentType, mapProvider } from '@/lib/format';
import { typographyStyle } from '@/lib/utils';

import { Surface } from '@/components';

export interface ItemCardData {
  id: string;
  title: string;
  creator: string;
  creatorImageUrl?: string | null;
  thumbnailUrl?: string | null;
  contentType: ContentType | 'ARTICLE' | 'PODCAST' | 'VIDEO' | 'POST';
  provider: Provider | 'YOUTUBE' | 'SPOTIFY' | 'SUBSTACK' | 'WEB';
  duration?: number | null;
  readingTimeMinutes?: number | null;
  publisher?: string | null;
  summary?: string | null;
  canonicalUrl?: string | null;
  lastOpenedAt?: string | null;
  bookmarkedAt?: string | null;
  publishedAt?: string | null;
  ingestedAt?: string | null;
}

export type ItemCardShape = 'row' | 'stack' | 'feature';

function getLengthLabel(item: ItemCardData) {
  if (item.duration) {
    return formatDuration(item.duration);
  }

  if (item.readingTimeMinutes) {
    return `${item.readingTimeMinutes} min`;
  }

  return null;
}

function getRelativeLabel(item: ItemCardData) {
  return formatRelativeDate(
    item.lastOpenedAt ?? item.publishedAt ?? item.bookmarkedAt ?? item.ingestedAt ?? null
  );
}

function ItemMetaRow({ item }: { item: ItemCardData }) {
  const bits = [
    mapProvider(item.provider),
    mapContentType(item.contentType),
    getLengthLabel(item),
    getRelativeLabel(item),
  ].filter(Boolean);

  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--text-tertiary)]"
      style={{
        fontSize: Typography.labelSmallPlain.fontSize,
        lineHeight: `${Typography.labelSmallPlain.lineHeight}px`,
        fontWeight: Typography.labelSmallPlain.fontWeight,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      {bits.map((bit, index) => (
        <div key={`${bit}-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span className="text-[var(--text-subheader)]">&bull;</span> : null}
          <span>{bit}</span>
        </div>
      ))}
    </div>
  );
}

function IdentityMark({ item }: { item: ItemCardData }) {
  const creatorInitial = (item.creator || item.publisher || 'Z').slice(0, 1).toUpperCase();

  if (item.creatorImageUrl) {
    return (
      <img
        src={item.creatorImageUrl}
        alt=""
        className="shrink-0 object-cover"
        style={{
          width: 18,
          height: 18,
          borderRadius: Radius.full,
        }}
      />
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center bg-[var(--surface-raised)] text-[var(--text-subheader)]"
      style={{
        width: 18,
        height: 18,
        borderRadius: Radius.full,
        fontSize: Typography.labelSmallPlain.fontSize,
        lineHeight: `${Typography.labelSmallPlain.lineHeight}px`,
        fontWeight: 600,
      }}
    >
      {creatorInitial}
    </span>
  );
}

function MediaThumb({ item }: { item: ItemCardData }) {
  const mediaUrl = item.thumbnailUrl ?? item.creatorImageUrl ?? null;

  if (mediaUrl) {
    return (
      <img
        src={mediaUrl}
        alt=""
        className="h-full w-full object-cover"
        style={{ borderRadius: Radius.md }}
      />
    );
  }

  return (
    <div
      className="h-full w-full"
      style={{
        borderRadius: Radius.md,
        background:
          'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
      }}
    />
  );
}

export function ItemCard({ item, actionSlot }: { item: ItemCardData; actionSlot?: ReactNode }) {
  return <ItemCardView item={item} actionSlot={actionSlot} shape="row" />;
}

export function ItemCardView({
  item,
  actionSlot,
  shape = 'row',
}: {
  item: ItemCardData;
  actionSlot?: ReactNode;
  shape?: ItemCardShape;
}) {
  const sourceLabel = item.canonicalUrl
    ? new URL(item.canonicalUrl).hostname.replace(/^www\./, '')
    : 'original source';
  const summary = item.summary ?? item.creator ?? item.publisher ?? 'Untitled source';
  const creatorLabel = item.creator || item.publisher || 'Unknown creator';
  const href = `/item/${item.id}`;
  const inlineLengthLabel = getLengthLabel(item);
  const relativeLabel = getRelativeLabel(item);

  if (shape === 'feature') {
    return (
      <Link to={href} className="group block">
        <Surface className="overflow-hidden transition-transform duration-150 group-hover:-translate-y-0.5">
          <div className="grid min-h-[104px] grid-cols-[92px_minmax(0,1fr)] sm:grid-cols-[104px_minmax(0,1fr)]">
            <div className="bg-[var(--surface-raised)]">
              <MediaThumb item={item} />
            </div>
            <div className="flex min-w-0 flex-col justify-between p-4">
              <div className="grid gap-2">
                <ItemMetaRow item={item} />
                <p
                  className="m-0 line-clamp-2 text-foreground"
                  style={{
                    ...typographyStyle(Typography.titleMedium),
                    letterSpacing: '-0.03em',
                  }}
                >
                  {item.title}
                </p>
              </div>

              <div
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[var(--text-subheader)]"
                style={typographyStyle(Typography.bodySmall)}
              >
                <span className="truncate">{creatorLabel}</span>
                {inlineLengthLabel ? (
                  <span className="text-[var(--text-tertiary)]">&bull;</span>
                ) : null}
                {inlineLengthLabel ? <span>{inlineLengthLabel}</span> : null}
              </div>
            </div>
          </div>
        </Surface>
      </Link>
    );
  }

  if (shape === 'stack') {
    return (
      <Link to={href} className="group block min-w-0 h-full">
        <Surface className="flex h-full min-h-[272px] flex-col overflow-hidden transition-transform duration-150 group-hover:-translate-y-1">
          <div className="aspect-[1.1/0.86] bg-[var(--surface-raised)]">
            <MediaThumb item={item} />
          </div>
          <div className="flex flex-1 flex-col justify-between gap-4 p-5">
            <div className="grid gap-3">
              <ItemMetaRow item={item} />
              <p
                className="m-0 line-clamp-2 text-foreground"
                style={{
                  ...typographyStyle(Typography.titleLarge),
                  letterSpacing: '-0.04em',
                }}
              >
                {item.title}
              </p>
              <p
                className="m-0 line-clamp-2 text-[var(--text-subheader)]"
                style={{
                  ...Typography.bodySmall,
                  lineHeight: `${Typography.bodySmall.lineHeight + 4}px`,
                }}
              >
                {summary}
              </p>
            </div>

            <div
              className="flex items-center gap-3 border-t border-border pt-4 text-[var(--text-subheader)]"
              style={typographyStyle(Typography.bodySmall)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <IdentityMark item={item} />
                <span className="truncate">{creatorLabel}</span>
              </div>
              {relativeLabel || inlineLengthLabel ? (
                <span className="text-[var(--text-tertiary)]">&bull;</span>
              ) : null}
              {relativeLabel || inlineLengthLabel ? (
                <span className="shrink-0">{inlineLengthLabel ?? relativeLabel}</span>
              ) : null}
            </div>
          </div>
        </Surface>
      </Link>
    );
  }

  return (
    <Surface className="overflow-hidden">
      <div className="flex gap-4 p-4 sm:items-center" style={{ minHeight: 104 }}>
        <div className="shrink-0" style={{ width: 72, height: 72 }}>
          <MediaThumb item={item} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="grid gap-3">
            <div className="grid gap-2">
              <ItemMetaRow item={item} />
              <Link
                className="block text-foreground transition-opacity duration-150 hover:opacity-90"
                style={{
                  ...typographyStyle(Typography.titleMedium),
                  letterSpacing: '-0.03em',
                }}
                to={href}
              >
                {item.title}
              </Link>
              <p
                className="m-0 line-clamp-2 text-[var(--text-subheader)]"
                style={{
                  ...Typography.bodySmall,
                  lineHeight: `${Typography.bodySmall.lineHeight + 2}px`,
                }}
              >
                {summary}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <IdentityMark item={item} />
                <div className="min-w-0">
                  <div
                    className="truncate text-foreground"
                    style={{
                      ...typographyStyle(Typography.bodySmall),
                      fontWeight: 500,
                    }}
                  >
                    {creatorLabel}
                  </div>
                  <div
                    className="truncate text-[var(--text-tertiary)]"
                    style={typographyStyle(Typography.bodySmall)}
                  >
                    {sourceLabel}
                  </div>
                </div>
              </div>

              {actionSlot ? (
                <div className="flex shrink-0 flex-wrap gap-2">{actionSlot}</div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Surface>
  );
}
