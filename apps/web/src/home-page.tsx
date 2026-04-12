import { ContentType } from '@zine/shared';
import {
  ArrowRight,
  FileText,
  Headphones,
  MessageSquare,
  Plus,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Typography } from '@zine/design-system';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FilterChip } from '@/components/ui/filter-chip';
import { ItemCardView } from '@/components/item-card';
import { typographyStyle } from '@/lib/utils';

import { trpc } from './lib/trpc';

type FilterValue = ContentType | null;

const filterDefinitions: Array<{
  value: Exclude<FilterValue, null>;
  label: string;
  icon: LucideIcon;
}> = [
  { value: ContentType.ARTICLE, label: 'Articles', icon: FileText },
  { value: ContentType.PODCAST, label: 'Podcasts', icon: Headphones },
  { value: ContentType.VIDEO, label: 'Videos', icon: Video },
  { value: ContentType.POST, label: 'Posts', icon: MessageSquare },
];

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';

  return 'Good evening';
}

function matchesFilter(item: { contentType: ContentType | string }, filter: FilterValue) {
  return filter === null || item.contentType === filter;
}

function SurfaceSection({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2
            className="text-foreground"
            style={{
              ...typographyStyle(Typography.headlineSmall),
              letterSpacing: '-0.03em',
            }}
          >
            {title}
          </h2>
          {typeof count === 'number' ? (
            <span className="text-sm font-medium text-[var(--text-tertiary)]">{count}</span>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function HomePage() {
  const [activeFilter, setActiveFilter] = useState<FilterValue>(null);

  const greeting = getGreeting();
  const homeQuery = trpc.items.home.useQuery();
  const inboxQuery = trpc.items.inbox.useQuery({ limit: 4 });
  const libraryQuery = trpc.items.library.useQuery({ limit: 100 });

  const categoryCounts = useMemo(() => {
    const items = libraryQuery.data?.items ?? [];

    return {
      [ContentType.ARTICLE]: items.filter((item) => item.contentType === ContentType.ARTICLE)
        .length,
      [ContentType.PODCAST]: items.filter((item) => item.contentType === ContentType.PODCAST)
        .length,
      [ContentType.VIDEO]: items.filter((item) => item.contentType === ContentType.VIDEO).length,
      [ContentType.POST]: items.filter((item) => item.contentType === ContentType.POST).length,
    };
  }, [libraryQuery.data?.items]);

  const filteredJumpBackIn = useMemo(
    () =>
      (homeQuery.data?.jumpBackIn ?? [])
        .filter((item) => matchesFilter(item, activeFilter))
        .slice(0, 4),
    [activeFilter, homeQuery.data?.jumpBackIn]
  );

  const filteredRecentBookmarks = useMemo(
    () =>
      (homeQuery.data?.recentBookmarks ?? [])
        .filter((item) => matchesFilter(item, activeFilter))
        .slice(0, 6),
    [activeFilter, homeQuery.data?.recentBookmarks]
  );

  const filteredInbox = useMemo(
    () =>
      (inboxQuery.data?.items ?? [])
        .filter((item) => matchesFilter(item, activeFilter))
        .slice(0, 4),
    [activeFilter, inboxQuery.data?.items]
  );

  const isLoading = homeQuery.isLoading || inboxQuery.isLoading || libraryQuery.isLoading;
  const error = homeQuery.error ?? inboxQuery.error ?? libraryQuery.error ?? null;
  const hasAnyContent =
    filteredJumpBackIn.length > 0 || filteredRecentBookmarks.length > 0 || filteredInbox.length > 0;

  return (
    <div className="flex w-full max-w-[1180px] flex-col gap-10">
      <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="text-[3.35rem] font-semibold leading-none tracking-[-0.06em] text-foreground sm:text-[4.5rem]">
            Home
          </h1>
          <p className="text-lg text-[var(--text-subheader)]">{greeting}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" asChild>
            <Link to="/add-link">
              <Plus />
              Add link
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filterDefinitions.map((filter) => (
          <FilterChip
            key={filter.value}
            label={filter.label}
            count={categoryCounts[filter.value] ?? 0}
            icon={filter.icon}
            selected={activeFilter === filter.value}
            tone={filter.value}
            onClick={() =>
              setActiveFilter((current) => (current === filter.value ? null : filter.value))
            }
          />
        ))}
      </div>

      {isLoading ? (
        <Card className="border-border bg-card/90">
          <CardHeader>
            <Badge variant="muted" className="w-fit">
              Pulling state
            </Badge>
            <CardTitle className="text-[2rem]">Loading your home surface.</CardTitle>
          </CardHeader>
        </Card>
      ) : error ? (
        <Card className="border-border bg-card/90">
          <CardHeader>
            <Badge variant="warning" className="w-fit">
              Something broke
            </Badge>
            <CardTitle className="text-[2rem]">Could not load this section.</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-base text-[var(--text-subheader)]">
            {error.message ?? 'Please refresh and try again.'}
          </CardContent>
        </Card>
      ) : !hasAnyContent ? (
        <Card className="border-border bg-card/90">
          <CardHeader>
            <Badge variant="muted" className="w-fit">
              Empty for now
            </Badge>
            <CardTitle className="text-[2rem]">No items match this view yet.</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-base leading-7 text-[var(--text-subheader)]">
            Save or sync a few things and the home surface will start to breathe.
          </CardContent>
        </Card>
      ) : (
        <>
          {filteredJumpBackIn.length > 0 ? (
            <SurfaceSection title="Jump Back In" count={filteredJumpBackIn.length}>
              <div className="grid gap-3 md:grid-cols-2">
                {filteredJumpBackIn.map((item) => (
                  <ItemCardView key={item.id} item={item} shape="feature" />
                ))}
              </div>
            </SurfaceSection>
          ) : null}

          {filteredRecentBookmarks.length > 0 ? (
            <SurfaceSection title="Recently Bookmarked" count={filteredRecentBookmarks.length}>
              <div className="grid auto-cols-[minmax(300px,340px)] grid-flow-col gap-4 overflow-x-auto pb-2 pr-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {filteredRecentBookmarks.map((item) => (
                  <div key={item.id} className="min-w-0 snap-start">
                    <ItemCardView item={item} shape="stack" />
                  </div>
                ))}
              </div>
            </SurfaceSection>
          ) : null}

          {filteredInbox.length > 0 ? (
            <SurfaceSection
              title="Inbox"
              count={filteredInbox.length}
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/inbox">
                    Open inbox
                    <ArrowRight />
                  </Link>
                </Button>
              }
            >
              <div className="item-list">
                {filteredInbox.map((item) => (
                  <ItemCardView key={item.id} item={item} />
                ))}
              </div>
            </SurfaceSection>
          ) : null}
        </>
      )}
    </div>
  );
}
