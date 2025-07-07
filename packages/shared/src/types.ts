// Shared types and schemas for Zine bookmark manager
import { z } from 'zod'

export const BookmarkSchema = z.object({
  id: z.string(),
  url: z.string().url().optional(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const CreateBookmarkSchema = z.object({
  url: z.string().url().optional(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const UpdateBookmarkSchema = CreateBookmarkSchema.partial()

export type Bookmark = z.infer<typeof BookmarkSchema>
export type CreateBookmark = z.infer<typeof CreateBookmarkSchema>
export type UpdateBookmark = z.infer<typeof UpdateBookmarkSchema>

// API Response types
export interface ApiResponse<T = any> {
  data?: T
  error?: string
  message?: string
}

export interface BookmarksResponse extends ApiResponse<Bookmark[]> {}
export interface BookmarkResponse extends ApiResponse<Bookmark> {}