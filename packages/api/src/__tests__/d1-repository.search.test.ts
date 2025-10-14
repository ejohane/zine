import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { D1BookmarkRepository } from '../d1-repository'

class MockD1Database {
  constructor(private sqlite: any) {}

  prepare(query: string) {
    const statement = this.sqlite.prepare(query)

    return {
      bind: (...params: any[]) => ({
        all: async () => ({ results: statement.all(...params) }),
        first: async () => statement.get(...params) ?? undefined,
        run: async () => {
          const info = statement.run(...params)
          return { meta: { changes: info.changes ?? 0 } }
        }
      }),
      all: async () => ({ results: statement.all() }),
      first: async () => statement.get() ?? undefined,
      run: async () => {
        const info = statement.run()
        return { meta: { changes: info.changes ?? 0 } }
      }
    }
  }
}

describe('D1BookmarkRepository.searchByUserId', () => {
  let sqliteDb: any
  let repository: D1BookmarkRepository

  beforeEach(() => {
    sqliteDb = new Database(':memory:')

    sqliteDb.exec(`
      CREATE TABLE content (
        id TEXT PRIMARY KEY,
        url TEXT,
        external_id TEXT,
        title TEXT,
        description TEXT,
        thumbnail_url TEXT,
        favicon_url TEXT,
        creator_id TEXT,
        content_type TEXT,
        published_at INTEGER,
        provider TEXT,
        cross_platform_matches TEXT
      );

      CREATE TABLE creators (
        id TEXT PRIMARY KEY,
        name TEXT,
        handle TEXT,
        avatar_url TEXT,
        verified INTEGER,
        subscriber_count INTEGER,
        follower_count INTEGER,
        bio TEXT,
        url TEXT,
        platforms TEXT
      );

      CREATE TABLE bookmarks (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        content_id TEXT,
        status TEXT,
        user_tags TEXT,
        notes TEXT,
        bookmarked_at INTEGER
      );
    `)

    repository = new D1BookmarkRepository(new MockD1Database(sqliteDb) as unknown as D1Database)
  })

  afterEach(() => {
    sqliteDb.close()
  })

  const seedBookmark = (bookmark: {
    id: string
    userId: string
    contentId: string
    status: 'active' | 'archived' | 'deleted'
    bookmarkedAt: number
    title: string
    creator?: { id: string; name: string }
  }) => {
    sqliteDb.prepare(`
      INSERT INTO content (id, url, external_id, title, creator_id, provider)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      bookmark.contentId,
      `https://example.com/${bookmark.contentId}`,
      bookmark.contentId,
      bookmark.title,
      bookmark.creator?.id ?? null,
      'web'
    )

    if (bookmark.creator) {
      sqliteDb.prepare(`
        INSERT INTO creators (id, name)
        VALUES (?, ?)
      `).run(bookmark.creator.id, bookmark.creator.name)
    }

    sqliteDb.prepare(`
      INSERT INTO bookmarks (id, user_id, content_id, status, user_tags, notes, bookmarked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      bookmark.id,
      bookmark.userId,
      bookmark.contentId,
      bookmark.status,
      null,
      null,
      bookmark.bookmarkedAt
    )
  }

  it('returns active and archived bookmarks matching title or creator name case-insensitively', async () => {
    const baseTime = Date.now()

    seedBookmark({
      id: 'bookmark-1',
      userId: 'user-1',
      contentId: 'content-1',
      status: 'active',
      bookmarkedAt: baseTime,
      title: 'GraphQL Essentials',
      creator: { id: 'creator-1', name: 'Alice Johnson' }
    })

    seedBookmark({
      id: 'bookmark-2',
      userId: 'user-1',
      contentId: 'content-2',
      status: 'archived',
      bookmarkedAt: baseTime + 1000,
      title: 'Advanced GRAPH Strategies',
      creator: { id: 'creator-2', name: 'Bob Markov' }
    })

    seedBookmark({
      id: 'bookmark-3',
      userId: 'user-1',
      contentId: 'content-3',
      status: 'deleted',
      bookmarkedAt: baseTime + 2000,
      title: 'Graph delete me',
      creator: { id: 'creator-3', name: 'Deleted Creator' }
    })

    const { results, totalCount } = await repository.searchByUserId('user-1', {
      query: 'graph',
      limit: 10,
      offset: 0
    })

    expect(totalCount).toBe(2)
    expect(results).toHaveLength(2)
    expect(results.map((bookmark) => bookmark.id)).toEqual(['bookmark-2', 'bookmark-1'])
    expect(results[0].status).toBe('archived')
    expect(results[1].status).toBe('active')
  })

  it('supports pagination over matching results ordered by bookmarked_at', async () => {
    const baseTime = Date.now()

    seedBookmark({
      id: 'bookmark-1',
      userId: 'user-1',
      contentId: 'content-1',
      status: 'active',
      bookmarkedAt: baseTime,
      title: 'Graph Theory 101'
    })

    seedBookmark({
      id: 'bookmark-2',
      userId: 'user-1',
      contentId: 'content-2',
      status: 'active',
      bookmarkedAt: baseTime + 500,
      title: 'Graph Patterns'
    })

    seedBookmark({
      id: 'bookmark-3',
      userId: 'user-1',
      contentId: 'content-3',
      status: 'archived',
      bookmarkedAt: baseTime + 1000,
      title: 'Graph Visualizations'
    })

    const { results, totalCount } = await repository.searchByUserId('user-1', {
      query: 'graph',
      limit: 1,
      offset: 1
    })

    expect(totalCount).toBe(3)
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('bookmark-2')
  })
})
