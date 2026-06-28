import {
  BookmarkCheck,
  ChevronRight,
  Folder,
  Home,
  Inbox,
  Library,
  Rss,
  Search,
  Settings,
  UserRound,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';

import { ContentType, type CollectionRules } from '@zine/shared';

import { AppWordmark } from './app-wordmark';
import { Badge, Button, EmptyState, Surface, cn } from './components';
import { ItemCardView, type ItemCardData } from './components/item-card';
import { MobileTabBar } from './components/mobile-tab-bar';
import { FilterChip } from './components/ui/filter-chip';
import { formatDisplayText, mapProvider } from './lib/format';
import type { LibraryItem } from './lib/router-types';
import { trpc } from './lib/trpc';

type WebContentFilter = {
  label: string;
  value?: ContentType;
  slug?: string;
};

const CONTENT_FILTERS: WebContentFilter[] = [
  { label: 'All' },
  { label: 'Articles', value: ContentType.ARTICLE, slug: 'article' },
  { label: 'Podcasts', value: ContentType.PODCAST, slug: 'podcast' },
  { label: 'Videos', value: ContentType.VIDEO, slug: 'video' },
  { label: 'Posts', value: ContentType.POST, slug: 'post' },
];

const LIBRARY_OBJECTS = [
  { label: 'Bookmarks', path: '/library/bookmarks', icon: BookmarkCheck },
  { label: 'People', path: '/library/people', icon: UserRound },
  { label: 'Sources', path: '/library/sources', icon: Rss },
  { label: 'Collections', path: '/library/collections', icon: Folder },
] as const;

function parseContentFilter(value: string | null): ContentType | undefined {
  return CONTENT_FILTERS.find((filter) => filter.slug === value)?.value;
}

function serializeContentFilter(value: ContentType | undefined): string | null {
  return CONTENT_FILTERS.find((filter) => filter.value === value)?.slug ?? null;
}

function toItemCardData(
  item: Partial<LibraryItem> & Pick<LibraryItem, 'id' | 'title'>
): ItemCardData {
  return {
    id: item.id,
    title: formatDisplayText(item.title),
    creator: item.creator ?? item.publisher ?? 'Unknown creator',
    creatorImageUrl: item.creatorImageUrl ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: item.contentType ?? ContentType.ARTICLE,
    provider: item.provider ?? 'WEB',
    duration: item.duration ?? null,
    readingTimeMinutes: item.readingTimeMinutes ?? null,
    publisher: item.publisher ?? null,
    summary: item.summary ?? null,
    canonicalUrl: item.canonicalUrl ?? null,
    lastOpenedAt: item.lastOpenedAt ?? null,
    bookmarkedAt: item.bookmarkedAt ?? null,
    publishedAt: item.publishedAt ?? null,
    ingestedAt: item.ingestedAt ?? null,
  };
}

function useContentTypeSearchParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = parseContentFilter(searchParams.get('contentType'));

  const setActiveFilter = useCallback(
    (nextFilter: ContentType | undefined) => {
      const next = new URLSearchParams(searchParams);
      const serialized = serializeContentFilter(nextFilter);

      if (serialized) {
        next.set('contentType', serialized);
      } else {
        next.delete('contentType');
      }

      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  return { activeFilter, setActiveFilter };
}

function ContentFilterBar({
  activeFilter,
  onChange,
}: {
  activeFilter?: ContentType;
  onChange: (filter: ContentType | undefined) => void;
}) {
  return (
    <div className="web-page-chip-row" role="toolbar" aria-label="Content filters">
      {CONTENT_FILTERS.map((filter) => (
        <FilterChip
          key={filter.label}
          label={filter.label}
          selected={activeFilter === filter.value}
          tone={filter.value ?? 'default'}
          size="small"
          onClick={() => onChange(filter.value)}
        />
      ))}
    </div>
  );
}

function PrimaryNav() {
  const location = useLocation();
  const libraryActive =
    location.pathname.startsWith('/library') || location.pathname.startsWith('/item/');

  return (
    <>
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
            className={({ isActive }) =>
              cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
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
              cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
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
              cn('new-page-sidebar__rail-btn', isActive && 'new-page-sidebar__rail-btn--active')
            }
            aria-label="Search"
            title="Search"
          >
            <Search size={18} strokeWidth={2.15} />
            <span>Search</span>
          </NavLink>
          <NavLink
            to="/library/bookmarks"
            className={cn(
              'new-page-sidebar__rail-btn',
              libraryActive && 'new-page-sidebar__rail-btn--active'
            )}
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
    </>
  );
}

function WebPageFrame({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="new-page-screen web-page-screen">
      <div className="new-page-sidebar">
        <div className="new-page-sidebar__rail">
          <PrimaryNav />
        </div>
      </div>

      <MobileTabBar />

      <div className="new-page-inset web-page-inset">
        <header className="new-page-inset__header web-page-header">
          <nav className="new-page-breadcrumb" aria-label="Current page location">
            <span>{eyebrow}</span>
            <ChevronRight size={14} strokeWidth={2.2} />
            <strong>{title}</strong>
          </nav>
          {actions ? <div className="new-page-inset__header-actions">{actions}</div> : null}
        </header>
        <div className="new-page-inset__body web-page-body">{children}</div>
      </div>
    </main>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="web-section">
      <div className="web-section__header">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function InlineState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return <EmptyState title={title} message={message} action={action} />;
}

function ItemRail({
  items,
  shape = 'stack',
}: {
  items: ItemCardData[];
  shape?: 'row' | 'stack' | 'feature';
}) {
  if (items.length === 0) {
    return null;
  }

  const railClassName = shape === 'feature' ? 'web-rail web-rail--feature' : 'web-rail';

  return (
    <div className={shape === 'row' ? 'web-list' : railClassName}>
      {items.map((item) => (
        <ItemCardView key={item.id} item={item} shape={shape} />
      ))}
    </div>
  );
}

export function HomePage() {
  const { activeFilter, setActiveFilter } = useContentTypeSearchParam();
  const homeQuery = trpc.items.home.useQuery(
    activeFilter ? { filter: { contentType: activeFilter } } : undefined
  );
  const inboxQuery = trpc.items.inbox.useQuery({
    limit: 4,
    filter: activeFilter ? { contentType: activeFilter } : {},
  });

  const homeData = homeQuery.data;
  const jumpBackIn = useMemo(
    () => (homeData?.jumpBackIn ?? []).map(toItemCardData),
    [homeData?.jumpBackIn]
  );
  const recent = useMemo(
    () => (homeData?.recentBookmarks ?? []).map(toItemCardData),
    [homeData?.recentBookmarks]
  );
  const inboxItems = useMemo(
    () => (inboxQuery.data?.items ?? []).map(toItemCardData),
    [inboxQuery.data?.items]
  );
  const contentSections = [
    { title: 'Podcasts', items: homeData?.byContentType.podcasts ?? [] },
    { title: 'Articles', items: homeData?.byContentType.articles ?? [] },
    { title: 'Videos', items: homeData?.byContentType.videos ?? [] },
  ].map((section) => ({
    ...section,
    items: section.items.map(toItemCardData),
  }));
  const customCollections = (homeData?.customCollections ?? []).map((collection) => ({
    ...collection,
    items: collection.items.map(toItemCardData),
  }));
  const isEmpty =
    !homeQuery.isLoading &&
    !homeQuery.error &&
    jumpBackIn.length === 0 &&
    recent.length === 0 &&
    inboxItems.length === 0 &&
    contentSections.every((section) => section.items.length === 0) &&
    customCollections.every((section) => section.items.length === 0);

  return (
    <WebPageFrame
      eyebrow="Today"
      title="Home"
      actions={<ContentFilterBar activeFilter={activeFilter} onChange={setActiveFilter} />}
    >
      <div className="web-page-scroll">
        {homeQuery.error ? (
          <InlineState
            title="Could not load home"
            message={homeQuery.error.message ?? 'Refresh and try again.'}
          />
        ) : homeQuery.isLoading ? (
          <div className="web-skeleton-grid" aria-label="Loading home">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="new-page-column-card__skeleton" />
            ))}
          </div>
        ) : isEmpty ? (
          <InlineState
            title="Your home is ready when you are"
            message="Save a few items or connect sources, then Zine will organize them here."
            action={
              <Button asChild>
                <Link to="/welcome">Connect sources</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Section title="Jump Back In">
              <ItemRail items={jumpBackIn.slice(0, 6)} shape="feature" />
            </Section>
            <Section
              title="Recently Bookmarked"
              action={<Link to="/library/bookmarks">View all</Link>}
            >
              <ItemRail items={recent.slice(0, 8)} />
            </Section>
            <Section title="Inbox" action={<Link to="/inbox">Review inbox</Link>}>
              <ItemRail items={inboxItems} shape="row" />
            </Section>
            {contentSections.map((section) =>
              section.items.length > 0 ? (
                <Section key={section.title} title={section.title}>
                  <ItemRail items={section.items.slice(0, 8)} />
                </Section>
              ) : null
            )}
            {customCollections.map((section) =>
              section.items.length > 0 ? (
                <Section key={section.collectionId} title={section.title}>
                  <ItemRail items={section.items.slice(0, 8)} />
                </Section>
              ) : null
            )}
          </>
        )}
      </div>
    </WebPageFrame>
  );
}

export function InboxPage() {
  const utils = trpc.useUtils();
  const { activeFilter, setActiveFilter } = useContentTypeSearchParam();
  const [cursor, setCursor] = useState<string | undefined>();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const inboxQuery = trpc.items.inbox.useQuery({
    limit: 20,
    cursor,
    filter: activeFilter ? { contentType: activeFilter } : {},
  });
  const bookmarkMutation = trpc.items.bookmark.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.items.inbox.invalidate(),
        utils.items.library.invalidate(),
        utils.items.home.invalidate(),
      ]);
    },
  });
  const archiveMutation = trpc.items.archive.useMutation({
    onSuccess: () => {
      void utils.items.inbox.invalidate();
    },
  });

  useEffect(() => {
    setCursor(undefined);
    setItems([]);
    setDismissedIds(new Set());
  }, [activeFilter]);

  useEffect(() => {
    if (!inboxQuery.data?.items) {
      return;
    }

    setItems((current) => {
      const next = cursor ? [...current] : [];
      const seen = new Set(next.map((item) => item.id));
      for (const item of inboxQuery.data.items) {
        if (!seen.has(item.id)) {
          next.push(item);
        }
      }
      return next;
    });
  }, [cursor, inboxQuery.data?.items]);

  const visibleItems = items.filter((item) => !dismissedIds.has(item.id));
  const selectedFilterLabel = CONTENT_FILTERS.find(
    (filter) => filter.value === activeFilter
  )?.label;

  const dismissWithMutation = (item: LibraryItem, action: 'bookmark' | 'archive') => {
    setDismissedIds((current) => new Set(current).add(item.id));
    const mutation = action === 'bookmark' ? bookmarkMutation : archiveMutation;
    mutation.mutate(
      { id: item.id },
      {
        onError: () => {
          setDismissedIds((current) => {
            const next = new Set(current);
            next.delete(item.id);
            return next;
          });
        },
      }
    );
  };

  return (
    <WebPageFrame
      eyebrow="Triage"
      title="Inbox"
      actions={<ContentFilterBar activeFilter={activeFilter} onChange={setActiveFilter} />}
    >
      <div className="web-page-scroll">
        <Surface className="web-list-panel">
          {inboxQuery.error && items.length === 0 ? (
            <InlineState
              title="Could not load inbox"
              message={inboxQuery.error.message ?? 'Refresh and try again.'}
            />
          ) : inboxQuery.isLoading && items.length === 0 ? (
            <div className="web-list">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="new-page-column-card__skeleton" />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <InlineState
              title={
                selectedFilterLabel
                  ? `No ${selectedFilterLabel.toLowerCase()}`
                  : 'Your inbox is clear'
              }
              message={
                selectedFilterLabel
                  ? `New ${selectedFilterLabel.toLowerCase()} from your sources will appear here.`
                  : 'Bookmark what you want to keep, archive the rest, and keep the queue light.'
              }
            />
          ) : (
            <div className="web-list">
              {visibleItems.map((item) => (
                <ItemCardView
                  key={item.id}
                  item={toItemCardData(item)}
                  shape="row"
                  actionSlot={
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => dismissWithMutation(item, 'bookmark')}
                        disabled={bookmarkMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        tone="ghost"
                        onClick={() => dismissWithMutation(item, 'archive')}
                        disabled={archiveMutation.isPending}
                      >
                        Archive
                      </Button>
                    </>
                  }
                />
              ))}
              {inboxQuery.data?.nextCursor ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setCursor(inboxQuery.data?.nextCursor ?? undefined)}
                  disabled={inboxQuery.isLoading}
                >
                  Load more
                </Button>
              ) : null}
            </div>
          )}
        </Surface>
      </div>
    </WebPageFrame>
  );
}

function SearchEntityRow({
  icon: Icon,
  title,
  subtitle,
  to,
}: {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  subtitle: string;
  to?: string;
}) {
  const content = (
    <Surface className="web-entity-row">
      <div className="web-entity-row__icon">
        <Icon size={18} strokeWidth={2.1} />
      </div>
      <div className="web-entity-row__copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
    </Surface>
  );

  return to ? <Link to={to}>{content}</Link> : content;
}

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const searchQuery = trpc.search.query.useQuery(
    {
      query: debouncedQuery || ' ',
      creatorsLimit: 5,
      peopleLimit: 5,
      itemsLimit: 20,
    },
    { enabled: debouncedQuery.length > 0 }
  );

  const sections = searchQuery.data?.sections;
  const creators = sections?.creators ?? [];
  const people = sections?.people ?? [];
  const items = sections?.items ?? [];
  const hasQuery = debouncedQuery.length > 0;
  const hasResults = creators.length > 0 || people.length > 0 || items.length > 0;

  return (
    <WebPageFrame eyebrow="Find" title="Search">
      <div className="web-page-scroll">
        <Surface className="web-search-panel">
          <label className="web-search-box">
            <Search size={18} strokeWidth={2} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your library"
              aria-label="Search your library"
            />
          </label>
        </Surface>

        {!hasQuery ? null : searchQuery.error ? (
          <InlineState
            title="Could not search your library"
            message={searchQuery.error.message ?? 'Try again in a moment.'}
          />
        ) : searchQuery.isLoading ? (
          <div className="web-list">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="new-page-column-card__skeleton" />
            ))}
          </div>
        ) : !hasResults ? (
          <InlineState title="No matches found" message="Try a different title or creator name." />
        ) : (
          <>
            {creators.length > 0 ? (
              <Section title="Creators">
                <div className="web-list">
                  {creators.map((creator) => (
                    <SearchEntityRow
                      key={creator.creatorId}
                      icon={UserRound}
                      title={creator.name}
                      subtitle={[
                        mapProvider(creator.provider),
                        creator.isSubscribed ? 'Subscribed' : null,
                        creator.libraryItemCount ? `${creator.libraryItemCount} saved` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  ))}
                </div>
              </Section>
            ) : null}
            {people.length > 0 ? (
              <Section title="People">
                <div className="web-list">
                  {people.map((person) => (
                    <SearchEntityRow
                      key={person.personId}
                      icon={UserRound}
                      title={person.displayName}
                      subtitle={`${person.itemCount} saved ${person.itemCount === 1 ? 'item' : 'items'}${
                        person.latestItemTitle ? ` · ${person.latestItemTitle}` : ''
                      }`}
                    />
                  ))}
                </div>
              </Section>
            ) : null}
            {items.length > 0 ? (
              <Section title="Items">
                <ItemRail items={items.map(toItemCardData)} shape="row" />
              </Section>
            ) : null}
          </>
        )}
      </div>
    </WebPageFrame>
  );
}

function LibraryObjectTabs({ active }: { active: string }) {
  return (
    <div className="web-object-tabs" aria-label="Library sections">
      {LIBRARY_OBJECTS.map((object) => {
        const Icon = object.icon;
        const isActive = active === object.label.toLowerCase();
        return (
          <Link
            key={object.path}
            to={object.path}
            className={cn('web-object-tab', isActive && 'web-object-tab--active')}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={17} strokeWidth={2.1} />
            <span>{object.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function getCollectionRuleSummary(rules: CollectionRules) {
  const parts: string[] = [];
  if (rules.contentTypes?.length) parts.push('content type');
  if (rules.providers?.length) parts.push('source');
  if (rules.tagIds?.length) parts.push('tag');
  if (rules.isFinished !== undefined) parts.push(rules.isFinished ? 'finished' : 'unfinished');
  if (rules.search) parts.push('search');
  if (rules.minLengthMinutes !== undefined || rules.maxLengthMinutes !== undefined) {
    parts.push('length');
  }
  return parts.length === 0 ? 'Manual collection' : `Saved filter: ${parts.join(', ')}`;
}

function LibrarySources() {
  const subscriptionsQuery = trpc.subscriptions.list.useQuery({ limit: 100 });
  const newslettersQuery = trpc.subscriptions.newsletters.list.useQuery({ limit: 100 });
  const rssQuery = trpc.subscriptions.rss.list.useQuery({ limit: 100 });
  const xBookmarksQuery = trpc.subscriptions.xBookmarks.status.useQuery(undefined, {
    staleTime: 60 * 1000,
  });
  const rows = [
    ...(subscriptionsQuery.data?.items ?? []).map((source) => ({
      id: `subscription:${source.id}`,
      title: source.name,
      meta: `${mapProvider(source.provider)} subscription`,
      status: source.status,
      imageUrl: source.imageUrl ?? null,
    })),
    ...(newslettersQuery.data?.items ?? []).map((source) => ({
      id: `newsletter:${source.id}`,
      title: source.displayName,
      meta: source.fromAddress ?? source.listId ?? 'Newsletter',
      status: source.status,
      imageUrl: source.imageUrl ?? null,
    })),
    ...(rssQuery.data?.items ?? [])
      .filter((source) => source.status !== 'UNSUBSCRIBED')
      .map((source) => ({
        id: `rss:${source.id}`,
        title: formatDisplayText(source.title),
        meta: source.siteUrl ?? source.feedUrl,
        status: source.status,
        imageUrl: source.imageUrl ?? null,
      })),
  ];

  if (xBookmarksQuery.data?.connected || xBookmarksQuery.data?.importedCount) {
    rows.push({
      id: 'x-bookmarks',
      title: 'X Bookmarks',
      meta: `${xBookmarksQuery.data.importedCount} imported`,
      status: xBookmarksQuery.data.connected
        ? 'ACTIVE'
        : (xBookmarksQuery.data.connectionStatus ?? 'DISCONNECTED'),
      imageUrl: null,
    });
  }

  const isLoading =
    subscriptionsQuery.isLoading || newslettersQuery.isLoading || rssQuery.isLoading;
  const error = subscriptionsQuery.error ?? newslettersQuery.error ?? rssQuery.error;

  if (error) {
    return <InlineState title="Could not load sources" message={error.message} />;
  }

  if (isLoading) {
    return (
      <div className="web-list">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="new-page-column-card__skeleton" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <InlineState
        title="No sources yet"
        message="Connect YouTube, Spotify, newsletters, RSS, or X to start filling your inbox."
        action={
          <Button asChild>
            <Link to="/welcome">Connect sources</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="web-object-grid">
      {rows.map((source) => (
        <Surface key={source.id} className="web-source-tile">
          {source.imageUrl ? <img src={source.imageUrl} alt="" /> : <Rss size={20} />}
          <div>
            <strong>{formatDisplayText(source.title)}</strong>
            <span>{source.meta}</span>
          </div>
          <Badge>{source.status.toLowerCase()}</Badge>
        </Surface>
      ))}
    </div>
  );
}

export function LibraryPage({ object }: { object: 'people' | 'sources' | 'collections' }) {
  const collectionsQuery = trpc.collections.list.useQuery();
  const peopleQuery = trpc.people.list.useQuery({ limit: 30, sort: 'count' });

  return (
    <WebPageFrame eyebrow="Library" title={object[0].toUpperCase() + object.slice(1)}>
      <div className="web-page-scroll">
        <LibraryObjectTabs active={object} />
        {object === 'people' ? (
          peopleQuery.error ? (
            <InlineState title="Could not load people" message={peopleQuery.error.message} />
          ) : peopleQuery.isLoading ? (
            <div className="web-list">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="new-page-column-card__skeleton" />
              ))}
            </div>
          ) : (peopleQuery.data?.people ?? []).length === 0 ? (
            <InlineState
              title="No people yet"
              message="People mentioned in saved work will appear here after enrichment runs."
            />
          ) : (
            <div className="web-object-grid">
              {(peopleQuery.data?.people ?? []).map((person) => (
                <Surface key={person.id} className="web-person-tile">
                  {person.profileImageUrl ? (
                    <img src={person.profileImageUrl} alt="" />
                  ) : (
                    <div>{person.displayName.slice(0, 2).toUpperCase()}</div>
                  )}
                  <strong>{person.displayName}</strong>
                  <span>
                    {person.itemCount} saved {person.itemCount === 1 ? 'item' : 'items'}
                  </span>
                  {person.latestItemTitle ? <small>{person.latestItemTitle}</small> : null}
                </Surface>
              ))}
            </div>
          )
        ) : object === 'sources' ? (
          <LibrarySources />
        ) : collectionsQuery.error ? (
          <InlineState
            title="Could not load collections"
            message={collectionsQuery.error.message}
          />
        ) : collectionsQuery.isLoading ? (
          <div className="web-list">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="new-page-column-card__skeleton" />
            ))}
          </div>
        ) : (collectionsQuery.data?.collections ?? []).length === 0 ? (
          <InlineState
            title="No collections yet"
            message="Save a filtered bookmark view as a collection to pin a focused shelf."
          />
        ) : (
          <div className="web-object-grid">
            {(collectionsQuery.data?.collections ?? []).map((collection) => (
              <Surface key={collection.id} className="web-collection-tile">
                <Folder size={20} strokeWidth={2.1} />
                <strong>{collection.name}</strong>
                <span>{collection.description ?? getCollectionRuleSummary(collection.rules)}</span>
                {collection.homeSection ? <Badge>on home</Badge> : null}
              </Surface>
            ))}
          </div>
        )}
      </div>
    </WebPageFrame>
  );
}
