import { describe, expect, it, vi } from 'vitest';

import { articleBodyDlqEvents } from '../db/schema';
import { resolveArticleBodyDlqEvents } from './service';

describe('article-body DLQ recovery', () => {
  it('marks unresolved audit rows resolved after a successful current-or-newer publication', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update };

    await resolveArticleBodyDlqEvents(db as never, 'item_1', 9, 1_700_000_000_000);

    expect(update).toHaveBeenCalledWith(articleBodyDlqEvents);
    expect(set).toHaveBeenCalledWith({ resolvedAt: 1_700_000_000_000 });
    expect(where).toHaveBeenCalledOnce();
  });
});
