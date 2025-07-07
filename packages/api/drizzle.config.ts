import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'sqlite',
  // Always use local SQLite for development and Drizzle Studio
  dbCredentials: {
    url: './local.db',
  },
})