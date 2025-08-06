export interface Env {
  DB: D1Database
  CLERK_SECRET_KEY: string
  // OAuth environment variables
  SPOTIFY_CLIENT_ID: string
  SPOTIFY_CLIENT_SECRET: string
  SPOTIFY_REDIRECT_URI?: string
  YOUTUBE_CLIENT_ID: string
  YOUTUBE_CLIENT_SECRET: string
  YOUTUBE_REDIRECT_URI?: string
  API_BASE_URL: string
  // Durable Objects
  USER_SUBSCRIPTION_MANAGER: DurableObjectNamespace
  // Feature flags
  FEATURE_USE_DO_TOKENS?: string
  FEATURE_DO_ROLLOUT_PERCENTAGE?: string
  FEATURE_DUAL_MODE_TOKENS?: string
  FEATURE_MIGRATION_METRICS?: string
}