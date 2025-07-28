import { OAuthConfig } from './oauth-config'

export interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  scope?: string
}

export interface OAuthState {
  userId: string
  provider: string
  redirectUrl?: string
  timestamp: number
}

export class OAuthService {
  constructor(private config: OAuthConfig) {}

  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      access_type: 'offline', // For refresh tokens
      prompt: 'consent' // Force consent to get refresh token
    })

    return `${this.config.authUrl}?${params.toString()}`
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    })

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`)
    }

    return response.json() as Promise<OAuthTokenResponse>
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    })

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`)
    }

    return response.json() as Promise<OAuthTokenResponse>
  }
}

export function encodeState(state: OAuthState): string {
  // Use TextEncoder for Cloudflare Workers compatibility
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(state))
  
  // Convert to base64url format
  let base64 = btoa(String.fromCharCode(...data))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function decodeState(encodedState: string): OAuthState {
  try {
    // Convert from base64url to base64
    let base64 = encodedState.replace(/-/g, '+').replace(/_/g, '/')
    // Add padding if needed
    while (base64.length % 4) {
      base64 += '='
    }
    
    // Decode base64 and parse JSON
    const decoded = atob(base64)
    const decoder = new TextDecoder()
    const bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)))
    const json = decoder.decode(bytes)
    
    return JSON.parse(json)
  } catch (error) {
    throw new Error('Invalid state parameter')
  }
}

export async function getUserInfo(provider: string, accessToken: string): Promise<any> {
  switch (provider) {
    case 'spotify':
      return getSpotifyUserInfo(accessToken)
    case 'youtube':
      return getYouTubeUserInfo(accessToken)
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

async function getSpotifyUserInfo(accessToken: string): Promise<any> {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to get Spotify user info: ${response.status}`)
  }

  return response.json()
}

async function getYouTubeUserInfo(accessToken: string): Promise<any> {
  const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to get YouTube user info: ${response.status}`)
  }

  const data = await response.json() as { items?: any[] }
  return data.items?.[0] || { id: 'unknown' }
}