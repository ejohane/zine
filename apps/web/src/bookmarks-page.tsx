import {
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Globe2,
  Mail,
  Music2,
  Play,
  Rss,
  Settings,
  Share2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';

import { ContentType, Provider } from '@zine/shared';

import { Badge, Button, EmptyState, cn } from './components';
import { FilterChip } from './components/ui/filter-chip';
import { AppWordmark } from './app-wordmark';
import {
  formatDuration,
  formatPlainText,
  isValidUrl,
  mapContentType,
  mapProvider,
} from './lib/format';
import type { LibraryItem, RouterOutputs } from './lib/router-types';
import { trpc } from './lib/trpc';

const CONTENT_FILTERS: Array<{ label: string; value?: ContentType }> = [
  { label: 'All' },
  { label: 'Articles', value: ContentType.ARTICLE },
  { label: 'Podcasts', value: ContentType.PODCAST },
  { label: 'Videos', value: ContentType.VIDEO },
  { label: 'Posts', value: ContentType.POST },
];

function getLibrarySummary(item: LibraryItem) {
  return (
    formatPlainText(item.summary) ??
    item.creator ??
    item.publisher ??
    'No summary yet. Open the original source to get the full context.'
  );
}

function getLibraryCreatorLabel(item: Pick<LibraryItem, 'creator' | 'publisher'>) {
  return item.creator ?? item.publisher ?? 'Unknown creator';
}

function getLibraryLengthLabel(
  item: Pick<LibraryItem, 'duration' | 'readingTimeMinutes'>
): string | null {
  if (item.duration) {
    return formatDuration(item.duration) ?? null;
  }

  if (item.readingTimeMinutes) {
    return `${item.readingTimeMinutes} min read`;
  }

  return null;
}

type BookmarkDetailItem = Pick<
  LibraryItem,
  | 'provider'
  | 'duration'
  | 'readingTimeMinutes'
  | 'publishedAt'
  | 'bookmarkedAt'
  | 'ingestedAt'
  | 'canonicalUrl'
>;
type CreatorProfile = RouterOutputs['creators']['get'];

function formatBookmarkRelativeTime(value?: string | number | null) {
  if (!value) {
    return 'Just now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    return 'Just now';
  }

  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffHours < 1) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  if (diffDays === 1) {
    return 'Yesterday';
  }

  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  if (diffDays < 30) {
    return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  }

  const sameYear = date.getFullYear() === now.getFullYear();

  return new Intl.DateTimeFormat(
    'en',
    sameYear
      ? { month: 'short', day: 'numeric' }
      : {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }
  ).format(date);
}

function extractPodcastHosts(description?: string | null) {
  if (!description) {
    return null;
  }

  const patterns = [
    /(?:from|by|hosted by|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)+)/i,
    /(?:from|by|hosted by|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function extractXHandle(url?: string | null) {
  if (!url) {
    return null;
  }

  const match = url.match(/(?:x\.com|twitter\.com)\/([^/]+)\//);
  return match ? match[1] : null;
}

function getBookmarkSubtextBits(
  item: BookmarkDetailItem,
  creator: CreatorProfile | undefined
): string[] {
  const bits: Array<string | null> = [];

  if (item.provider === Provider.SPOTIFY) {
    bits.push(extractPodcastHosts(creator?.description));
  }

  if (item.provider === Provider.YOUTUBE || item.provider === Provider.X) {
    bits.push(creator?.handle ?? extractXHandle(item.canonicalUrl));
  }

  bits.push(formatBookmarkRelativeTime(item.publishedAt ?? item.bookmarkedAt ?? item.ingestedAt));
  bits.push(getLibraryLengthLabel(item));

  return bits.filter((bit): bit is string => Boolean(bit));
}

function getBookmarkAboutLabel(contentType: ContentType) {
  switch (contentType) {
    case ContentType.PODCAST:
      return 'About this episode';
    case ContentType.VIDEO:
      return 'About this video';
    case ContentType.POST:
      return 'About this post';
    case ContentType.ARTICLE:
    default:
      return 'About this article';
  }
}

function getBookmarkFabConfig(provider: Provider | string): {
  label: string;
  icon: ReactNode;
  toneClassName: string;
} {
  switch (provider) {
    case Provider.SPOTIFY:
      return {
        label: 'Open in Spotify',
        icon: <Music2 size={20} strokeWidth={2.2} />,
        toneClassName: 'new-page-bookmark-view__fab--spotify',
      };
    case Provider.YOUTUBE:
      return {
        label: 'Open in YouTube',
        icon: <Play size={20} strokeWidth={2.2} />,
        toneClassName: 'new-page-bookmark-view__fab--youtube',
      };
    case Provider.GMAIL:
      return {
        label: 'Open source newsletter',
        icon: <Mail size={20} strokeWidth={2.2} />,
        toneClassName: 'new-page-bookmark-view__fab--gmail',
      };
    case Provider.SUBSTACK:
      return {
        label: 'Open in Substack',
        icon: <Rss size={20} strokeWidth={2.2} />,
        toneClassName: 'new-page-bookmark-view__fab--substack',
      };
    case Provider.X:
      return {
        label: 'Open on X',
        icon: <span className="new-page-bookmark-view__fab-x">X</span>,
        toneClassName: 'new-page-bookmark-view__fab--x',
      };
    default:
      return {
        label: 'Open source',
        icon: <Globe2 size={20} strokeWidth={2.2} />,
        toneClassName: 'new-page-bookmark-view__fab--default',
      };
  }
}

export function BookmarksPage() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const { bookmarkId } = useParams<{ bookmarkId?: string }>();
  const [bookmarkFilter, setBookmarkFilter] = useState<ContentType | undefined>();

  const bookmarksQuery = trpc.items.library.useQuery({
    limit: 50,
    filter: { contentType: bookmarkFilter },
  });
  const bookmarks = bookmarksQuery.data?.items ?? [];
  const selectedBookmarkId = bookmarkId ?? null;
  const selectedBookmark = useMemo(
    () => bookmarks.find((item) => item.id === bookmarkId) ?? null,
    [bookmarkId, bookmarks]
  );
  const selectedBookmarkDetailQuery = trpc.items.get.useQuery(
    { id: selectedBookmarkId ?? '' },
    { enabled: Boolean(selectedBookmarkId) }
  );

  useEffect(() => {
    if (!bookmarkId || selectedBookmark || selectedBookmarkDetailQuery.isLoading) {
      return;
    }

    if (selectedBookmarkDetailQuery.data) {
      return;
    }

    if (!selectedBookmarkDetailQuery.error) {
      return;
    }

    navigate('/bookmarks', { replace: true });
  }, [
    bookmarkId,
    navigate,
    selectedBookmark,
    selectedBookmarkDetailQuery.data,
    selectedBookmarkDetailQuery.error,
    selectedBookmarkDetailQuery.isLoading,
  ]);

  const displayBookmark = selectedBookmarkDetailQuery.data ?? selectedBookmark;
  const selectedBookmarkCreatorQuery = trpc.creators.get.useQuery(
    { creatorId: displayBookmark?.creatorId ?? '' },
    {
      enabled: Boolean(displayBookmark?.creatorId),
      staleTime: 5 * 60 * 1000,
    }
  );
  const selectedBookmarkMeta = displayBookmark
    ? getBookmarkSubtextBits(displayBookmark, selectedBookmarkCreatorQuery.data)
    : [];
  const selectedBookmarkSourceUrl =
    displayBookmark?.canonicalUrl && isValidUrl(displayBookmark.canonicalUrl)
      ? displayBookmark.canonicalUrl
      : null;
  const selectedBookmarkIsFinished = Boolean(displayBookmark?.isFinished);
  const bookmarkFabConfig = displayBookmark ? getBookmarkFabConfig(displayBookmark.provider) : null;

  const invalidateSelectedBookmark = () => {
    if (!selectedBookmarkId) {
      return;
    }

    void Promise.all([
      utils.items.get.invalidate({ id: selectedBookmarkId }),
      utils.items.library.invalidate(),
      utils.items.home.invalidate(),
    ]);
  };

  const toggleFinishedMutation = trpc.items.toggleFinished.useMutation({
    onSuccess: invalidateSelectedBookmark,
  });
  const unbookmarkMutation = trpc.items.unbookmark.useMutation({
    onSuccess: invalidateSelectedBookmark,
  });

  if (bookmarksQuery.isLoading) {
    return (
      <main className="new-page-screen">
        <EmptyState title="Loading bookmarks" message="Pulling your saved items into the desk." />
      </main>
    );
  }

  if (bookmarksQuery.error) {
    return (
      <main className="new-page-screen">
        <EmptyState
          title="Could not load bookmarks"
          message={bookmarksQuery.error.message ?? 'Please refresh and try again.'}
        />
      </main>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <main className="new-page-screen">
        <EmptyState
          title="No bookmarks yet"
          message="Save a few items first, then this desk becomes the main web surface for browsing them."
        />
      </main>
    );
  }

  return (
    <main className="new-page-screen">
      <div className="new-page-sidebar">
        <div className="new-page-sidebar__rail">
          <div className="new-page-sidebar__rail-top">
            <div className="new-page-sidebar__rail-header">
              <Link
                to="/bookmarks"
                className="new-page-sidebar__brand"
                aria-label="Go to bookmarks"
              >
                <div className="new-page-sidebar__brand-icon">
                  <AppWordmark compact />
                </div>
              </Link>
            </div>

            <nav className="new-page-sidebar__rail-nav" aria-label="Primary">
              <NavLink
                to="/bookmarks"
                end
                className={({ isActive }) =>
                  cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
                }
                aria-label="Bookmarks"
                title="Bookmarks"
              >
                <BookmarkCheck size={18} strokeWidth={2.15} />
                <span>Bookmarks</span>
              </NavLink>
            </nav>
          </div>

          <div className="new-page-sidebar__rail-footer">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
              }
              aria-label="Settings"
              title="Settings"
            >
              <Settings size={18} strokeWidth={2.15} />
              <span>Settings</span>
            </NavLink>
          </div>
        </div>
      </div>

      <div className="new-page-inset">
        <header className="new-page-inset__header">
          <nav className="new-page-breadcrumb" aria-label="Current page location">
            <span>Library</span>
            <ChevronRight size={14} strokeWidth={2.2} />
            {displayBookmark ? (
              <>
                <Link to="/bookmarks" className="new-page-breadcrumb__link">
                  Bookmarks
                </Link>
                <ChevronRight size={14} strokeWidth={2.2} />
                <strong className="new-page-breadcrumb__title">{displayBookmark.title}</strong>
              </>
            ) : (
              <strong>Bookmarks</strong>
            )}
          </nav>
        </header>

        <div className="new-page-inset__body">
          <aside className="new-page-column-card">
            <div className="new-page-column-card__header">
              <h2 className="new-page-column-card__title">Bookmarks</h2>
              <div className="new-page-column-card__chips">
                {CONTENT_FILTERS.map((filter) => (
                  <FilterChip
                    key={filter.label}
                    label={filter.label}
                    size="small"
                    selected={bookmarkFilter === filter.value}
                    tone={filter.value ?? 'default'}
                    onClick={() => setBookmarkFilter(filter.value)}
                  />
                ))}
              </div>
            </div>

            <div className="new-page-column-card__list">
              {bookmarks.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selectedBookmark?.id === item.id}
                  className={cn(
                    'bookmark-row',
                    selectedBookmark?.id === item.id && 'bookmark-row--selected'
                  )}
                  onClick={() => navigate(`/bookmarks/${item.id}`)}
                >
                  {item.thumbnailUrl ? (
                    <img
                      className="bookmark-row__cover"
                      src={item.thumbnailUrl}
                      alt=""
                      loading="lazy"
                    />
                  ) : (
                    <div className="bookmark-row__cover bookmark-row__cover--empty" />
                  )}
                  <div className="bookmark-row__info">
                    <span className="bookmark-row__title">{item.title}</span>
                    <div className="bookmark-row__author">
                      {item.creatorImageUrl ? (
                        <img className="bookmark-row__avatar" src={item.creatorImageUrl} alt="" />
                      ) : (
                        <div className="bookmark-row__avatar bookmark-row__avatar--fallback">
                          {(item.creator || item.publisher || 'U')[0]}
                        </div>
                      )}
                      <span className="bookmark-row__name">
                        {item.creator || item.publisher || 'Unknown'}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <div className="new-page-inset__content">
            <section className="new-page-column-card new-page-bookmark-pane">
              {displayBookmark ? (
                <article className="new-page-bookmark-view new-page-bookmark-view--pane">
                  <div className="new-page-bookmark-view__hero">
                    {displayBookmark.thumbnailUrl || displayBookmark.creatorImageUrl ? (
                      <img
                        src={displayBookmark.thumbnailUrl ?? displayBookmark.creatorImageUrl ?? ''}
                        alt=""
                      />
                    ) : (
                      <div className="new-page-bookmark-view__hero-placeholder" />
                    )}

                    <button
                      type="button"
                      className="new-page-bookmark-view__back"
                      onClick={() => navigate('/bookmarks')}
                      aria-label="Back to bookmarks list"
                      title="Back"
                    >
                      <ChevronLeft size={20} strokeWidth={2.4} />
                    </button>

                    <div className="new-page-bookmark-view__hero-content">
                      <div className="new-page-bookmark-view__badges">
                        <Badge>{mapProvider(displayBookmark.provider)}</Badge>
                        <Badge>{mapContentType(displayBookmark.contentType)}</Badge>
                      </div>

                      <h2 className="new-page-bookmark-view__title">{displayBookmark.title}</h2>
                    </div>
                  </div>

                  <div className="new-page-bookmark-view__body">
                    <div className="new-page-bookmark-view__creator-block">
                      <div className="new-page-bookmark-view__creator">
                        {displayBookmark.creatorImageUrl ? (
                          <img
                            className="new-page-bookmark-view__creator-avatar"
                            src={displayBookmark.creatorImageUrl}
                            alt=""
                          />
                        ) : (
                          <div className="new-page-bookmark-view__creator-avatar new-page-bookmark-view__creator-avatar--fallback">
                            {getLibraryCreatorLabel(displayBookmark).slice(0, 1).toUpperCase()}
                          </div>
                        )}

                        <div className="new-page-bookmark-view__creator-copy">
                          <strong>{getLibraryCreatorLabel(displayBookmark)}</strong>
                        </div>
                      </div>
                    </div>

                    {selectedBookmarkMeta.length > 0 ? (
                      <div className="new-page-bookmark-view__meta" aria-label="Bookmark metadata">
                        {selectedBookmarkMeta.map((bit, index) => (
                          <span key={`${bit}-${index}`}>{bit}</span>
                        ))}
                      </div>
                    ) : null}

                    <div className="new-page-bookmark-view__actions">
                      <div className="new-page-bookmark-view__actions-left">
                        <Button
                          tone="ghost"
                          size="icon"
                          className="new-page-bookmark-view__icon-action"
                          aria-label={`Remove bookmark for ${displayBookmark.title}`}
                          title="Remove bookmark"
                          disabled={!selectedBookmarkId || unbookmarkMutation.isPending}
                          onClick={() => {
                            if (!selectedBookmarkId) {
                              return;
                            }

                            unbookmarkMutation.mutate({ id: selectedBookmarkId });
                          }}
                        >
                          <BookmarkCheck size={16} strokeWidth={2.15} />
                        </Button>

                        <Button
                          tone="ghost"
                          size="icon"
                          className="new-page-bookmark-view__icon-action"
                          aria-label={
                            selectedBookmarkIsFinished
                              ? `Mark ${displayBookmark.title} as unfinished`
                              : `Mark ${displayBookmark.title} as finished`
                          }
                          title={selectedBookmarkIsFinished ? 'Mark unfinished' : 'Mark finished'}
                          disabled={!selectedBookmarkId || toggleFinishedMutation.isPending}
                          onClick={() => {
                            if (!selectedBookmarkId) {
                              return;
                            }

                            toggleFinishedMutation.mutate({ id: selectedBookmarkId });
                          }}
                        >
                          <Check size={16} strokeWidth={2.15} />
                        </Button>

                        <Button
                          tone="ghost"
                          size="icon"
                          className="new-page-bookmark-view__icon-action"
                          aria-label={`Share ${displayBookmark.title}`}
                          title="Share"
                          disabled={!selectedBookmarkSourceUrl}
                          onClick={async () => {
                            if (!selectedBookmarkSourceUrl) {
                              return;
                            }

                            if (
                              typeof navigator !== 'undefined' &&
                              typeof navigator.share === 'function'
                            ) {
                              try {
                                await navigator.share({
                                  title: displayBookmark.title,
                                  url: selectedBookmarkSourceUrl,
                                });
                                return;
                              } catch {
                                // Fall through to clipboard copy when share is unavailable or cancelled.
                              }
                            }

                            if (
                              typeof navigator !== 'undefined' &&
                              navigator.clipboard?.writeText
                            ) {
                              await navigator.clipboard.writeText(selectedBookmarkSourceUrl);
                            }
                          }}
                        >
                          <Share2 size={16} strokeWidth={2.15} />
                        </Button>

                        <Button
                          tone="ghost"
                          size="icon"
                          className="new-page-bookmark-view__icon-action"
                          aria-label={`More actions for ${displayBookmark.title}`}
                          title="More actions"
                          disabled
                        >
                          <Ellipsis size={16} strokeWidth={2.15} />
                        </Button>
                      </div>

                      {selectedBookmarkSourceUrl && bookmarkFabConfig ? (
                        <a
                          className={cn(
                            'new-page-bookmark-view__fab',
                            bookmarkFabConfig.toneClassName
                          )}
                          href={selectedBookmarkSourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={bookmarkFabConfig.label}
                          title={bookmarkFabConfig.label}
                        >
                          {bookmarkFabConfig.icon}
                        </a>
                      ) : null}
                    </div>

                    <section className="new-page-bookmark-view__section">
                      <p className="eyebrow">
                        {getBookmarkAboutLabel(displayBookmark.contentType)}
                      </p>
                      <p className="new-page-bookmark-view__summary">
                        {getLibrarySummary(displayBookmark)}
                      </p>
                    </section>

                    {selectedBookmarkDetailQuery.isLoading ? (
                      <p className="new-page-bookmark-view__loading-copy">
                        Refreshing bookmark detail.
                      </p>
                    ) : null}
                  </div>
                </article>
              ) : (
                <div className="new-page-bookmark-pane__empty">
                  <div>
                    <p className="eyebrow">Bookmark view</p>
                    <h2>Select a bookmark</h2>
                    <p>Pick something from the list and its detail view will open here.</p>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
