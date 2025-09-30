// Shared types and schemas for Zine bookmark manager
import { z } from 'zod'
import { optionalUnixTimestamp } from './validators'

// Source and content type enums
export const SourceEnum = z.enum(['youtube', 'spotify', 'twitter', 'x', 'substack', 'web'])
export const ContentTypeEnum = z.enum(['video', 'podcast', 'article', 'post', 'link'])
export const BookmarkStatusEnum = z.enum(['active', 'archived', 'deleted'])

// User schema
export const UserSchema = z.object({
  id: z.string(), // Clerk user ID
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  imageUrl: z.string().optional(),
  createdAt: optionalUnixTimestamp(),
  updatedAt: optionalUnixTimestamp(),
})

// Extended metadata schemas
export const VideoMetadataSchema = z.object({
  duration: z.number().optional(),
  viewCount: z.number().optional(),
  likeCount: z.number().optional(),
  channelId: z.string().optional(),
  categoryId: z.string().optional(),
})

export const PodcastMetadataSchema = z.object({
  episodeTitle: z.string().optional(),
  episodeNumber: z.number().optional(),
  seriesName: z.string().optional(),
  duration: z.number().optional(),
})

export const ArticleMetadataSchema = z.object({
  authorName: z.string().optional(),
  wordCount: z.number().optional(),
  readingTime: z.number().optional(),
})

export const PostMetadataSchema = z.object({
  postText: z.string().optional(),
  likeCount: z.number().optional(),
  repostCount: z.number().optional(),
})

// Creator schema
export const CreatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string().optional(),
  avatarUrl: z.string().optional(),
  verified: z.boolean().optional(),
  subscriberCount: z.number().optional(),
  followerCount: z.number().optional(),
  platform: z.string().optional(),
  bio: z.string().optional(),
  url: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  externalLinks: z.array(z.object({
    title: z.string(),
    url: z.string(),
  })).optional(),
  createdAt: optionalUnixTimestamp(),
  updatedAt: optionalUnixTimestamp(),
})

// Extended bookmark schema
export const BookmarkSchema = z.object({
  id: z.string(),
  userId: z.string(),
  url: z.string().url(),
  originalUrl: z.string().url(),
  title: z.string(),
  description: z.string().optional(),
  source: SourceEnum.optional(),
  contentType: ContentTypeEnum.optional(),
  thumbnailUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  publishedAt: optionalUnixTimestamp(),
  language: z.string().optional(),
  status: BookmarkStatusEnum.default('active'),
  creatorId: z.string().optional(),
  
  // Extended metadata
  videoMetadata: VideoMetadataSchema.optional(),
  podcastMetadata: PodcastMetadataSchema.optional(),
  articleMetadata: ArticleMetadataSchema.optional(),
  postMetadata: PostMetadataSchema.optional(),
  
  // Standard fields
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  createdAt: optionalUnixTimestamp(),
  updatedAt: optionalUnixTimestamp(),
  
  // Creator relation (always present for consistent API contract)
  creator: CreatorSchema.nullable(),
})

// Create schemas for API operations
export const CreateBookmarkSchema = z.object({
  url: z.string().url().optional(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const SaveBookmarkSchema = z.object({
  url: z.string().url(),
  notes: z.string().optional(),
})

export const UpdateBookmarkSchema = CreateBookmarkSchema.partial()

export const CreateCreatorSchema = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string().optional(),
  avatarUrl: z.string().optional(),
  bio: z.string().optional(),
  url: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  externalLinks: z.array(z.object({
    title: z.string(),
    url: z.string(),
  })).optional(),
})

// Type exports
export type User = z.infer<typeof UserSchema>
export type Creator = z.infer<typeof CreatorSchema>
export type Bookmark = z.infer<typeof BookmarkSchema>
export type CreateBookmark = z.infer<typeof CreateBookmarkSchema>
export type SaveBookmark = z.infer<typeof SaveBookmarkSchema>
export type UpdateBookmark = z.infer<typeof UpdateBookmarkSchema>
export type CreateCreator = z.infer<typeof CreateCreatorSchema>
export type VideoMetadata = z.infer<typeof VideoMetadataSchema>
export type PodcastMetadata = z.infer<typeof PodcastMetadataSchema>
export type ArticleMetadata = z.infer<typeof ArticleMetadataSchema>
export type PostMetadata = z.infer<typeof PostMetadataSchema>
export type Source = z.infer<typeof SourceEnum>
export type ContentType = z.infer<typeof ContentTypeEnum>
export type BookmarkStatus = z.infer<typeof BookmarkStatusEnum>

// API Response types
export interface ApiResponse<T = any> {
  data?: T
  error?: string
  message?: string
}

export interface BookmarksResponse extends ApiResponse<Bookmark[]> {}
export interface BookmarkResponse extends ApiResponse<Bookmark> {}