/**
 * Bookmark save service - orchestrates the complete save workflow
 */

import { normalizeUrl, areUrlsDuplicates } from './url-normalizer'
import { enhancedMetadataExtractor } from './enhanced-metadata-extractor'
import type { 
  Bookmark, 
  SaveBookmark, 
  CreateBookmark
} from './types'
import type { BookmarkRepository } from './api-service'

// Enhanced repository interface for D1
export interface EnhancedBookmarkRepository extends BookmarkRepository {
  createWithMetadata?: (bookmarkData: {
    userId: string
    url: string
    originalUrl: string
    title: string
    description?: string
    source?: string
    contentType?: string
    thumbnailUrl?: string
    faviconUrl?: string
    publishedAt?: Date
    language?: string
    status?: string
    creatorId?: string
    videoMetadata?: any
    podcastMetadata?: any
    articleMetadata?: any
    postMetadata?: any
    tags?: string[]
    notes?: string
  }) => Promise<Bookmark>
}

export interface SaveBookmarkResult {
  success: boolean
  bookmark?: Bookmark
  duplicate?: Bookmark
  error?: string
  message?: string
}

export interface DuplicateCheckResult {
  isDuplicate: boolean
  existingBookmark?: Bookmark
}

/**
 * Service for saving bookmarks with metadata extraction and duplicate detection
 */
export class BookmarkSaveService {
  constructor(private repository: EnhancedBookmarkRepository) {}

  /**
   * Save a bookmark from a URL with full metadata extraction
   */
  async saveBookmark(input: SaveBookmark, userId: string = '1'): Promise<SaveBookmarkResult> {
    try {
      // Step 1: Normalize the URL
      const normalized = normalizeUrl(input.url)
      
      // Step 2: Check for duplicates
      const duplicateCheck = await this.checkForDuplicates(normalized.normalized, userId)
      if (duplicateCheck.isDuplicate) {
        return {
          success: false,
          duplicate: duplicateCheck.existingBookmark,
          message: 'Bookmark already exists'
        }
      }

      // Step 3: Extract metadata
      const metadataResult = await enhancedMetadataExtractor.extractMetadata(input.url)
      
      if (!metadataResult.success) {
        return {
          success: false,
          error: metadataResult.error || 'Failed to extract metadata'
        }
      }

      const metadata = metadataResult.metadata!

      // Step 4: Create the bookmark with full metadata
      let newBookmark: Bookmark

      if (this.repository.createWithMetadata) {
        // Use enhanced repository method if available (D1)
        newBookmark = await this.repository.createWithMetadata({
          userId,
          url: normalized.normalized,
          originalUrl: input.url,
          title: metadata.title,
          description: metadata.description,
          source: metadata.source,
          contentType: metadata.contentType,
          thumbnailUrl: metadata.thumbnailUrl,
          faviconUrl: metadata.faviconUrl,
          publishedAt: metadata.publishedAt,
          language: metadata.language,
          status: 'active',
          creatorId: metadata.creator?.id,
          videoMetadata: metadata.videoMetadata,
          podcastMetadata: metadata.podcastMetadata,
          articleMetadata: metadata.articleMetadata,
          postMetadata: metadata.postMetadata,
          tags: [],
          notes: input.notes
        })
      } else {
        // Fallback to basic repository method
        const createData: CreateBookmark & { userId: string } = {
          title: metadata.title,
          description: metadata.description,
          url: normalized.normalized,
          tags: [],
          userId
        }

        const basicBookmark = await this.repository.create(createData)
        
        // Enhance the bookmark with full metadata (for in-memory repo)
        newBookmark = {
          ...basicBookmark,
          userId,
          originalUrl: input.url,
          url: normalized.normalized,
          source: metadata.source,
          contentType: metadata.contentType,
          thumbnailUrl: metadata.thumbnailUrl,
          faviconUrl: metadata.faviconUrl,
          publishedAt: metadata.publishedAt,
          language: metadata.language,
          status: 'active',
          videoMetadata: metadata.videoMetadata,
          podcastMetadata: metadata.podcastMetadata,
          articleMetadata: metadata.articleMetadata,
          postMetadata: metadata.postMetadata,
          notes: input.notes,
          creator: metadata.creator,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }

      return {
        success: true,
        bookmark: newBookmark,
        message: 'Bookmark saved successfully'
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during bookmark save'
      }
    }
  }

  /**
   * Preview metadata for a URL without saving
   */
  async previewMetadata(url: string): Promise<SaveBookmarkResult> {
    try {
      // Normalize the URL
      const normalized = normalizeUrl(url)
      
      // Extract metadata
      const metadataResult = await enhancedMetadataExtractor.extractMetadata(url)
      
      if (!metadataResult.success) {
        return {
          success: false,
          error: metadataResult.error || 'Failed to extract metadata'
        }
      }

      const metadata = metadataResult.metadata!

      // Create a preview bookmark (not saved)
      const previewBookmark: Bookmark = {
        id: 'preview',
        userId: '1',
        originalUrl: url,
        url: normalized.normalized,
        title: metadata.title,
        description: metadata.description,
        source: metadata.source,
        contentType: metadata.contentType,
        thumbnailUrl: metadata.thumbnailUrl,
        faviconUrl: metadata.faviconUrl,
        publishedAt: metadata.publishedAt,
        language: metadata.language,
        status: 'active',
        videoMetadata: metadata.videoMetadata,
        podcastMetadata: metadata.podcastMetadata,
        articleMetadata: metadata.articleMetadata,
        postMetadata: metadata.postMetadata,
        creator: metadata.creator,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      return {
        success: true,
        bookmark: previewBookmark,
        message: 'Metadata extracted successfully'
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during metadata preview'
      }
    }
  }

  /**
   * Check if a URL already exists in the user's bookmarks
   */
  async checkForDuplicates(url: string, userId: string = '1'): Promise<DuplicateCheckResult> {
    try {
      const allBookmarks = await this.repository.getAll()
      const userBookmarks = allBookmarks.filter((b: Bookmark) => b.userId === userId && b.status === 'active')
      
      // Check for exact URL matches (normalized)
      const exactMatch = userBookmarks.find((bookmark: Bookmark) => 
        bookmark.url === url || areUrlsDuplicates(bookmark.url, url)
      )

      if (exactMatch) {
        return {
          isDuplicate: true,
          existingBookmark: exactMatch
        }
      }

      // TODO: In Phase 5, add fuzzy matching based on title + creator
      
      return {
        isDuplicate: false
      }

    } catch (error) {
      // If duplicate check fails, allow the save to proceed
      return {
        isDuplicate: false
      }
    }
  }

  /**
   * Refresh metadata for an existing bookmark
   */
  async refreshMetadata(bookmarkId: string): Promise<SaveBookmarkResult> {
    try {
      const existingBookmark = await this.repository.getById(bookmarkId)
      if (!existingBookmark) {
        return {
          success: false,
          error: 'Bookmark not found'
        }
      }

      // Re-extract metadata using the original URL
      const metadataResult = await enhancedMetadataExtractor.extractMetadata(existingBookmark.originalUrl || existingBookmark.url)
      
      if (!metadataResult.success) {
        return {
          success: false,
          error: metadataResult.error || 'Failed to refresh metadata'
        }
      }

      const metadata = metadataResult.metadata!

      // Update the bookmark with fresh metadata
      const updatedBookmark = await this.repository.update(bookmarkId, {
        title: metadata.title,
        description: metadata.description,
        // Keep existing URL normalization
        // source: metadata.source, // Keep existing source
        // contentType: metadata.contentType, // Keep existing content type
        // thumbnailUrl: metadata.thumbnailUrl,
        // faviconUrl: metadata.faviconUrl,
        // publishedAt: metadata.publishedAt,
        // language: metadata.language,
        // tags: existing tags (don't overwrite user tags)
      })

      if (!updatedBookmark) {
        return {
          success: false,
          error: 'Failed to update bookmark'
        }
      }

      return {
        success: true,
        bookmark: updatedBookmark,
        message: 'Bookmark metadata refreshed successfully'
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during metadata refresh'
      }
    }
  }
}

// Note: This will be instantiated in the API layer with the proper repository