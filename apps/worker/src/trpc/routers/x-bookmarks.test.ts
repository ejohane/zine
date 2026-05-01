/**
 * @vitest-environment miniflare
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

import { xBookmarksRouter } from './x-bookmarks';
import { XBookmarkSyncBlockedError } from '../../x-bookmarks/service';
import type * as XBookmarksService from '../../x-bookmarks/service';

const mockGetStatus = vi.fn();
const mockSync = vi.fn();
const mockUpdateSettings = vi.fn();

vi.mock('../../x-bookmarks/service', async () => {
  const actual = await vi.importActual<typeof XBookmarksService>('../../x-bookmarks/service');
  return {
    ...actual,
    getXBookmarkStatus: (...args: unknown[]) => mockGetStatus(...args),
    syncXBookmarksForUser: (...args: unknown[]) => mockSync(...args),
    updateXBookmarkSettings: (...args: unknown[]) => mockUpdateSettings(...args),
  };
});

function createCaller(environment = 'test') {
  return xBookmarksRouter.createCaller({
    userId: 'user-1',
    db: { query: {} },
    env: {
      ENVIRONMENT: environment,
    },
  } as never);
}

describe('xBookmarksRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns bookmark connection and sync status', async () => {
    mockGetStatus.mockResolvedValue({
      connected: true,
      connectionStatus: 'ACTIVE',
      importedCount: 12,
      sync: {
        status: 'SUCCESS',
        dailySyncEnabled: false,
      },
    });

    const result = await createCaller().status();

    expect(result.importedCount).toBe(12);
    expect(mockGetStatus).toHaveBeenCalledWith('user-1', expect.anything());
  });

  it('runs manual sync without bypass outside development', async () => {
    mockSync.mockResolvedValue({
      success: true,
      returned: 1,
      created: 1,
      skipped: 0,
      estimatedBillableReads: 1,
      nextCursor: null,
    });

    await createCaller('production').syncNow({ bypassCooldown: true });

    expect(mockSync).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'manual',
        bypassCooldown: false,
      })
    );
  });

  it('maps cooldown blocks to a rate-limit tRPC error', async () => {
    mockSync.mockRejectedValue(
      new XBookmarkSyncBlockedError(
        'COOLDOWN',
        'X bookmarks can only be synced once every 24 hours.',
        123
      )
    );

    await expect(createCaller().syncNow({})).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    });
  });

  it('updates daily sync settings', async () => {
    mockUpdateSettings.mockResolvedValue({ success: true, dailySyncEnabled: true });

    const result = await createCaller().updateSettings({ dailySyncEnabled: true });

    expect(result.dailySyncEnabled).toBe(true);
    expect(mockUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        dailySyncEnabled: true,
      })
    );
  });
});
