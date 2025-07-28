export async function setupDatabase(db: D1Database) {
  try {
    // Tables are now created via Drizzle migrations
    // Just ensure subscription providers are initialized
    const existingProviders = await db.prepare('SELECT COUNT(*) as count FROM subscription_providers').first()
    
    if (existingProviders?.count === 0) {
      const now = Date.now()
      
      await db.prepare(`
        INSERT INTO subscription_providers (id, name, oauth_config, created_at) VALUES 
        ('spotify', 'Spotify', '{"scopes": ["user-read-playback-position", "user-library-read"], "description": "Access to your Spotify podcast subscriptions"}', ?),
        ('youtube', 'YouTube', '{"scopes": ["https://www.googleapis.com/auth/youtube.readonly"], "description": "Access to your YouTube channel subscriptions"}', ?)
      `).bind(now, now).run()
      
      console.log('Subscription providers initialized')
    } else {
      console.log('Subscription providers already exist')
    }
    
    return true
  } catch (error) {
    console.error('Database setup failed:', error)
    return false
  }
}