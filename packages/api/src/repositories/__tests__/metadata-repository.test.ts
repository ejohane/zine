import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
import Database from 'better-sqlite3'
import { MetadataRepository } from '../metadata-repository'

// Mock D1Database
class MockD1Database {
  private db: any
  
  constructor(sqliteDb: any) {
    this.db = drizzle(sqliteDb)
  }
  
  async prepare(query: string) {
    return {
      bind: (..._params: any[]) => ({
        all: async () => this.db.all(sql.raw(query)),
        first: async () => this.db.all(sql.raw(query))[0],
        run: async () => this.db.run(sql.raw(query))
      }),
      all: async () => this.db.all(sql.raw(query)),
      first: async () => this.db.all(sql.raw(query))[0],
      run: async () => this.db.run(sql.raw(query))
    }
  }
  
  all(query: any) {
    return this.db.all(query)
  }
  
  run(query: any) {
    return this.db.run(query)
  }
  
  get(query: any) {
    return this.db.get(query)
  }
}

describe('MetadataRepository', () => {
  let db: any
  let repository: MetadataRepository
  let sqliteDb: any
  
  beforeAll(async () => {
    // Create in-memory SQLite database
    sqliteDb = new Database(':memory:')
    
    // Create schema
    sqliteDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        image_url TEXT,
        durable_object_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE TABLE bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        url TEXT NOT NULL,
        original_url TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        source TEXT,
        content_type TEXT,
        thumbnail_url TEXT,
        favicon_url TEXT,
        published_at INTEGER,
        language TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        creator_id TEXT,
        video_metadata TEXT,
        podcast_metadata TEXT,
        article_metadata TEXT,
        post_metadata TEXT,
        tags TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      CREATE TABLE subscriptions (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        creator_name TEXT NOT NULL,
        description TEXT,
        thumbnail_url TEXT,
        subscription_url TEXT,
        total_episodes INTEGER,
        video_count INTEGER,
        uploads_playlist_id TEXT,
        etag TEXT,
        last_polled_at INTEGER,
        created_at INTEGER NOT NULL
      );
      
      CREATE TABLE feed_items (
        id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        thumbnail_url TEXT,
        published_at INTEGER NOT NULL,
        duration_seconds INTEGER,
        external_url TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      
      CREATE INDEX idx_bookmarks_url ON bookmarks(url);
      CREATE INDEX idx_bookmarks_original_url ON bookmarks(original_url);
      CREATE INDEX idx_feed_items_external_url ON feed_items(external_url);
    `)
    
    db = new MockD1Database(sqliteDb) as any
    repository = new MetadataRepository(db as any)
  })
  
  afterEach(() => {
    // Clear data after each test
    sqliteDb.exec('DELETE FROM bookmarks')
    sqliteDb.exec('DELETE FROM feed_items')
    sqliteDb.exec('DELETE FROM users')
    sqliteDb.exec('DELETE FROM subscriptions')
  })
  
  describe('findInBookmarks', () => {
    it('should find bookmark by exact URL', async () => {
      // Insert test data
      const now = Date.now()
      sqliteDb.prepare(`
        INSERT INTO users (id, email, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('user-1', 'test@example.com', now, now)
      
      sqliteDb.prepare(`
        INSERT INTO bookmarks (
          user_id, url, original_url, title, description, thumbnail_url,
          source, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'user-1',
        'https://youtube.com/watch?v=abc123',
        'https://www.youtube.com/watch?v=abc123&utm_source=share',
        'Test Video',
        'A test video description',
        'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
        'youtube',
        now - 86400000,
        now,
        now
      )
      
      const result = await repository.findInBookmarks('https://youtube.com/watch?v=abc123')
      
      expect(result).toBeTruthy()
      expect(result?.title).toBe('Test Video')
      expect(result?.source).toBe('bookmark')
      expect(result?.provider).toBe('youtube')
    })
    
    it('should find bookmark by normalized URL', async () => {
      const now = Date.now()
      sqliteDb.prepare(`
        INSERT INTO users (id, email, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('user-1', 'test@example.com', now, now)
      
      sqliteDb.prepare(`
        INSERT INTO bookmarks (
          user_id, url, original_url, title, description, thumbnail_url,
          source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'user-1',
        'https://youtube.com/watch?v=abc123',
        'https://www.youtube.com/watch?v=abc123',
        'Test Video',
        'A test video description',
        'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
        'youtube',
        now,
        now
      )
      
      // Search with non-normalized URL
      const result = await repository.findInBookmarks('https://www.youtube.com/watch?v=abc123&utm_source=share')
      
      expect(result).toBeTruthy()
      expect(result?.title).toBe('Test Video')
      expect(result?.normalizedUrl).toBe('https://youtube.com/watch?v=abc123')
    })
    
    it('should extract video metadata', async () => {
      const now = Date.now()
      sqliteDb.prepare(`
        INSERT INTO users (id, email, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('user-1', 'test@example.com', now, now)
      
      const videoMetadata = JSON.stringify({ duration: 300, view_count: 1000 })
      sqliteDb.prepare(`
        INSERT INTO bookmarks (
          user_id, url, original_url, title, video_metadata,
          source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'user-1',
        'https://youtube.com/watch?v=abc123',
        'https://youtube.com/watch?v=abc123',
        'Test Video',
        videoMetadata,
        'youtube',
        now,
        now
      )
      
      const result = await repository.findInBookmarks('https://youtube.com/watch?v=abc123')
      
      expect(result?.duration).toBe(300)
      expect(result?.viewCount).toBe(1000)
    })
    
    it('should return null for non-existent bookmark', async () => {
      const result = await repository.findInBookmarks('https://example.com/not-found')
      expect(result).toBeNull()
    })
  })
  
  describe('findInFeedItems', () => {
    it('should find feed item by URL', async () => {
      const now = Date.now()
      
      sqliteDb.prepare(`
        INSERT INTO subscriptions (
          id, provider_id, external_id, title, creator_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'spotify:show:abc123',
        'spotify',
        'abc123',
        'Test Podcast',
        'Test Creator',
        now
      )
      
      sqliteDb.prepare(`
        INSERT INTO feed_items (
          id, subscription_id, external_id, title, description,
          thumbnail_url, published_at, duration_seconds, external_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'spotify:episode:xyz789',
        'spotify:show:abc123',
        'xyz789',
        'Test Episode',
        'Episode description',
        'https://example.com/thumb.jpg',
        now - 86400000,
        1800,
        'https://open.spotify.com/episode/xyz789',
        now
      )
      
      const result = await repository.findInFeedItems('https://open.spotify.com/episode/xyz789')
      
      expect(result).toBeTruthy()
      expect(result?.title).toBe('Test Episode')
      expect(result?.source).toBe('feed_item')
      expect(result?.provider).toBe('spotify')
      expect(result?.duration).toBe(1800)
    })
    
    it('should detect provider from subscription ID', async () => {
      const now = Date.now()
      
      // YouTube feed item
      sqliteDb.prepare(`
        INSERT INTO subscriptions (
          id, provider_id, external_id, title, creator_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'youtube:channel:UC123',
        'youtube',
        'UC123',
        'Test Channel',
        'Test Creator',
        now
      )
      
      sqliteDb.prepare(`
        INSERT INTO feed_items (
          id, subscription_id, external_id, title, external_url,
          published_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'youtube:video:vid123',
        'youtube:channel:UC123',
        'vid123',
        'Test Video',
        'https://youtube.com/watch?v=vid123',
        now,
        now
      )
      
      const result = await repository.findInFeedItems('https://youtube.com/watch?v=vid123')
      
      expect(result?.provider).toBe('youtube')
      expect(result?.platform).toBe('youtube')
    })
    
    it('should return null for non-existent feed item', async () => {
      const result = await repository.findInFeedItems('https://example.com/not-found')
      expect(result).toBeNull()
    })
  })
  
  describe('findByUrl', () => {
    it('should prefer bookmarks over feed items', async () => {
      const now = Date.now()
      const url = 'https://youtube.com/watch?v=abc123'
      
      // Insert both bookmark and feed item with same URL
      sqliteDb.prepare(`
        INSERT INTO users (id, email, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('user-1', 'test@example.com', now, now)
      
      sqliteDb.prepare(`
        INSERT INTO bookmarks (
          user_id, url, original_url, title, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('user-1', url, url, 'Bookmark Title', 'youtube', now, now)
      
      sqliteDb.prepare(`
        INSERT INTO subscriptions (
          id, provider_id, external_id, title, creator_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run('youtube:channel:UC123', 'youtube', 'UC123', 'Test Channel', 'Creator', now)
      
      sqliteDb.prepare(`
        INSERT INTO feed_items (
          id, subscription_id, external_id, title, external_url,
          published_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('youtube:video:abc123', 'youtube:channel:UC123', 'abc123', 'Feed Item Title', url, now, now)
      
      const result = await repository.findExistingMetadata(url)
      
      expect(result?.title).toBe('Bookmark Title')
      expect(result?.source).toBe('bookmark')
    })
    
    it('should fall back to feed items if bookmark not found', async () => {
      const now = Date.now()
      const url = 'https://spotify.com/episode/xyz789'
      
      sqliteDb.prepare(`
        INSERT INTO subscriptions (
          id, provider_id, external_id, title, creator_name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run('spotify:show:show123', 'spotify', 'show123', 'Test Show', 'Creator', now)
      
      sqliteDb.prepare(`
        INSERT INTO feed_items (
          id, subscription_id, external_id, title, external_url,
          published_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('spotify:episode:xyz789', 'spotify:show:show123', 'xyz789', 'Episode Title', url, now, now)
      
      const result = await repository.findExistingMetadata(url)
      
      expect(result?.title).toBe('Episode Title')
      expect(result?.source).toBe('feed_item')
    })
    
    it('should handle URL normalization across both tables', async () => {
      const now = Date.now()
      
      sqliteDb.prepare(`
        INSERT INTO users (id, email, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('user-1', 'test@example.com', now, now)
      
      // Bookmark with normalized URL
      sqliteDb.prepare(`
        INSERT INTO bookmarks (
          user_id, url, original_url, title, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'user-1',
        'https://youtube.com/watch?v=test123',
        'https://www.youtube.com/watch?v=test123&utm_source=share',
        'Test Video',
        'youtube',
        now,
        now
      )
      
      // Search with non-normalized URL
      const result = await repository.findExistingMetadata('https://www.youtube.com/watch?v=test123&utm_campaign=test')
      
      expect(result).toBeTruthy()
      expect(result?.title).toBe('Test Video')
      expect(result?.normalizedUrl).toBe('https://youtube.com/watch?v=test123')
    })

    it('should handle Spotify URL variants and URIs', async () => {
      const now = Date.now()
      const canonical = 'https://open.spotify.com/episode/xyz789'

      sqliteDb.prepare(`
        INSERT INTO users (id, email, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run('user-spotify', 'spotify@example.com', now, now)

      sqliteDb.prepare(`
        INSERT INTO bookmarks (
          user_id, url, original_url, title, source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        'user-spotify',
        canonical,
        canonical,
        'Spotify Episode',
        'spotify',
        now,
        now
      )

      const localeResult = await repository.findExistingMetadata('https://open.spotify.com/intl-en/episode/xyz789?si=abc123')
      expect(localeResult).toBeTruthy()
      expect(localeResult?.normalizedUrl).toBe(canonical)

      const uriResult = await repository.findExistingMetadata('spotify:episode:xyz789')
      expect(uriResult).toBeTruthy()
      expect(uriResult?.normalizedUrl).toBe(canonical)
    })
  })
})
