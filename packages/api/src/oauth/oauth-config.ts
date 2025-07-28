export interface OAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  authUrl: string
  tokenUrl: string
}

export interface OAuthProvider {
  id: string
  name: string
  config: OAuthConfig
}

export function getSpotifyConfig(env: any): OAuthConfig {
  return {
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    redirectUri: env.SPOTIFY_REDIRECT_URI || `${env.API_BASE_URL}/api/v1/auth/spotify/callback`,
    scopes: ['user-read-playback-position', 'user-library-read'],
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token'
  }
}

export function getYouTubeConfig(env: any): OAuthConfig {
  return {
    clientId: env.YOUTUBE_CLIENT_ID,
    clientSecret: env.YOUTUBE_CLIENT_SECRET,
    redirectUri: env.YOUTUBE_REDIRECT_URI || `${env.API_BASE_URL}/api/v1/auth/youtube/callback`,
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  }
}

export function getOAuthProviders(env: any): Record<string, OAuthProvider> {
  return {
    spotify: {
      id: 'spotify',
      name: 'Spotify',
      config: getSpotifyConfig(env)
    },
    youtube: {
      id: 'youtube', 
      name: 'YouTube',
      config: getYouTubeConfig(env)
    }
  }
}