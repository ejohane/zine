import { and, eq } from 'drizzle-orm';
import { UserItemState } from '@zine/shared';
import type { Provider } from '@zine/shared';

import type { Database } from '../db';
import { subscriptions } from '../db/schema';

export type AutoBookmarkFields = {
  state: UserItemState;
  bookmarkedAt: string | null;
};

export function getAutoBookmarkFields(enabled: boolean, nowISO: string): AutoBookmarkFields {
  return enabled
    ? { state: UserItemState.BOOKMARKED, bookmarkedAt: nowISO }
    : { state: UserItemState.INBOX, bookmarkedAt: null };
}

/** Older isolated ingestion test doubles may not expose relational query helpers. */
export async function isProviderSubscriptionAutoBookmarkEnabled(
  db: Database,
  userId: string,
  subscriptionId: string,
  provider: Provider
): Promise<boolean> {
  const query = (
    db as unknown as {
      query?: {
        subscriptions?: {
          findFirst?: (args: unknown) => Promise<{ autoBookmark?: boolean } | undefined>;
        };
      };
    }
  ).query?.subscriptions;

  if (!query?.findFirst) return false;

  const row = await query.findFirst({
    where: and(
      eq(subscriptions.id, subscriptionId),
      eq(subscriptions.userId, userId),
      eq(subscriptions.provider, provider)
    ),
    columns: { autoBookmark: true },
  });

  return row?.autoBookmark === true;
}
