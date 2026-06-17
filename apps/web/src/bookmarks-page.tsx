import {
  Bookmark,
  CircleCheck,
  CirclePlus,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Home,
  Inbox,
  Library,
  Plus,
  Search,
  Settings,
  Share,
} from 'lucide-react';
import { FaSpotify } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { IoGlobeOutline, IoLogoYoutube, IoNewspaperOutline } from 'react-icons/io5';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { Colors, ContentColors, ProviderColors, getButtonMetrics } from '@zine/design-system';
import { CollectionSort, ContentType, Provider } from '@zine/shared';

import { Button, EmptyState, cn } from './components';
import { BookmarkTagsDialog } from './components/bookmark-tags-dialog';
import { ManualBookmarkDialog } from './components/manual-bookmark-dialog';
import { MobileTabBar } from './components/mobile-tab-bar';
import { FilterChip } from './components/ui/filter-chip';
import { AppWordmark } from './app-wordmark';
import {
  formatDuration,
  formatDisplayText,
  formatPlainText,
  isValidUrl,
  mapContentType,
  mapProvider,
} from './lib/format';
import type { LibraryItem, RouterOutputs } from './lib/router-types';
import { trpc } from './lib/trpc';
import { useMediaQuery } from './lib/use-media-query';

const CONTENT_FILTERS: Array<{ label: string; value?: ContentType }> = [
  { label: 'All' },
  { label: 'Articles', value: ContentType.ARTICLE },
  { label: 'Podcasts', value: ContentType.PODCAST },
  { label: 'Videos', value: ContentType.VIDEO },
  { label: 'Posts', value: ContentType.POST },
];
const CONTENT_FILTER_SEARCH_PARAM = 'contentType';
const COLLECTION_SEARCH_PARAM = 'collection';

const BOOKMARK_ACTION_BUTTON_SIZE = 56;
const BOOKMARK_ACTION_ICON_SIZE = 22;
type BookmarkActionButtonStyle = CSSProperties & {
  '--bookmark-action-bg': string;
  '--bookmark-action-border': string;
  '--bookmark-action-hover-bg': string;
  '--bookmark-action-hover-border': string;
  '--bookmark-action-active-bg': string;
  '--bookmark-action-active-border': string;
};

const bookmarkActionButtonStyle: BookmarkActionButtonStyle = {
  minHeight: BOOKMARK_ACTION_BUTTON_SIZE,
  width: BOOKMARK_ACTION_BUTTON_SIZE,
  borderRadius: getButtonMetrics('lg').borderRadius,
  backgroundColor: 'var(--bookmark-action-bg)',
  borderColor: 'var(--bookmark-action-border)',
  '--bookmark-action-bg': 'transparent',
  '--bookmark-action-border': 'transparent',
  '--bookmark-action-hover-bg': Colors.dark.surfaceRaised,
  '--bookmark-action-hover-border': Colors.dark.borderDefault,
  '--bookmark-action-active-bg': Colors.dark.cardHover,
  '--bookmark-action-active-border': Colors.dark.borderDefault,
};
const mobileBookmarkActionButtonStyle = {
  minHeight: 44,
  width: 44,
  borderRadius: 999,
} as const;

function getBookmarkProviderBadgeColor(provider: Provider | string) {
  switch (provider) {
    case Provider.SPOTIFY:
      return ProviderColors.spotify;
    case Provider.YOUTUBE:
      return ProviderColors.youtube;
    case Provider.GMAIL:
      return ProviderColors.gmail;
    case Provider.SUBSTACK:
      return ProviderColors.substack;
    case Provider.X:
      return ProviderColors.x;
    default:
      return ProviderColors.web;
  }
}

function getBookmarkContentBadgeColor(contentType: ContentType) {
  switch (contentType) {
    case ContentType.PODCAST:
      return ContentColors.podcast;
    case ContentType.VIDEO:
      return ContentColors.video;
    case ContentType.POST:
      return ContentColors.post;
    case ContentType.ARTICLE:
    default:
      return ContentColors.article;
  }
}

function BookmarkDetailBadge({
  label,
  backgroundColor,
}: {
  label: string;
  backgroundColor: string;
}) {
  return (
    <span className="new-page-bookmark-view__badge" style={{ backgroundColor }}>
      {label}
    </span>
  );
}

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

function parseBookmarkFilter(rawValue: string | null): ContentType | undefined {
  switch (rawValue?.toLowerCase()) {
    case 'article':
      return ContentType.ARTICLE;
    case 'podcast':
      return ContentType.PODCAST;
    case 'video':
      return ContentType.VIDEO;
    case 'post':
      return ContentType.POST;
    default:
      return undefined;
  }
}

function serializeBookmarkFilter(value: ContentType | undefined): string | null {
  switch (value) {
    case ContentType.ARTICLE:
      return 'article';
    case ContentType.PODCAST:
      return 'podcast';
    case ContentType.VIDEO:
      return 'video';
    case ContentType.POST:
      return 'post';
    default:
      return null;
  }
}

function buildBookmarksLocation(bookmarkId: string | null | undefined, search: string) {
  return {
    pathname: bookmarkId ? `/item/${bookmarkId}` : '/library/bookmarks',
    search,
  };
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
        icon: <FaSpotify size={22} aria-hidden="true" />,
        toneClassName: 'new-page-bookmark-view__fab--spotify',
      };
    case Provider.YOUTUBE:
      return {
        label: 'Open in YouTube',
        icon: <IoLogoYoutube size={22} aria-hidden="true" />,
        toneClassName: 'new-page-bookmark-view__fab--youtube',
      };
    case Provider.GMAIL:
      return {
        label: 'Open source newsletter',
        icon: <IoNewspaperOutline size={22} aria-hidden="true" />,
        toneClassName: 'new-page-bookmark-view__fab--gmail',
      };
    case Provider.SUBSTACK:
      return {
        label: 'Open in Substack',
        icon: <IoGlobeOutline size={22} aria-hidden="true" />,
        toneClassName: 'new-page-bookmark-view__fab--substack',
      };
    case Provider.X:
      return {
        label: 'Open on X',
        icon: <FaXTwitter size={20} aria-hidden="true" />,
        toneClassName: 'new-page-bookmark-view__fab--x',
      };
    default:
      return {
        label: 'Open source',
        icon: <IoGlobeOutline size={22} aria-hidden="true" />,
        toneClassName: 'new-page-bookmark-view__fab--default',
      };
  }
}

function useBookmarkDetailParallax(scrollKey: string | null) {
  const articleRef = useRef<HTMLElement | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const article = articleRef.current;
    const hero = heroRef.current;

    if (!article) {
      return;
    }

    if (!hero) {
      article.scrollTo({ top: 0, behavior: 'auto' });
      article.style.setProperty('--bookmark-hero-translate-y', '0px');
      article.style.setProperty('--bookmark-hero-opacity', '1');
      article.style.setProperty('--bookmark-hero-scale', '1');
      return;
    }

    let frame = 0;

    const syncParallax = () => {
      frame = 0;

      const heroHeight = Math.max(hero.offsetHeight, 1);
      const scrollOffset = article.scrollTop;
      const upwardOffset = Math.max(scrollOffset, 0);
      const pullOffset = Math.max(-scrollOffset, 0);
      const translateY = upwardOffset * 0.75 - pullOffset * 0.5;
      const opacity = Math.max(1 - upwardOffset / Math.max(heroHeight / 2, 1), 0);
      const scale = 1 + Math.min(pullOffset / heroHeight, 1);

      article.style.setProperty('--bookmark-hero-translate-y', `${translateY.toFixed(2)}px`);
      article.style.setProperty('--bookmark-hero-opacity', opacity.toFixed(3));
      article.style.setProperty('--bookmark-hero-scale', scale.toFixed(3));
    };

    const scheduleSync = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(syncParallax);
    };

    article.scrollTo({ top: 0, behavior: 'auto' });
    scheduleSync();

    article.addEventListener('scroll', scheduleSync, { passive: true });
    window.addEventListener('resize', scheduleSync);

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => scheduleSync());
    resizeObserver?.observe(hero);

    return () => {
      article.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      resizeObserver?.disconnect();

      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [scrollKey]);

  return { articleRef, heroRef };
}

function getManualBookmarkNotice(status: 'created' | 'already_bookmarked' | 'rebookmarked') {
  switch (status) {
    case 'already_bookmarked':
      return 'Already in your library';
    case 'rebookmarked':
      return 'Added back to library';
    case 'created':
    default:
      return 'Saved to library';
  }
}

const BOOKMARK_LOADING_ROW_COUNT = 6;

function BookmarkRowSkeleton() {
  return (
    <div
      className="bookmark-row bookmark-row--skeleton"
      aria-hidden="true"
      data-testid="bookmark-row-skeleton"
    >
      <div className="bookmark-row__cover bookmark-skeleton-block" />
      <div className="bookmark-row__info">
        <span
          className="bookmark-skeleton-line bookmark-skeleton-line--title"
          style={{ width: '78%' }}
        />
        <div className="bookmark-row__author">
          <span className="bookmark-skeleton-circle bookmark-skeleton-circle--row-avatar" />
          <span className="bookmark-skeleton-line" style={{ width: '42%' }} />
        </div>
      </div>
    </div>
  );
}

function BookmarkDetailSkeleton() {
  return (
    <div
      className="new-page-bookmark-view new-page-bookmark-view--pane new-page-bookmark-view--skeleton"
      aria-hidden="true"
      data-testid="bookmark-detail-skeleton"
    >
      <div className="new-page-bookmark-view__hero">
        <div className="new-page-bookmark-view__hero-placeholder new-page-bookmark-view__hero-placeholder--skeleton" />
      </div>

      <div className="new-page-bookmark-view__body">
        <div className="new-page-bookmark-view__header">
          <div className="new-page-bookmark-view__badges">
            <span className="bookmark-skeleton-pill" />
            <span className="bookmark-skeleton-pill" style={{ width: '4rem' }} />
          </div>

          <span
            className="bookmark-skeleton-line bookmark-skeleton-line--display"
            style={{ width: '74%' }}
          />
          <span
            className="bookmark-skeleton-line bookmark-skeleton-line--display"
            style={{ width: '56%' }}
          />
        </div>

        <div className="new-page-bookmark-view__creator-block">
          <div className="new-page-bookmark-view__creator">
            <span className="bookmark-skeleton-circle bookmark-skeleton-circle--detail-avatar" />
            <div className="new-page-bookmark-view__creator-copy new-page-bookmark-view__creator-copy--skeleton">
              <span className="bookmark-skeleton-line" style={{ width: '10rem' }} />
            </div>
          </div>
        </div>

        <div className="new-page-bookmark-view__meta new-page-bookmark-view__meta--skeleton">
          <span className="bookmark-skeleton-line" style={{ width: '5rem' }} />
          <span className="bookmark-skeleton-line" style={{ width: '4.5rem' }} />
          <span className="bookmark-skeleton-line" style={{ width: '3.75rem' }} />
        </div>

        <div className="new-page-bookmark-view__actions">
          <div className="new-page-bookmark-view__actions-left">
            {Array.from({ length: 4 }, (_, index) => (
              <span key={index} className="bookmark-skeleton-action" />
            ))}
          </div>

          <span className="bookmark-skeleton-circle bookmark-skeleton-circle--fab" />
        </div>

        <section className="new-page-bookmark-view__section">
          <span className="bookmark-skeleton-line" style={{ width: '7rem', height: '0.7rem' }} />
          <span className="bookmark-skeleton-line bookmark-skeleton-line--summary" />
          <span
            className="bookmark-skeleton-line bookmark-skeleton-line--summary"
            style={{ width: '84%' }}
          />
          <span
            className="bookmark-skeleton-line bookmark-skeleton-line--summary"
            style={{ width: '68%' }}
          />
        </section>
      </div>
    </div>
  );
}

export function BookmarksPage() {
  const utils = trpc.useUtils();
  const navigate = useNavigate();
  const currentLocation = useLocation();
  const { bookmarkId } = useParams<{ bookmarkId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualBookmarkOpen, setManualBookmarkOpen] = useState(false);
  const [manualBookmarkNotice, setManualBookmarkNotice] = useState<string | null>(null);
  const [bookmarkTagsOpen, setBookmarkTagsOpen] = useState(false);
  const isPhoneLayout = useMediaQuery('(max-width: 700px)');
  const bookmarkFilter = parseBookmarkFilter(searchParams.get(CONTENT_FILTER_SEARCH_PARAM));
  const activeCollectionId = searchParams.get(COLLECTION_SEARCH_PARAM) || null;
  const bookmarkSearch = searchParams.toString();
  const bookmarkSearchString = bookmarkSearch ? `?${bookmarkSearch}` : '';
  const collectionsQuery = trpc.collections.list.useQuery();
  const createCollectionMutation = trpc.collections.create.useMutation({
    onSuccess: (collection) => {
      void utils.collections.list.invalidate();
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete(CONTENT_FILTER_SEARCH_PARAM);
      nextSearchParams.set(COLLECTION_SEARCH_PARAM, collection.id);
      setSearchParams(nextSearchParams);
    },
  });

  const bookmarksQuery = trpc.items.library.useQuery(
    {
      limit: 50,
      filter: {},
    },
    {
      placeholderData: (previousData) => previousData,
    }
  );
  const collectionItemsQuery = trpc.collections.items.useQuery(
    {
      id: activeCollectionId ?? '',
      limit: 50,
    },
    {
      enabled: Boolean(activeCollectionId),
      placeholderData: (previousData) => previousData,
    }
  );
  const activeItemsQuery = activeCollectionId ? collectionItemsQuery : bookmarksQuery;
  const bookmarks = activeItemsQuery.data?.items ?? [];
  const filteredBookmarks = useMemo(
    () =>
      bookmarkFilter && !activeCollectionId
        ? bookmarks.filter((item) => item.contentType === bookmarkFilter)
        : bookmarks,
    [activeCollectionId, bookmarkFilter, bookmarks]
  );
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

    navigate(buildBookmarksLocation(null, bookmarkSearchString), { replace: true });
  }, [
    bookmarkSearchString,
    bookmarkId,
    navigate,
    selectedBookmark,
    selectedBookmarkDetailQuery.data,
    selectedBookmarkDetailQuery.error,
    selectedBookmarkDetailQuery.isLoading,
  ]);

  const displayBookmark = selectedBookmarkDetailQuery.data ?? selectedBookmark;
  const displayBookmarkTitle = displayBookmark ? formatDisplayText(displayBookmark.title) : '';
  trpc.items.getEnrichment.useQuery(
    { id: selectedBookmarkId ?? '' },
    { enabled: Boolean(selectedBookmarkId) }
  );
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
  const isPhonePostView = isPhoneLayout && displayBookmark?.contentType === ContentType.POST;
  const isPhoneDetailView = isPhoneLayout && Boolean(selectedBookmarkId);
  const bookmarkPlainSummary = displayBookmark ? formatPlainText(displayBookmark.summary) : null;
  const bookmarkPostHandle =
    displayBookmark?.provider === Provider.X
      ? (selectedBookmarkCreatorQuery.data?.handle ?? extractXHandle(displayBookmark.canonicalUrl))
      : null;
  const bookmarkPostTimestamp =
    displayBookmark?.publishedAt ?? displayBookmark?.bookmarkedAt ?? displayBookmark?.ingestedAt;
  const bookmarkHeroImageUrl = displayBookmark
    ? isPhoneLayout
      ? displayBookmark.thumbnailUrl
      : (displayBookmark.thumbnailUrl ?? displayBookmark.creatorImageUrl)
    : null;
  const showBookmarkHero = !displayBookmark
    ? false
    : !isPhoneLayout || Boolean(displayBookmark.thumbnailUrl);
  const showHeroBadges = isPhoneLayout && showBookmarkHero && !isPhonePostView;
  const showHeaderBadges =
    Boolean(displayBookmark) && (!isPhoneLayout || !showBookmarkHero || isPhonePostView);
  const bookmarkFabConfig = displayBookmark ? getBookmarkFabConfig(displayBookmark.provider) : null;
  const detailActionButtonStyle = isPhoneLayout
    ? mobileBookmarkActionButtonStyle
    : bookmarkActionButtonStyle;
  const { articleRef: bookmarkDetailRef, heroRef: bookmarkHeroRef } = useBookmarkDetailParallax(
    displayBookmark?.id ?? null
  );
  const bookmarkFilterLabel = CONTENT_FILTERS.find(
    (filter) => filter.value === bookmarkFilter
  )?.label;
  const collections = collectionsQuery.data?.collections ?? [];
  const libraryIsEmpty = filteredBookmarks.length === 0;
  const hasBookmarkData = Boolean(activeItemsQuery.data);
  const bookmarksAreRefreshing = activeItemsQuery.isFetching;
  const showInitialBookmarksLoadingState = !hasBookmarkData && activeItemsQuery.isLoading;
  const showBookmarkDetailSkeleton =
    showInitialBookmarksLoadingState ||
    Boolean(selectedBookmarkId && !displayBookmark && selectedBookmarkDetailQuery.isLoading);
  const showBookmarkListPane = !isPhoneLayout || !selectedBookmarkId;
  const showBookmarkDetailPane = !isPhoneLayout || Boolean(selectedBookmarkId);
  const showMobileTabBar = isPhoneLayout && !selectedBookmarkId;
  const refreshNotice = bookmarksQuery.error
    ? (bookmarksQuery.error.message ?? 'Could not refresh bookmarks.')
    : bookmarksAreRefreshing
      ? 'Refreshing bookmarks...'
      : null;
  const headerNotice = manualBookmarkNotice ?? refreshNotice;
  const showMobileHeader = Boolean(headerNotice);
  const showInsetHeader = !isPhoneLayout || showMobileHeader;

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
  const markOpenedMutation = trpc.items.markOpened.useMutation({
    onSuccess: () => {
      if (!selectedBookmarkId) {
        return;
      }

      void Promise.all([
        utils.items.get.invalidate({ id: selectedBookmarkId }),
        utils.items.home.invalidate(),
      ]);
    },
  });

  const handleCreateCollection = useCallback(() => {
    if (!bookmarkFilter || createCollectionMutation.isPending) {
      return;
    }

    const label = CONTENT_FILTERS.find((filter) => filter.value === bookmarkFilter)?.label;
    createCollectionMutation.mutate({
      name: label ? `${label} collection` : 'Smart collection',
      description: null,
      rules: {
        contentTypes: [bookmarkFilter],
        isFinished: false,
      },
      sort: CollectionSort.NEWEST_SAVED,
    });
  }, [bookmarkFilter, createCollectionMutation]);

  useEffect(() => {
    if (!manualBookmarkNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setManualBookmarkNotice(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [manualBookmarkNotice]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const className = 'mobile-bookmarks-scroll-lock';

    if (isPhoneLayout) {
      document.documentElement.classList.add(className);
      document.body.classList.add(className);
    } else {
      document.documentElement.classList.remove(className);
      document.body.classList.remove(className);
    }

    return () => {
      document.documentElement.classList.remove(className);
      document.body.classList.remove(className);
    };
  }, [isPhoneLayout]);

  const handleManualBookmarkSaved = useCallback(
    (result: { userItemId: string; status: 'created' | 'already_bookmarked' | 'rebookmarked' }) => {
      setManualBookmarkOpen(false);
      setManualBookmarkNotice(getManualBookmarkNotice(result.status));

      void Promise.all([
        utils.items.library.invalidate(),
        utils.items.home.invalidate(),
        utils.items.get.invalidate({ id: result.userItemId }),
      ]);

      navigate(buildBookmarksLocation(result.userItemId, bookmarkSearchString));
    },
    [bookmarkSearchString, navigate, utils.items.get, utils.items.home, utils.items.library]
  );

  if (activeItemsQuery.error && !hasBookmarkData) {
    return (
      <main className={cn('new-page-screen', isPhoneLayout && 'new-page-screen--phone')}>
        <EmptyState
          title="Could not load bookmarks"
          message={activeItemsQuery.error.message ?? 'Please refresh and try again.'}
        />
        {showMobileTabBar ? <MobileTabBar /> : null}
      </main>
    );
  }

  return (
    <main className={cn('new-page-screen', isPhoneLayout && 'new-page-screen--phone')}>
      {!isPhoneLayout ? (
        <div className="new-page-sidebar">
          <div className="new-page-sidebar__rail">
            <div className="new-page-sidebar__rail-top">
              <div className="new-page-sidebar__rail-header">
                <Link to="/home" className="new-page-sidebar__brand" aria-label="Go to home">
                  <div className="new-page-sidebar__brand-icon">
                    <AppWordmark compact />
                  </div>
                </Link>
              </div>

              <nav className="new-page-sidebar__rail-nav" aria-label="Primary">
                <NavLink
                  to="/home"
                  end
                  className={({ isActive }) =>
                    cn(
                      'new-page-sidebar__rail-btn',
                      isActive && 'new-page-sidebar__rail-btn--active'
                    )
                  }
                  aria-label="Home"
                  title="Home"
                >
                  <Home size={18} strokeWidth={2.15} />
                  <span>Home</span>
                </NavLink>
                <NavLink
                  to="/inbox"
                  className={({ isActive }) =>
                    cn(
                      'new-page-sidebar__rail-btn',
                      isActive && 'new-page-sidebar__rail-btn--active'
                    )
                  }
                  aria-label="Inbox"
                  title="Inbox"
                >
                  <Inbox size={18} strokeWidth={2.15} />
                  <span>Inbox</span>
                </NavLink>
                <NavLink
                  to="/search"
                  className={({ isActive }) =>
                    cn(
                      'new-page-sidebar__rail-btn',
                      isActive && 'new-page-sidebar__rail-btn--active'
                    )
                  }
                  aria-label="Search"
                  title="Search"
                >
                  <Search size={18} strokeWidth={2.15} />
                  <span>Search</span>
                </NavLink>
                <NavLink
                  to="/library/bookmarks"
                  className={() =>
                    cn(
                      'new-page-sidebar__rail-btn',
                      (currentLocation.pathname.startsWith('/library') ||
                        currentLocation.pathname.startsWith('/item/')) &&
                        'new-page-sidebar__rail-btn--active'
                    )
                  }
                  aria-label="Library"
                  title="Library"
                >
                  <Library size={18} strokeWidth={2.15} />
                  <span>Library</span>
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
      ) : null}

      {showMobileTabBar ? <MobileTabBar /> : null}

      <div className="new-page-inset">
        {showInsetHeader ? (
          <header className="new-page-inset__header">
            {!isPhoneLayout ? (
              <nav className="new-page-breadcrumb" aria-label="Current page location">
                <span>Library</span>
                <ChevronRight size={14} strokeWidth={2.2} />
                {displayBookmark ? (
                  <>
                    <Link
                      to={buildBookmarksLocation(null, bookmarkSearchString)}
                      className="new-page-breadcrumb__link"
                    >
                      Bookmarks
                    </Link>
                    <ChevronRight size={14} strokeWidth={2.2} />
                    <strong className="new-page-breadcrumb__title">{displayBookmarkTitle}</strong>
                  </>
                ) : (
                  <strong>Bookmarks</strong>
                )}
              </nav>
            ) : null}

            <div className="new-page-inset__header-actions">
              {headerNotice ? (
                <span className="new-page-inset__header-note">{headerNotice}</span>
              ) : null}

              {!isPhoneLayout ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label="Add bookmark"
                  style={{
                    backgroundColor: Colors.dark.overlayForeground,
                    color: Colors.dark.accentForeground,
                  }}
                  onClick={() => setManualBookmarkOpen(true)}
                >
                  <Plus size={16} strokeWidth={2.2} />
                </Button>
              ) : null}
            </div>
          </header>
        ) : null}

        <div className="new-page-inset__body">
          {showBookmarkListPane ? (
            <aside className="new-page-column-card">
              <div className="new-page-column-card__header">
                <h2 className="new-page-column-card__title">Bookmarks</h2>
                <div className="new-page-column-card__chips">
                  {collections.map((collection) => (
                    <FilterChip
                      key={collection.id}
                      label={collection.name}
                      size="small"
                      selected={activeCollectionId === collection.id}
                      tone="default"
                      onClick={() => {
                        const nextSearchParams = new URLSearchParams(searchParams);
                        nextSearchParams.delete(CONTENT_FILTER_SEARCH_PARAM);

                        if (activeCollectionId === collection.id) {
                          nextSearchParams.delete(COLLECTION_SEARCH_PARAM);
                        } else {
                          nextSearchParams.set(COLLECTION_SEARCH_PARAM, collection.id);
                        }

                        setSearchParams(nextSearchParams);
                      }}
                    />
                  ))}
                  {CONTENT_FILTERS.map((filter) => (
                    <FilterChip
                      key={filter.label}
                      label={filter.label}
                      size="small"
                      selected={bookmarkFilter === filter.value}
                      tone={filter.value ?? 'default'}
                      onClick={() => {
                        const nextSearchParams = new URLSearchParams(searchParams);
                        const nextFilter = serializeBookmarkFilter(filter.value);
                        nextSearchParams.delete(COLLECTION_SEARCH_PARAM);

                        if (nextFilter) {
                          nextSearchParams.set(CONTENT_FILTER_SEARCH_PARAM, nextFilter);
                        } else {
                          nextSearchParams.delete(CONTENT_FILTER_SEARCH_PARAM);
                        }

                        setSearchParams(nextSearchParams);
                      }}
                    />
                  ))}
                </div>
                {bookmarkFilter && !activeCollectionId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleCreateCollection}
                    disabled={createCollectionMutation.isPending}
                  >
                    <CirclePlus size={14} strokeWidth={2.2} />
                    {createCollectionMutation.isPending ? 'Saving' : 'Save as collection'}
                  </Button>
                ) : null}
              </div>

              <div
                className="new-page-column-card__list"
                aria-busy={showInitialBookmarksLoadingState}
              >
                {showInitialBookmarksLoadingState ? (
                  <div
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    style={{
                      position: 'absolute',
                      width: '1px',
                      height: '1px',
                      padding: 0,
                      margin: '-1px',
                      overflow: 'hidden',
                      clip: 'rect(0, 0, 0, 0)',
                      whiteSpace: 'nowrap',
                      border: 0,
                    }}
                  >
                    Loading bookmarks
                  </div>
                ) : null}

                {showInitialBookmarksLoadingState ? (
                  Array.from({ length: BOOKMARK_LOADING_ROW_COUNT }, (_, index) => (
                    <BookmarkRowSkeleton key={index} />
                  ))
                ) : libraryIsEmpty ? (
                  <p className="new-page-column-card__empty">
                    {bookmarks.length === 0
                      ? activeCollectionId
                        ? 'This collection has no matching bookmarks yet.'
                        : 'Add a bookmark to start building your library.'
                      : bookmarkFilterLabel
                        ? `No ${bookmarkFilterLabel.toLowerCase()} bookmarks match this filter.`
                        : 'No bookmarks match this filter.'}
                  </p>
                ) : (
                  filteredBookmarks.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={selectedBookmark?.id === item.id}
                      className={cn(
                        'bookmark-row',
                        selectedBookmark?.id === item.id && 'bookmark-row--selected'
                      )}
                      onClick={() =>
                        navigate(
                          buildBookmarksLocation(
                            selectedBookmark?.id === item.id ? null : item.id,
                            bookmarkSearchString
                          )
                        )
                      }
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
                        <span className="bookmark-row__title">{formatDisplayText(item.title)}</span>
                        <div className="bookmark-row__author">
                          {item.creatorImageUrl ? (
                            <img
                              className="bookmark-row__avatar"
                              src={item.creatorImageUrl}
                              alt=""
                            />
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
                  ))
                )}
              </div>
            </aside>
          ) : null}

          {showBookmarkDetailPane ? (
            <div className="new-page-inset__content">
              <section
                className="new-page-column-card new-page-bookmark-pane"
                aria-busy={showBookmarkDetailSkeleton}
              >
                {showBookmarkDetailSkeleton ? (
                  <BookmarkDetailSkeleton />
                ) : displayBookmark ? (
                  <article
                    ref={bookmarkDetailRef}
                    className={cn(
                      'new-page-bookmark-view new-page-bookmark-view--pane',
                      isPhoneLayout && 'new-page-bookmark-view--phone',
                      isPhoneDetailView && 'new-page-bookmark-view--phone-detail',
                      !showBookmarkHero && 'new-page-bookmark-view--no-hero',
                      displayBookmark.contentType === ContentType.POST &&
                        'new-page-bookmark-view--post'
                    )}
                  >
                    {isPhoneLayout ? (
                      <button
                        type="button"
                        className="new-page-bookmark-view__back"
                        onClick={() => navigate(buildBookmarksLocation(null, bookmarkSearchString))}
                        aria-label="Back to bookmarks list"
                        title="Back"
                      >
                        <ChevronLeft size={20} strokeWidth={2.4} />
                      </button>
                    ) : null}

                    {showBookmarkHero ? (
                      <div ref={bookmarkHeroRef} className="new-page-bookmark-view__hero">
                        {bookmarkHeroImageUrl ? (
                          <img src={bookmarkHeroImageUrl} alt="" />
                        ) : (
                          <div className="new-page-bookmark-view__hero-placeholder" />
                        )}

                        {showHeroBadges ? (
                          <div className="new-page-bookmark-view__hero-badges">
                            <BookmarkDetailBadge
                              label={mapProvider(displayBookmark.provider)}
                              backgroundColor={getBookmarkProviderBadgeColor(
                                displayBookmark.provider
                              )}
                            />
                            <BookmarkDetailBadge
                              label={mapContentType(displayBookmark.contentType)}
                              backgroundColor={getBookmarkContentBadgeColor(
                                displayBookmark.contentType
                              )}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="new-page-bookmark-view__body">
                      <div className="new-page-bookmark-view__header">
                        {showHeaderBadges ? (
                          <div className="new-page-bookmark-view__badges">
                            <BookmarkDetailBadge
                              label={mapProvider(displayBookmark.provider)}
                              backgroundColor={getBookmarkProviderBadgeColor(
                                displayBookmark.provider
                              )}
                            />
                            <BookmarkDetailBadge
                              label={mapContentType(displayBookmark.contentType)}
                              backgroundColor={getBookmarkContentBadgeColor(
                                displayBookmark.contentType
                              )}
                            />
                          </div>
                        ) : null}

                        {!isPhonePostView ? (
                          <h2 className="new-page-bookmark-view__title">{displayBookmarkTitle}</h2>
                        ) : null}
                      </div>
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

                          <ChevronRight
                            className="new-page-bookmark-view__creator-chevron"
                            size={14}
                            strokeWidth={2.2}
                            aria-hidden="true"
                          />
                        </div>
                      </div>

                      {selectedBookmarkMeta.length > 0 ? (
                        <div
                          className="new-page-bookmark-view__meta"
                          aria-label="Bookmark metadata"
                        >
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
                            style={detailActionButtonStyle}
                            aria-label={`Remove bookmark for ${displayBookmarkTitle}`}
                            title="Remove bookmark"
                            disabled={!selectedBookmarkId || unbookmarkMutation.isPending}
                            onClick={() => {
                              if (!selectedBookmarkId) {
                                return;
                              }

                              unbookmarkMutation.mutate({ id: selectedBookmarkId });
                            }}
                          >
                            <Bookmark
                              className={cn(
                                'new-page-bookmark-view__bookmark-icon',
                                selectedBookmarkIsFinished &&
                                  'new-page-bookmark-view__bookmark-icon--finished'
                              )}
                              size={BOOKMARK_ACTION_ICON_SIZE}
                              strokeWidth={1.85}
                              fill="currentColor"
                            />
                          </Button>

                          <Button
                            tone="ghost"
                            size="icon"
                            className="new-page-bookmark-view__icon-action"
                            style={detailActionButtonStyle}
                            aria-label={
                              selectedBookmarkIsFinished
                                ? `Mark ${displayBookmarkTitle} as unfinished`
                                : `Mark ${displayBookmarkTitle} as finished`
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
                            <CircleCheck size={BOOKMARK_ACTION_ICON_SIZE} strokeWidth={2.15} />
                          </Button>

                          <Button
                            tone="ghost"
                            size="icon"
                            className="new-page-bookmark-view__icon-action"
                            style={detailActionButtonStyle}
                            aria-label={`Manage tags for ${displayBookmarkTitle}`}
                            title="Manage tags"
                            disabled={!selectedBookmarkId}
                            onClick={() => setBookmarkTagsOpen(true)}
                          >
                            <CirclePlus size={BOOKMARK_ACTION_ICON_SIZE} strokeWidth={2.15} />
                          </Button>

                          <Button
                            tone="ghost"
                            size="icon"
                            className="new-page-bookmark-view__icon-action"
                            style={detailActionButtonStyle}
                            aria-label={`Share ${displayBookmarkTitle}`}
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
                                    title: displayBookmarkTitle,
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
                            <Share size={BOOKMARK_ACTION_ICON_SIZE} strokeWidth={2.15} />
                          </Button>

                          <Button
                            tone="ghost"
                            size="icon"
                            className="new-page-bookmark-view__icon-action"
                            style={detailActionButtonStyle}
                            aria-label={`More actions for ${displayBookmarkTitle}`}
                            title="More actions"
                          >
                            <Ellipsis size={BOOKMARK_ACTION_ICON_SIZE} strokeWidth={2.15} />
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
                            onClick={() => {
                              if (!selectedBookmarkId) {
                                return;
                              }

                              markOpenedMutation.mutate({ id: selectedBookmarkId });
                            }}
                          >
                            {bookmarkFabConfig.icon}
                          </a>
                        ) : null}
                      </div>

                      {isPhonePostView ? (
                        <section
                          className="new-page-bookmark-view__post"
                          aria-label="X post content"
                        >
                          <div className="new-page-bookmark-view__post-row">
                            {displayBookmark.creatorImageUrl ? (
                              <img
                                className="new-page-bookmark-view__post-avatar"
                                src={displayBookmark.creatorImageUrl}
                                alt=""
                              />
                            ) : (
                              <div className="new-page-bookmark-view__post-avatar new-page-bookmark-view__post-avatar--fallback">
                                {getLibraryCreatorLabel(displayBookmark).slice(0, 1).toUpperCase()}
                              </div>
                            )}

                            <div className="new-page-bookmark-view__post-copy">
                              <div className="new-page-bookmark-view__post-author-row">
                                <strong className="new-page-bookmark-view__post-author">
                                  {getLibraryCreatorLabel(displayBookmark)}
                                </strong>
                                {bookmarkPostHandle ? (
                                  <span className="new-page-bookmark-view__post-handle">
                                    @{bookmarkPostHandle}
                                  </span>
                                ) : null}
                                {bookmarkPostTimestamp ? (
                                  <span className="new-page-bookmark-view__post-time">
                                    · {formatBookmarkRelativeTime(bookmarkPostTimestamp)}
                                  </span>
                                ) : null}
                              </div>

                              <p className="new-page-bookmark-view__post-text">
                                {displayBookmarkTitle}
                              </p>

                              {bookmarkPlainSummary &&
                              bookmarkPlainSummary !== displayBookmarkTitle ? (
                                <p className="new-page-bookmark-view__post-text new-page-bookmark-view__post-text--secondary">
                                  {bookmarkPlainSummary}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </section>
                      ) : (
                        <section className="new-page-bookmark-view__section">
                          <p className="eyebrow new-page-bookmark-view__section-label">
                            {getBookmarkAboutLabel(displayBookmark.contentType)}
                          </p>
                          <p className="new-page-bookmark-view__summary">
                            {getLibrarySummary(displayBookmark)}
                          </p>
                        </section>
                      )}

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
                      <p className="eyebrow">{libraryIsEmpty ? 'Your library' : 'Bookmark view'}</p>
                      <h2>{libraryIsEmpty ? 'Add your first bookmark' : 'Select a bookmark'}</h2>
                      <p>
                        {libraryIsEmpty
                          ? 'Use the add button in the header to save a link manually and start this shelf.'
                          : 'Pick something from the list and its detail view will open here.'}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </div>

      <ManualBookmarkDialog
        open={manualBookmarkOpen}
        onOpenChange={setManualBookmarkOpen}
        onSaved={handleManualBookmarkSaved}
      />
      {displayBookmark ? (
        <BookmarkTagsDialog
          bookmark={displayBookmark}
          open={bookmarkTagsOpen}
          onOpenChange={setBookmarkTagsOpen}
        />
      ) : null}
    </main>
  );
}
