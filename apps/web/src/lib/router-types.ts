import type { inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@zine/worker/trpc/router';

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type LibraryItem = RouterOutputs['items']['library']['items'][number];
export type BookmarkPreview = RouterOutputs['bookmarks']['preview'];
export type BookmarkSaveResult = RouterOutputs['bookmarks']['save'];
