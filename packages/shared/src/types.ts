import { z } from 'zod'

export const BookmarkSchema = z.object({
  id: z.number(),
  url: z.string().url(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export const CreateBookmarkSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const UpdateBookmarkSchema = CreateBookmarkSchema.partial()

export type Bookmark = z.infer<typeof BookmarkSchema>
export type CreateBookmark = z.infer<typeof CreateBookmarkSchema>
export type UpdateBookmark = z.infer<typeof UpdateBookmarkSchema>