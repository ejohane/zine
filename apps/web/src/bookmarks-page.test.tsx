import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ContentType, Provider } from '@zine/shared';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderRoute } from './test/render-router';

vi.mock('./lib/trpc', () => import('./test/mocks/trpc'));

import { BookmarksPage } from './bookmarks-page';
import { SettingsPage } from './settings-page';
import { createCreator, createLibraryItem } from './test/fixtures';
import { hookSpies, invalidateSpies, mutationSpies, resetTrpcMocks } from './test/mocks/trpc';

const articleItem = createLibraryItem({
  id: 'article-1',
  title: 'Stable component APIs',
  contentType: ContentType.ARTICLE,
  provider: Provider.SUBSTACK,
  duration: null,
  readingTimeMinutes: 8,
  canonicalUrl: 'https://zine.example/read/stable-component-apis',
});

const videoItem = createLibraryItem({
  id: 'video-1',
  title: 'Design systems at scale',
  contentType: ContentType.VIDEO,
  provider: Provider.YOUTUBE,
});

const podcastItem = createLibraryItem({
  id: 'podcast-1',
  title: 'Product taste and pacing',
  contentType: ContentType.PODCAST,
  provider: Provider.SPOTIFY,
  duration: 1820,
  creatorId: 'creator-2',
  canonicalUrl: 'https://open.spotify.com/episode/example',
});

const postItem = createLibraryItem({
  id: 'post-1',
  title: 'Notes on interface pace',
  summary:
    'Ship the smallest interaction that still feels inevitable, then tighten it until it disappears.',
  creator: 'Erik J',
  creatorId: 'creator-3',
  contentType: ContentType.POST,
  provider: Provider.X,
  canonicalUrl: 'https://x.com/erik/status/1234567890',
});

const libraryItems = [articleItem, videoItem, podcastItem, postItem];

function LocationProbe() {
  const location = useLocation();

  return (
    <>
      <output data-testid="location-pathname">{location.pathname}</output>
      <output data-testid="location-search">{location.search}</output>
      <output data-testid="location-path">{location.pathname}</output>
    </>
  );
}

function setViewportWidth(width: number) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => {
    const maxWidthMatch = query.match(/max-width:\s*(\d+(?:\.\d+)?)px/i);
    const minWidthMatch = query.match(/min-width:\s*(\d+(?:\.\d+)?)px/i);
    const maxWidth = maxWidthMatch ? Number(maxWidthMatch[1]) : null;
    const minWidth = minWidthMatch ? Number(minWidthMatch[1]) : null;
    const matches =
      (maxWidth === null || width <= maxWidth) && (minWidth === null || width >= minWidth);

    return {
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });
}

function installDefaultBookmarkMocks() {
  hookSpies.itemsLibraryUseQuery.mockImplementation((input) => ({
    data: {
      items: input.filter.contentType
        ? libraryItems.filter((item) => item.contentType === input.filter.contentType)
        : libraryItems,
    },
    isLoading: false,
    error: null,
  }));

  hookSpies.itemsGetUseQuery.mockImplementation((input) => {
    if (!input.id) {
      return { data: undefined, isLoading: false, error: null };
    }

    const item = libraryItems.find((candidate) => candidate.id === input.id);
    if (!item) {
      return { data: undefined, isLoading: false, error: new Error('Missing bookmark') };
    }

    return { data: item, isLoading: false, error: null };
  });

  hookSpies.creatorsGetUseQuery.mockImplementation((input) => ({
    data:
      input.creatorId === 'creator-2'
        ? createCreator({
            id: 'creator-2',
            handle: 'taste-and-pacing',
            description: 'Hosted by Alice Example and Bob Example',
          })
        : input.creatorId === 'creator-3'
          ? createCreator({
              id: 'creator-3',
              handle: 'erik',
              description: 'Writes about product and interface rhythm',
            })
          : createCreator(),
    isLoading: false,
    error: null,
  }));
}

describe('BookmarksPage', () => {
  beforeEach(() => {
    resetTrpcMocks();
    installDefaultBookmarkMocks();
    setViewportWidth(1280);
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  });

  test('renders skeleton loading, error, and empty states from the library query', () => {
    hookSpies.itemsLibraryUseQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const loadingView = renderRoute(<BookmarksPage />, {
      route: '/bookmarks',
      path: '/bookmarks',
    });
    expect(loadingView.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
    expect(loadingView.getByTestId('bookmark-detail-skeleton')).toBeVisible();
    expect(loadingView.getAllByTestId('bookmark-row-skeleton')).toHaveLength(6);
    expect(loadingView.getByRole('status', { hidden: true })).toHaveTextContent(
      'Loading bookmarks'
    );
    loadingView.unmount();

    hookSpies.itemsLibraryUseQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      error: new Error('Network down'),
    });
    const errorView = renderRoute(<BookmarksPage />, {
      route: '/bookmarks',
      path: '/bookmarks',
    });
    expect(errorView.getByText('Could not load bookmarks')).toBeVisible();
    expect(errorView.getByText('Network down')).toBeVisible();
    errorView.unmount();

    hookSpies.itemsLibraryUseQuery.mockReturnValueOnce({
      data: { items: [] },
      isLoading: false,
      error: null,
    });
    renderRoute(<BookmarksPage />, {
      route: '/bookmarks',
      path: '/bookmarks',
    });
    expect(
      screen.getByRole('heading', { name: /No bookmarks yet|Add your first bookmark/ })
    ).toBeVisible();
  });

  test('filters locally and syncs the selected filter to the URL', async () => {
    const user = userEvent.setup();

    renderRoute(
      <>
        <BookmarksPage />
        <LocationProbe />
      </>,
      {
        route: '/bookmarks?contentType=video',
        path: '/bookmarks',
      }
    );

    expect(screen.queryByText(articleItem.title)).not.toBeInTheDocument();
    expect(screen.getByText(videoItem.title)).toBeVisible();
    expect(screen.queryByText(podcastItem.title)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Videos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('location-search')).toHaveTextContent('?contentType=video');
    expect(
      hookSpies.itemsLibraryUseQuery.mock.calls.some(
        ([input]) => input.filter.contentType === ContentType.VIDEO
      )
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Articles' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('?contentType=article');
    });

    expect(screen.getByText(articleItem.title)).toBeVisible();
    expect(screen.queryByText(videoItem.title)).not.toBeInTheDocument();
    expect(screen.queryByText(podcastItem.title)).not.toBeInTheDocument();
    expect(
      hookSpies.itemsLibraryUseQuery.mock.calls.some(
        ([input]) => input.filter.contentType === ContentType.ARTICLE
      )
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'All' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent('');
    });

    expect(screen.getByText(articleItem.title)).toBeVisible();
    expect(screen.getByText(videoItem.title)).toBeVisible();
    expect(screen.getByText(podcastItem.title)).toBeVisible();
  });

  test('navigates to the settings page from the sidebar', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/bookmarks']}>
        <Routes>
          <Route
            path="/bookmarks"
            element={
              <>
                <BookmarksPage />
                <LocationProbe />
              </>
            }
          />
          <Route
            path="/settings"
            element={
              <>
                <SettingsPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    await user.click(screen.getByRole('link', { name: 'Settings' }));

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeVisible();
    expect(screen.getByTestId('location-pathname')).toHaveTextContent('/settings');
  });

  test('keeps the page shell visible while bookmark data is refreshing', () => {
    hookSpies.itemsLibraryUseQuery.mockReturnValueOnce({
      data: { items: libraryItems },
      isLoading: true,
      error: null,
    });

    renderRoute(<BookmarksPage />, {
      route: '/bookmarks',
      path: '/bookmarks',
    });

    expect(screen.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
    expect(screen.getByText(articleItem.title)).toBeVisible();
    expect(screen.queryByText('Loading bookmarks')).not.toBeInTheDocument();
  });

  test('shows the detail skeleton while a routed bookmark is still loading', () => {
    hookSpies.itemsLibraryUseQuery.mockReturnValueOnce({
      data: { items: [] },
      isLoading: false,
      error: null,
    });
    hookSpies.itemsGetUseQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderRoute(<BookmarksPage />, {
      route: '/bookmarks/video-1',
      path: '/bookmarks/:bookmarkId',
      redirects: [{ path: '/bookmarks', element: <div>Bookmarks fallback</div> }],
    });

    expect(screen.getByTestId('bookmark-detail-skeleton')).toBeVisible();
    expect(screen.queryByText('Select a bookmark')).not.toBeInTheDocument();
  });

  test('recovers to the list when a selected bookmark cannot be loaded', async () => {
    renderRoute(<BookmarksPage />, {
      route: '/bookmarks/missing-bookmark',
      path: '/bookmarks/:bookmarkId',
      redirects: [{ path: '/bookmarks', element: <div>Bookmarks fallback</div> }],
    });

    expect(await screen.findByText('Bookmarks fallback')).toBeVisible();
  });

  test('renders bookmark detail from the route and toggles mutations with cache invalidation', async () => {
    const user = userEvent.setup();

    renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${videoItem.id}`,
      path: '/bookmarks/:bookmarkId',
      redirects: [{ path: '/bookmarks', element: <div>Bookmarks fallback</div> }],
    });

    expect(screen.getByRole('heading', { name: videoItem.title })).toBeVisible();
    expect(screen.getByLabelText('Bookmark metadata')).toBeVisible();
    expect(
      screen.getByRole('button', { name: `Manage tags for ${videoItem.title}` })
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: `More actions for ${videoItem.title}` })
    ).toBeVisible();
    expect(
      screen
        .getByRole('button', { name: `Remove bookmark for ${videoItem.title}` })
        .querySelector('svg')
    ).toHaveAttribute('fill', 'currentColor');
    expect(screen.getByRole('link', { name: 'Open in YouTube' })).toHaveAttribute(
      'href',
      videoItem.canonicalUrl
    );

    await user.click(
      screen.getByRole('button', { name: `Remove bookmark for ${videoItem.title}` })
    );
    expect(mutationSpies.unbookmark).toHaveBeenCalledWith({ id: videoItem.id });

    await user.click(screen.getByRole('button', { name: `Mark ${videoItem.title} as finished` }));
    expect(mutationSpies.toggleFinished).toHaveBeenCalledWith({ id: videoItem.id });

    expect(invalidateSpies.itemsGetInvalidate).toHaveBeenCalledWith({ id: videoItem.id });
    expect(invalidateSpies.itemsLibraryInvalidate).toHaveBeenCalled();
    expect(invalidateSpies.itemsHomeInvalidate).toHaveBeenCalled();
  });

  test('renders enrichment data beneath the bookmark detail when extracted data exists', () => {
    hookSpies.itemsGetEnrichmentUseQuery.mockImplementation((input) => ({
      data:
        input.id === videoItem.id
          ? {
              item: {
                status: 'COMPLETE',
                modelProvider: 'cloudflare',
                modelName: '@cf/qwen/qwen3-30b-a3b-fp8',
                summaryShort: 'A compact overview of design system scaling.',
                summaryDetail:
                  'Explains how stable primitives, tokens, and review habits keep interfaces coherent.',
                primaryCategory: 'Design systems',
                secondaryCategories: ['Frontend architecture', 'Product craft'],
                topics: [{ name: 'Design tokens', confidence: 0.92 }],
                entities: [{ name: 'Zine', type: 'product', confidence: 0.81 }],
                intent: 'Learn how to maintain UI consistency',
                difficulty: 'intermediate',
                evergreenScore: 0.88,
                timeSensitivity: 'low',
                confidence: {
                  overall: 0.91,
                  summary: 0.89,
                  classification: 0.86,
                  tags: 0.83,
                },
                enrichedAt: 1777587600000,
              },
              userItem: {
                status: 'COMPLETE',
                suggestedTags: [
                  {
                    name: 'Design systems',
                    normalizedName: 'design systems',
                    kind: 'topic',
                    confidence: 0.94,
                    matchedExistingTagId: null,
                  },
                ],
                inferredSaveIntent: 'Use as a reference for future UI work.',
                reasonToRevisit: 'Revisit before changing shared primitives.',
                enrichedAt: 1777587600000,
              },
            }
          : undefined,
      isLoading: false,
      error: null,
    }));

    renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${videoItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    expect(screen.getByText('Enrichment')).toBeVisible();
    expect(screen.getByText('A compact overview of design system scaling.')).toBeVisible();
    expect(screen.getByText('Design tokens 92%')).toBeVisible();
    expect(screen.getByText('Zine · Product · 81%')).toBeVisible();
    expect(screen.getByText('Use as a reference for future UI work.')).toBeVisible();
    expect(screen.getByText('Overall 91%')).toBeVisible();
    expect(screen.getByText('cloudflare · @cf/qwen/qwen3-30b-a3b-fp8')).toBeVisible();
  });

  test('uses the mobile-complete green fill for finished bookmark icons in detail view', () => {
    const finishedVideoItem = createLibraryItem({
      ...videoItem,
      isFinished: true,
    });

    hookSpies.itemsLibraryUseQuery.mockImplementation((input) => ({
      data: {
        items: input.filter.contentType
          ? [
              finishedVideoItem,
              ...libraryItems.filter((item) => item.id !== finishedVideoItem.id),
            ].filter((item) => item.contentType === input.filter.contentType)
          : [finishedVideoItem, ...libraryItems.filter((item) => item.id !== finishedVideoItem.id)],
      },
      isLoading: false,
      error: null,
    }));
    hookSpies.itemsGetUseQuery.mockImplementation((input) => {
      if (!input.id) {
        return { data: undefined, isLoading: false, error: null };
      }

      if (input.id === finishedVideoItem.id) {
        return { data: finishedVideoItem, isLoading: false, error: null };
      }

      const item = libraryItems.find((candidate) => candidate.id === input.id);
      return item
        ? { data: item, isLoading: false, error: null }
        : { data: undefined, isLoading: false, error: new Error('Missing bookmark') };
    });

    renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${finishedVideoItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    expect(
      screen
        .getByRole('button', { name: `Remove bookmark for ${finishedVideoItem.title}` })
        .querySelector('.new-page-bookmark-view__bookmark-icon')
    ).toHaveClass('new-page-bookmark-view__bookmark-icon--finished');
  });

  test('opens tag management from the action row and saves normalized tags', async () => {
    const user = userEvent.setup();
    const taggedVideoItem = createLibraryItem({
      ...videoItem,
      tags: [{ id: 'tag-design-systems', name: 'Design systems' }],
    });

    hookSpies.itemsLibraryUseQuery.mockImplementation((input) => ({
      data: {
        items: input.filter.contentType
          ? [
              taggedVideoItem,
              ...libraryItems.filter((item) => item.id !== taggedVideoItem.id),
            ].filter((item) => item.contentType === input.filter.contentType)
          : [taggedVideoItem, ...libraryItems.filter((item) => item.id !== taggedVideoItem.id)],
      },
      isLoading: false,
      error: null,
    }));
    hookSpies.itemsGetUseQuery.mockImplementation((input) => {
      if (!input.id) {
        return { data: undefined, isLoading: false, error: null };
      }

      if (input.id === taggedVideoItem.id) {
        return { data: taggedVideoItem, isLoading: false, error: null };
      }

      const item = libraryItems.find((candidate) => candidate.id === input.id);
      return item
        ? { data: item, isLoading: false, error: null }
        : { data: undefined, isLoading: false, error: new Error('Missing bookmark') };
    });
    hookSpies.itemsListTagsUseQuery.mockReturnValue({
      data: {
        tags: [
          { id: 'tag-design-systems', name: 'Design systems' },
          { id: 'tag-research', name: 'Research' },
        ],
      },
      isLoading: false,
      error: null,
    });

    renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${taggedVideoItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    await user.click(
      screen.getByRole('button', { name: `Manage tags for ${taggedVideoItem.title}` })
    );

    expect(screen.getByRole('heading', { name: 'Tags' })).toBeVisible();

    await user.type(screen.getByLabelText('Add or search tags'), '  Research   Notes  ');
    await user.click(screen.getByRole('button', { name: 'Add tag Research Notes' }));
    await user.click(screen.getByRole('button', { name: 'Save tags' }));

    expect(mutationSpies.setTags).toHaveBeenCalledWith({
      id: taggedVideoItem.id,
      tags: ['Design systems', 'Research Notes'],
    });
    expect(invalidateSpies.itemsGetInvalidate).toHaveBeenCalledWith({ id: taggedVideoItem.id });
    expect(invalidateSpies.itemsLibraryInvalidate).toHaveBeenCalled();
    expect(invalidateSpies.itemsHomeInvalidate).toHaveBeenCalled();
    expect(invalidateSpies.itemsListTagsInvalidate).toHaveBeenCalled();
  });

  test('marks a bookmark as opened when the provider FAB is used', async () => {
    const user = userEvent.setup();

    renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${videoItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    await user.click(screen.getByRole('link', { name: 'Open in YouTube' }));

    expect(mutationSpies.markOpened).toHaveBeenCalledWith({ id: videoItem.id });
    expect(invalidateSpies.itemsGetInvalidate).toHaveBeenCalledWith({ id: videoItem.id });
    expect(invalidateSpies.itemsHomeInvalidate).toHaveBeenCalled();
  });

  test('uses a drill-in flow on phone widths', async () => {
    const user = userEvent.setup();

    setViewportWidth(390);

    renderRoute(
      <>
        <BookmarksPage />
        <LocationProbe />
      </>,
      {
        route: '/bookmarks',
        path: '/bookmarks/:bookmarkId?',
      }
    );

    expect(screen.getByRole('heading', { name: 'Bookmarks' })).toBeVisible();
    expect(screen.queryByText('Select a bookmark')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current page location')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add bookmark' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back to bookmarks list' })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Design systems at scale/ }));

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent('/bookmarks/video-1');
    });

    expect(screen.getByRole('heading', { name: videoItem.title })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back to bookmarks list' })).toBeVisible();
    expect(screen.queryByText(articleItem.title)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to bookmarks list' }));

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent('/bookmarks');
    });

    expect(screen.getByText(articleItem.title)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Back to bookmarks list' })
    ).not.toBeInTheDocument();
  });

  test('toggles the selected bookmark card off from the desktop list', async () => {
    const user = userEvent.setup();

    const { container } = renderRoute(
      <>
        <BookmarksPage />
        <LocationProbe />
      </>,
      {
        route: `/bookmarks/${videoItem.id}`,
        path: '/bookmarks/:bookmarkId?',
      }
    );

    const selectedBookmarkCard = container.querySelector('.bookmark-row--selected');

    expect(selectedBookmarkCard).toBeDefined();
    expect(selectedBookmarkCard).toHaveTextContent(videoItem.title);
    expect(screen.getByRole('heading', { name: videoItem.title })).toBeVisible();

    await user.click(selectedBookmarkCard as HTMLElement);

    await waitFor(() => {
      expect(screen.getByTestId('location-path')).toHaveTextContent('/bookmarks');
    });

    expect(selectedBookmarkCard).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('heading', { name: videoItem.title })).not.toBeInTheDocument();
    expect(screen.getByText('Select a bookmark')).toBeVisible();
  });

  test('shows a mobile tab bar on phone widths and hides the sidebar', () => {
    setViewportWidth(390);

    const view = renderRoute(<BookmarksPage />, {
      route: '/bookmarks',
      path: '/bookmarks/:bookmarkId?',
    });

    const tabBar = screen.getByRole('navigation', { name: 'Tab bar' });
    expect(tabBar).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Bookmarks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();

    const bookmarksTab = screen.getByRole('link', { name: 'Bookmarks' });
    expect(bookmarksTab).toHaveAttribute('aria-current', 'page');
    expect(document.documentElement).toHaveClass('mobile-bookmarks-scroll-lock');
    expect(document.body).toHaveClass('mobile-bookmarks-scroll-lock');

    view.unmount();

    expect(document.documentElement).not.toHaveClass('mobile-bookmarks-scroll-lock');
    expect(document.body).not.toHaveClass('mobile-bookmarks-scroll-lock');
  });

  test('hides the mobile tab bar on phone detail routes', () => {
    setViewportWidth(390);

    renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${videoItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    expect(screen.queryByRole('navigation', { name: 'Tab bar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to bookmarks list' })).toBeVisible();
  });

  test('uses the same bookmark hero treatment for non-video content on phone widths', () => {
    setViewportWidth(390);

    const { container } = renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${articleItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    const hero = container.querySelector('.new-page-bookmark-view__hero');
    expect(hero).toBeTruthy();
    expect(hero?.className).toBe('new-page-bookmark-view__hero');
  });

  test('uses the same bookmark hero treatment for non-video content on desktop widths', () => {
    setViewportWidth(1280);

    const { container } = renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${articleItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    const hero = container.querySelector('.new-page-bookmark-view__hero');
    expect(hero).toBeTruthy();
    expect(hero?.className).toBe('new-page-bookmark-view__hero');
  });

  test('hides the mobile tab bar on desktop widths', () => {
    setViewportWidth(1280);

    renderRoute(<BookmarksPage />, {
      route: '/bookmarks',
      path: '/bookmarks/:bookmarkId?',
    });

    expect(screen.getByLabelText('Current page location')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add bookmark' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Tab bar' })).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass('mobile-bookmarks-scroll-lock');
    expect(document.body).not.toHaveClass('mobile-bookmarks-scroll-lock');
  });

  test('renders mobile post detail using the tweet-style layout on phone widths', () => {
    setViewportWidth(390);

    renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${postItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    expect(screen.getByLabelText('X post content')).toBeVisible();
    expect(screen.getByText(postItem.title)).toBeVisible();
    expect(screen.queryByRole('heading', { name: postItem.title })).not.toBeInTheDocument();
    expect(screen.queryByText('About this post')).not.toBeInTheDocument();
  });

  test('prefers the share API and falls back to the clipboard', async () => {
    const user = userEvent.setup();
    const shareMock = vi.fn(async () => undefined);
    const clipboardWriteText = vi.fn(async () => undefined);

    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: shareMock,
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

    renderRoute(<BookmarksPage />, {
      route: `/bookmarks/${videoItem.id}`,
      path: '/bookmarks/:bookmarkId',
    });

    await user.click(screen.getByRole('button', { name: `Share ${videoItem.title}` }));

    expect(shareMock).toHaveBeenCalledWith({
      title: videoItem.title,
      url: videoItem.canonicalUrl,
    });
    expect(clipboardWriteText).not.toHaveBeenCalled();

    shareMock.mockRejectedValueOnce(new Error('share unavailable'));
    await user.click(screen.getByRole('button', { name: `Share ${videoItem.title}` }));

    await waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith(videoItem.canonicalUrl);
    });
  });
});
