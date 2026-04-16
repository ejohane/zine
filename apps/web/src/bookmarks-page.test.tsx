import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { ContentType, Provider } from '@zine/shared';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { renderRoute } from './test/render-router';

vi.mock('./lib/trpc', () => import('./test/mocks/trpc'));

import { BookmarksPage } from './bookmarks-page';
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

const libraryItems = [articleItem, videoItem, podcastItem];

function LocationProbe() {
  const location = useLocation();

  return <output data-testid="location-search">{location.search}</output>;
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
        : createCreator(),
    isLoading: false,
    error: null,
  }));
}

describe('BookmarksPage', () => {
  beforeEach(() => {
    resetTrpcMocks();
    installDefaultBookmarkMocks();
    Object.defineProperty(window.navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  });

  test('renders loading, error, and empty states from the library query', () => {
    hookSpies.itemsLibraryUseQuery.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const loadingView = renderRoute(<BookmarksPage />, {
      route: '/bookmarks',
      path: '/bookmarks',
    });
    expect(screen.getByText('Loading bookmarks')).toBeVisible();
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
    expect(screen.getByText('Could not load bookmarks')).toBeVisible();
    expect(screen.getByText('Network down')).toBeVisible();
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
