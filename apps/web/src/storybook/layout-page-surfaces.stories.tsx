import type { Meta, StoryObj } from '@storybook/react-vite';

import { ItemCardFixtures } from '@zine/design-system';
import { ContentType, Provider } from '@zine/shared';

import { Badge, Button, EmptyState, PageHeader, StatCard, Surface } from '@/components';
import { ItemCard, ItemCardView } from '@/components/item-card';
import { ManualBookmarkDialogView } from '@/components/manual-bookmark-dialog-view';
import { FilterChip } from '@/components/ui/filter-chip';

import { createDarkCanvasDecorator } from './decorators';

const jumpBackInItems = [
  {
    ...ItemCardFixtures.video,
    summary: 'A long-form system walkthrough queued up right where you left it.',
    canonicalUrl: 'https://zine.example/watch/design-systems-at-scale',
    lastOpenedAt: '2025-02-18T09:45:00.000Z',
  },
  {
    ...ItemCardFixtures.podcast,
    summary: 'A listening session about product taste, pacing, and editorial judgment.',
    canonicalUrl: 'https://zine.example/listen/product-taste-and-decision-quality',
    lastOpenedAt: '2025-02-17T16:10:00.000Z',
  },
];

const recentBookmarks = [
  {
    ...ItemCardFixtures.article,
    summary: 'Shared card spacing and metadata rhythm should hold up across the browser channel.',
    canonicalUrl: 'https://zine.example/read/stable-component-apis',
    bookmarkedAt: '2025-02-16T11:20:00.000Z',
  },
  {
    ...ItemCardFixtures.stress,
    summary: 'Stress content keeps the same reading cadence under denser web layouts.',
    canonicalUrl: 'https://zine.example/read/stress-layout-content',
    bookmarkedAt: '2025-02-15T08:30:00.000Z',
  },
  {
    ...ItemCardFixtures.creatorFallback,
    summary: 'Fallback media treatment still reads as intentional when artwork is missing.',
    canonicalUrl: 'https://zine.example/listen/fallback-media-treatment',
    bookmarkedAt: '2025-02-14T14:05:00.000Z',
  },
];

const inboxItems = [
  {
    ...ItemCardFixtures.video,
    summary: 'A fresh arrival from a followed channel, ready for a quick keep-or-archive pass.',
    canonicalUrl: 'https://zine.example/watch/design-systems-at-scale',
    ingestedAt: '2025-02-18T09:45:00.000Z',
  },
  {
    ...ItemCardFixtures.article,
    summary: 'A new article is waiting in the inbox with enough metadata to decide fast.',
    canonicalUrl: 'https://zine.example/read/stable-component-apis',
    ingestedAt: '2025-02-18T07:10:00.000Z',
  },
];

const libraryItems = [
  {
    ...ItemCardFixtures.article,
    summary: 'This stays on the shelf because the interface makes dense browsing feel quiet.',
    canonicalUrl: 'https://zine.example/read/stable-component-apis',
    bookmarkedAt: '2025-02-12T08:30:00.000Z',
  },
  {
    ...ItemCardFixtures.podcast,
    summary: 'A saved episode keeps the same card language as articles and videos.',
    canonicalUrl: 'https://zine.example/listen/product-taste-and-decision-quality',
    bookmarkedAt: '2025-02-11T09:15:00.000Z',
  },
  {
    ...ItemCardFixtures.creatorFallback,
    summary: 'Shelf entries stay calm even when imagery has to degrade gracefully.',
    canonicalUrl: 'https://zine.example/listen/fallback-media-treatment',
    bookmarkedAt: '2025-02-10T13:45:00.000Z',
  },
];

const subscriptionSources = [
  {
    eyebrow: 'YouTube integration',
    title: 'YouTube',
    summary: 'Integration connected · 14 subscriptions',
    badge: '14 subscriptions',
  },
  {
    eyebrow: 'Spotify integration',
    title: 'Spotify',
    summary: 'Integration connected · 6 subscriptions',
    badge: '6 subscriptions',
  },
  {
    eyebrow: 'Gmail integration',
    title: 'Newsletters',
    summary: 'Integration needs attention · 9 newsletters',
    badge: '9 newsletters',
  },
  {
    eyebrow: 'No integration required',
    title: 'RSS',
    summary: 'No integration required · 4 feeds',
    badge: '4 feeds',
  },
];

const manualBookmarkPreview = {
  provider: Provider.WEB,
  contentType: ContentType.ARTICLE,
  providerId: 'storybook-manual-bookmark',
  title: 'Quiet browser surfaces need the same save rhythm as mobile.',
  creator: 'Zine Editorial',
  creatorImageUrl: undefined,
  thumbnailUrl:
    'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1400&q=80',
  duration: null,
  canonicalUrl: 'https://zine.example/read/manual-bookmark-flow',
  source: 'article_extractor' as const,
  description:
    'The manual save flow should feel native to the web shell: immediate, calm, and trustworthy before the item lands in the library.',
  siteName: 'zine.example',
  wordCount: 920,
  readingTimeMinutes: 4,
  hasArticleContent: true,
  publishedAt: '2026-04-11T10:00:00.000Z',
  rawMetadata: undefined,
};

function SectionHeader({
  title,
  count,
  action,
}: {
  title: string;
  count?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-3xl font-semibold tracking-[-0.03em] text-foreground">{title}</h2>
        {count ? (
          <span className="text-sm font-medium text-[var(--text-tertiary)]">{count}</span>
        ) : null}
      </div>
      {action}
    </div>
  );
}

function HomeSurfaceReference() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Home"
        title="Home"
        description="The browser channel keeps the same calm editorial flow: scan, resume, save, and move on without visual noise."
        actions={
          <div className="button-row">
            <Button>Add link</Button>
          </div>
        }
      />

      <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterChip label="Articles" tone={ContentType.ARTICLE} selected count={18} />
        <FilterChip label="Podcasts" tone={ContentType.PODCAST} count={7} />
        <FilterChip label="Videos" tone={ContentType.VIDEO} selected count={12} />
        <FilterChip label="Posts" tone={ContentType.POST} count={4} />
      </div>

      <div className="stats-grid">
        <StatCard label="Ready" value="11" detail="Items waiting for a decision" />
        <StatCard label="Saved" value="38" detail="Bookmarks holding their place" />
        <StatCard label="This week" value="6h" detail="Estimated reading and listening time" />
      </div>

      <section className="space-y-4">
        <SectionHeader title="Jump Back In" count="2" />
        <div className="grid gap-4 md:grid-cols-2">
          {jumpBackInItems.map((item) => (
            <ItemCardView key={item.id} item={item} shape="feature" />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Recently Bookmarked" count="3" />
        <div className="grid auto-cols-[minmax(300px,340px)] grid-flow-col gap-4 overflow-x-auto pb-2 pr-1 snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {recentBookmarks.map((item) => (
            <div key={item.id} className="min-w-0 snap-start">
              <ItemCardView item={item} shape="stack" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CollectionSurfacesReference() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Collections"
        title="Inbox and library"
        description="The core list surfaces should feel compatible: one for decisions, one for browsing, both running on the same shared tokens and cards."
      />

      <section className="space-y-4">
        <SectionHeader title="Inbox" count="2" />
        <div className="item-list">
          {inboxItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              actionSlot={
                <div className="button-row">
                  <Button tone="ghost">Archive</Button>
                  <Button>Keep</Button>
                </div>
              }
            />
          ))}
        </div>
      </section>

      <Surface className="toolbar">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="field">
            <span className="field__label">Search</span>
            <span className="field__hint">Title or creator</span>
            <input defaultValue="design systems" placeholder="Search your shelf" />
          </label>
          <div className="chip-row">
            <FilterChip label="All" size="small" selected />
            <FilterChip label="Articles" size="small" tone={ContentType.ARTICLE} selected />
            <FilterChip label="Finished only" size="small" />
          </div>
        </div>
      </Surface>

      <section className="space-y-4">
        <SectionHeader title="Library" count="3" />
        <div className="item-list">
          {libraryItems.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SubscriptionsSurfaceReference() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Subscriptions"
        title="Quiet intake, source by source."
        description="Integrations stay separate from triage. The hub should summarize source health without fighting the rest of the product."
      />

      <Surface className="hero-panel">
        <div>
          <p className="eyebrow">Overview</p>
          <h2>33 active subscriptions · 2 integrations connected · 1 needs attention</h2>
        </div>
        <div className="button-row">
          <Button tone="ghost">Sync now</Button>
        </div>
      </Surface>

      <div className="source-grid">
        {subscriptionSources.map((source) => (
          <div key={source.title} className="source-card">
            <Surface className="source-card__surface">
              <p className="eyebrow">{source.eyebrow}</p>
              <h2>{source.title}</h2>
              <p>{source.summary}</p>
              <div className="source-card__footer">
                <Badge>{source.badge}</Badge>
                <span>Manage source</span>
              </div>
            </Surface>
          </div>
        ))}
      </div>

      <section className="space-y-4">
        <SectionHeader title="Active sources" count="3" />
        <div className="item-list">
          <Surface className="source-row">
            <div>
              <div className="meta-row">
                <Badge tone="success">active</Badge>
                <span>last sync 2 hours ago</span>
              </div>
              <h3>Design Systems Weekly</h3>
              <p>New channel videos land in the inbox after sync.</p>
            </div>
            <div className="button-row button-row--wrap">
              <Button tone="ghost">Pause</Button>
              <Button tone="ghost">Sync</Button>
              <Button tone="danger">Remove</Button>
            </div>
          </Surface>

          <Surface className="source-row">
            <div>
              <div className="meta-row">
                <Badge tone="warning">needs attention</Badge>
                <span>token expired yesterday</span>
              </div>
              <h3>Morning Dispatch</h3>
              <p>Reconnect Gmail to keep newsletter triage flowing into the inbox.</p>
            </div>
            <div className="button-row button-row--wrap">
              <Button>Reconnect</Button>
              <Button tone="ghost">Hide</Button>
            </div>
          </Surface>

          <Surface className="source-row">
            <div>
              <div className="meta-row">
                <Badge>manual</Badge>
                <span>4 feeds active</span>
              </div>
              <h3>Editorial RSS bundle</h3>
              <p>Manual RSS entry keeps the same language as connected integrations.</p>
            </div>
            <div className="button-row button-row--wrap">
              <Button tone="ghost">Sync</Button>
              <Button tone="danger">Remove</Button>
            </div>
          </Surface>
        </div>
      </section>
    </div>
  );
}

function WeeklyRecapSurfaceReference() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Weekly recap"
        title="Week of Feb 12"
        description="The insight surface should read like the same product: quiet, dense, and useful without shifting the visual language."
      />

      <div className="stats-grid">
        <StatCard label="Completed" value="12" detail="6h 20m estimated time" />
        <StatCard label="Started" value="5" detail="Up 14% vs last week" />
        <StatCard
          label="Dominant mode"
          value="reading"
          detail="Most of the week leaned text-heavy"
        />
      </div>

      <Surface className="group-panel">
        <div className="group-panel__header">
          <h3>Mode split</h3>
          <Badge>weekly</Badge>
        </div>
        <div className="mode-stack">
          <div className="mode-row">
            <div className="mode-row__meta">
              <strong>Reading</strong>
              <span>3h 10m</span>
            </div>
            <div className="mode-row__track">
              <div className="mode-row__fill" style={{ width: '72%' }} />
            </div>
          </div>
          <div className="mode-row">
            <div className="mode-row__meta">
              <strong>Watching</strong>
              <span>1h 45m</span>
            </div>
            <div className="mode-row__track">
              <div className="mode-row__fill" style={{ width: '40%' }} />
            </div>
          </div>
          <div className="mode-row">
            <div className="mode-row__meta">
              <strong>Listening</strong>
              <span>1h 25m</span>
            </div>
            <div className="mode-row__track">
              <div className="mode-row__fill" style={{ width: '32%' }} />
            </div>
          </div>
        </div>
      </Surface>

      <div className="group-grid">
        <Surface className="group-panel">
          <div className="group-panel__header">
            <h3>Top creator</h3>
          </div>
          <p>Zine Editorial</p>
        </Surface>
        <Surface className="group-panel">
          <div className="group-panel__header">
            <h3>Top provider</h3>
          </div>
          <p>substack</p>
        </Surface>
      </div>

      <EmptyState
        title="No comparison anomaly"
        message="Empty and low-signal states should share the same restrained tone as the rest of the recap surface."
      />
    </div>
  );
}

function ManualBookmarkSurfaceReference() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Bookmarks"
        title="Manual save flow"
        description="The web add-bookmark dialog should read like the same product as mobile: focused, editorial, and quiet under dark surfaces."
        actions={
          <div className="button-row">
            <Button>Add bookmark</Button>
          </div>
        }
      />

      <div style={{ display: 'grid', placeItems: 'center', minHeight: 760 }}>
        <div style={{ width: 'min(44rem, 100%)' }}>
          <ManualBookmarkDialogView
            url={manualBookmarkPreview.canonicalUrl}
            isUrlValid
            preview={manualBookmarkPreview}
            isLoadingPreview={false}
            isFetchingPreview={false}
            previewErrorMessage={null}
            saveErrorMessage={null}
            isSaving={false}
            onClose={() => {}}
            onUrlChange={() => {}}
            onPaste={() => {}}
            onClear={() => {}}
            onRetry={() => {}}
            onSave={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: 'Layout/Page Surfaces',
  decorators: [createDarkCanvasDecorator({ minHeight: 960, padding: 24 })],
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const HomeSurface: Story = {
  render: () => <HomeSurfaceReference />,
};

export const CollectionSurfaces: Story = {
  render: () => <CollectionSurfacesReference />,
};

export const SubscriptionsSurface: Story = {
  render: () => <SubscriptionsSurfaceReference />,
};

export const WeeklyRecapSurface: Story = {
  render: () => <WeeklyRecapSurfaceReference />,
};

export const ManualBookmarkSurface: Story = {
  render: () => <ManualBookmarkSurfaceReference />,
};
