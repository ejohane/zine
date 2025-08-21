import { describe, expect, test, vi, beforeEach } from 'vitest'
import { OAuthTokenService, TokenAvailability, TokenStatus } from '../oauth-token-service'
import { DualModeTokenService } from '../dual-mode-token-service'

// Mock the DualModeTokenService
vi.mock('../dual-mode-token-service', () => ({
  DualModeTokenService: vi.fn().mockImplementation(() => ({
    getTokens: vi.fn(),
    updateToken: vi.fn(),
    getTokenRefreshBuffer: vi.fn().mockReturnValue(60 * 60 * 1000) // 1 hour
  }))
}))

// Mock the OAuth modules
vi.mock('../../oauth/oauth-config', () => ({
  getOAuthProviders: vi.fn().mockReturnValue({
    spotify: {
      config: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        redirectUri: 'http://localhost:8787/callback',
        authUrl: 'https://accounts.spotify.com/authorize',
        tokenUrl: 'https://accounts.spotify.com/api/token',
        scopes: ['user-read-playback-position', 'user-library-read']
      }
    },
    youtube: {
      config: {
        clientId: 'test-youtube-client',
        clientSecret: 'test-youtube-secret',
        redirectUri: 'http://localhost:8787/callback',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scopes: ['https://www.googleapis.com/auth/youtube.readonly']
      }
    }
  })
}))

vi.mock('../../oauth/oauth-service', () => ({
  OAuthService: vi.fn().mockImplementation(() => ({
    refreshToken: vi.fn()
  }))
}))

describe('OAuthTokenService', () => {
  let service: OAuthTokenService
  let mockEnv: any
  let mockDualModeTokenService: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockEnv = {
      DB: {},
      USER_SUBSCRIPTION_MANAGER: {}
    }
    
    service = new OAuthTokenService(mockEnv)
    // Get the mocked instance
    mockDualModeTokenService = (DualModeTokenService as any).mock.results[0].value
  })

  describe('checkTokenAvailability', () => {
    test('should return available when token exists and is valid', async () => {
      const validToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'valid-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
        }]
      ])
      
      mockDualModeTokenService.getTokens.mockResolvedValue(validToken)
      
      const result = await service.checkTokenAvailability('user-123', 'spotify')
      
      expect(result).toEqual<TokenAvailability>({
        provider: 'spotify',
        available: true,
        requiresRefresh: false
      })
    })

    test('should return not available when no token exists', async () => {
      mockDualModeTokenService.getTokens.mockResolvedValue(new Map())
      
      const result = await service.checkTokenAvailability('user-123', 'spotify')
      
      expect(result).toEqual<TokenAvailability>({
        provider: 'spotify',
        available: false,
        requiresRefresh: false,
        error: 'No token found'
      })
    })

    test('should return expired when token is past expiry', async () => {
      const expiredToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() - 60 * 1000) // 1 minute ago
        }]
      ])
      
      mockDualModeTokenService.getTokens.mockResolvedValue(expiredToken)
      
      const result = await service.checkTokenAvailability('user-123', 'spotify')
      
      expect(result).toEqual<TokenAvailability>({
        provider: 'spotify',
        available: false,
        requiresRefresh: true,
        error: 'Token expired'
      })
    })

    test('should indicate refresh needed when token expires soon', async () => {
      const expiringSoonToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'expiring-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes from now
        }]
      ])
      
      mockDualModeTokenService.getTokens.mockResolvedValue(expiringSoonToken)
      
      const result = await service.checkTokenAvailability('user-123', 'spotify')
      
      expect(result).toEqual<TokenAvailability>({
        provider: 'spotify',
        available: true,
        requiresRefresh: true,
        error: 'Token expiring soon'
      })
    })

    test('should handle tokens without expiry date', async () => {
      const noExpiryToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'no-expiry-token',
          refreshToken: 'refresh-token',
          expiresAt: undefined
        }]
      ])
      
      mockDualModeTokenService.getTokens.mockResolvedValue(noExpiryToken)
      
      const result = await service.checkTokenAvailability('user-123', 'spotify')
      
      expect(result).toEqual<TokenAvailability>({
        provider: 'spotify',
        available: true,
        requiresRefresh: false
      })
    })

    test('should handle errors gracefully', async () => {
      mockDualModeTokenService.getTokens.mockRejectedValue(new Error('Database error'))
      
      const result = await service.checkTokenAvailability('user-123', 'spotify')
      
      expect(result).toEqual<TokenAvailability>({
        provider: 'spotify',
        available: false,
        requiresRefresh: false,
        error: 'Database error'
      })
    })
  })

  describe('getTokenStatus', () => {
    test('should return status for all providers', async () => {
      const tokens = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'spotify-token',
          refreshToken: 'spotify-refresh',
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours
        }],
        ['youtube', {
          provider: 'youtube' as const,
          accessToken: 'youtube-token',
          refreshToken: undefined,
          expiresAt: new Date(Date.now() - 60 * 1000) // expired
        }]
      ])
      
      mockDualModeTokenService.getTokens
        .mockResolvedValueOnce(tokens) // First call for spotify
        .mockResolvedValueOnce(tokens) // Second call for youtube
      
      const result = await service.getTokenStatus('user-123')
      
      expect(result).toHaveLength(2)
      
      // Spotify token should be valid
      const spotifyStatus = result.find(s => s.provider === 'spotify')
      expect(spotifyStatus).toMatchObject<Partial<TokenStatus>>({
        provider: 'spotify',
        hasToken: true,
        isValid: true,
        isExpired: false,
        isExpiringSoon: false,
        canRefresh: false
      })
      
      // YouTube token should be expired
      const youtubeStatus = result.find(s => s.provider === 'youtube')
      expect(youtubeStatus).toMatchObject<Partial<TokenStatus>>({
        provider: 'youtube',
        hasToken: true,
        isValid: false,
        isExpired: true,
        isExpiringSoon: false,
        canRefresh: false // No refresh token
      })
    })

    test('should handle missing tokens', async () => {
      mockDualModeTokenService.getTokens.mockResolvedValue(new Map())
      
      const result = await service.getTokenStatus('user-123')
      
      expect(result).toHaveLength(2)
      
      result.forEach(status => {
        expect(status.hasToken).toBe(false)
        expect(status.isValid).toBe(false)
        expect(status.canRefresh).toBe(false)
      })
    })
  })

  describe('getValidToken', () => {
    test('should return valid token directly', async () => {
      const validToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'valid-access-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
        }]
      ])
      
      mockDualModeTokenService.getTokens.mockResolvedValue(validToken)
      
      const token = await service.getValidToken('user-123', 'spotify')
      
      expect(token).toBe('valid-access-token')
    })

    test('should return null when no token exists', async () => {
      mockDualModeTokenService.getTokens.mockResolvedValue(new Map())
      
      const token = await service.getValidToken('user-123', 'spotify')
      
      expect(token).toBeNull()
    })

    test('should attempt refresh when token is expiring soon', async () => {
      const expiringSoonToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'old-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
        }]
      ])
      
      const refreshedToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'new-refreshed-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000)
        }]
      ])
      
      // Mock the OAuth service's refreshToken method
      const { OAuthService } = await import('../../oauth/oauth-service')
      const mockOAuthService = (OAuthService as any).mock.results[0].value
      mockOAuthService.refreshToken.mockResolvedValue({
        access_token: 'new-refreshed-token',
        refresh_token: 'refresh-token',
        expires_in: 7200,
        token_type: 'Bearer'
      })
      
      mockDualModeTokenService.getTokens
        .mockResolvedValueOnce(expiringSoonToken) // First check
        .mockResolvedValueOnce(expiringSoonToken) // For refresh
        .mockResolvedValueOnce(refreshedToken) // After refresh
      
      const token = await service.getValidToken('user-123', 'spotify')
      
      expect(mockDualModeTokenService.updateToken).toHaveBeenCalledWith('user-123', {
        provider: 'spotify',
        accessToken: 'new-refreshed-token',
        refreshToken: 'refresh-token',
        expiresAt: expect.any(Date)
      })
      
      expect(token).toBe('new-refreshed-token')
    })

    test('should handle refresh failures gracefully', async () => {
      const expiredToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() - 60 * 1000) // expired
        }]
      ])
      
      // Mock refresh failure
      const { OAuthService } = await import('../../oauth/oauth-service')
      const mockOAuthService = (OAuthService as any).mock.results[0].value
      mockOAuthService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'))
      
      mockDualModeTokenService.getTokens
        .mockResolvedValueOnce(expiredToken) // First check
        .mockResolvedValueOnce(expiredToken) // For refresh
      
      const token = await service.getValidToken('user-123', 'spotify')
      
      expect(token).toBeNull() // Should return null since token is expired and refresh failed
    })
  })

  describe('exponential backoff', () => {
    test('should implement exponential backoff for failed refreshes', async () => {
      const expiredToken = new Map([
        ['spotify', {
          provider: 'spotify' as const,
          accessToken: 'expired-token',
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() - 60 * 1000)
        }]
      ])
      
      // Mock refresh failure
      const { OAuthService } = await import('../../oauth/oauth-service')
      const mockOAuthService = (OAuthService as any).mock.results[0].value
      mockOAuthService.refreshToken.mockRejectedValue(new Error('Network error'))
      
      mockDualModeTokenService.getTokens.mockResolvedValue(expiredToken)
      
      // First attempt should proceed
      const result1 = await service.refreshToken('user-123', 'spotify', 'refresh-token')
      expect(result1.success).toBe(false)
      expect(result1.error).toBe('Network error')
      
      // Second immediate attempt should be rate limited
      const result2 = await service.refreshToken('user-123', 'spotify', 'refresh-token')
      expect(result2.success).toBe(false)
      expect(result2.error).toContain('Rate limited')
    })
  })

  describe('concurrent refresh handling', () => {
    test('should handle concurrent refresh requests', async () => {
      const { OAuthService } = await import('../../oauth/oauth-service')
      const mockOAuthService = (OAuthService as any).mock.results[0].value
      
      // Create a delayed mock to simulate a slow refresh
      let resolveRefresh: any
      const refreshPromise = new Promise((resolve) => {
        resolveRefresh = resolve
      })
      
      mockOAuthService.refreshToken.mockReturnValue(refreshPromise)
      
      // Start two concurrent refreshes
      const refresh1Promise = service.handleConcurrentRefresh('user-123', 'spotify', 'refresh-token')
      const refresh2Promise = service.handleConcurrentRefresh('user-123', 'spotify', 'refresh-token')
      
      // Both should be the same promise (second waits for first)
      expect(refresh1Promise).toBe(refresh2Promise)
      
      // Resolve the refresh
      resolveRefresh({
        access_token: 'new-token',
        refresh_token: 'refresh-token',
        expires_in: 7200,
        token_type: 'Bearer'
      })
      
      const result1 = await refresh1Promise
      const result2 = await refresh2Promise
      
      expect(result1).toBe(result2)
      expect(mockOAuthService.refreshToken).toHaveBeenCalledTimes(1) // Only called once
    })
  })
})