import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  tags: text('tags'), // JSON string of tags array
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const insertBookmarkSchema = createInsertSchema(bookmarks)
export const selectBookmarkSchema = createSelectSchema(bookmarks)

export type Bookmark = typeof bookmarks.$inferSelect
export type NewBookmark = typeof bookmarks.$inferInsert