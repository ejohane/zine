import { getOAuthProviders } from '../oauth/oauth-config'
import { OAuthService } from '../oauth/oauth-service'
import { DualModeTokenService } from './dual-mode-token-service'
import type { Env } from '../types'

export interface TokenStatus {
  provider: 'spotify' | 'youtube'
  hasToken: boolean
  isValid: boolean
  isExpired: boolean
  isExpiringSoon: boolean
  canRefresh: boolean
  expiresAt?: Date
  error?: string
}

export interface TokenAvailability {
  provider: 'spotify' | 'youtube'
  available: boolean
  requiresRefresh: boolean
  error?: string
}

export interface RefreshResult {
  success: boolean
  provider: 'spotify' | 'youtube'
  newExpiresAt?: Date
  error?: string
}

export class OAuthTokenService {
  private dualModeTokenService: DualModeTokenService
  private env: Env
  private refreshAttempts = new Map<string, { count: number; lastAttempt: Date; nextAllowedAttempt: Date }>()
  private readonly EXPIRY_BUFFER_MS = 60 * 60 * 1000 // 1 hour buffer
  private readonly MAX_REFRESH_ATTEMPTS = 3
  private readonly REFRESH_BACKOFF_BASE_MS = 60 * 1000 // 1 minute base backoff

  constructor(env: Env) {
    this.env = env
    this.dualModeTokenService = new DualModeTokenService(env)
  }

  /**
   * Check if a user has a valid token for a provider
   */
  async checkTokenAvailability(userId: string, provider: 'spotify' | 'youtube'): Promise<TokenAvailability> {
    try {
      const tokens = await this.dualModeTokenService.getTokens(userId)
      const tokenData = tokens.get(provider)

      if (!tokenData || !tokenData.accessToken) {
        return {
          provider,
          available: false,
          requiresRefresh: false,
          error: 'No token found'
        }
      }

      // Check if token is expired or expiring soon
      const now = new Date()
      const expiresAt = tokenData.expiresAt

      if (!expiresAt) {
        // No expiry info, assume valid
        return {
          provider,
          available: true,
          requiresRefresh: false
        }
      }

      const expiryTime = expiresAt.getTime()
      const nowTime = now.getTime()

      if (expiryTime <= nowTime) {
        // Token is expired, needs refresh
        return {
          provider,
          available: false,
          requiresRefresh: true,
          error: 'Token expired'
        }
      }

      if (expiryTime <= nowTime + this.EXPIRY_BUFFER_MS) {
        // Token expiring soon, should refresh
        return {
          provider,
          available: true,
          requiresRefresh: true,
          error: 'Token expiring soon'
        }
      }

      // Token is valid
      return {
        provider,
        available: true,
        requiresRefresh: false
      }
    } catch (error) {
      console.error(`[OAuthTokenService] Error checking token availability for ${userId}/${provider}:`, error)
      return {
        provider,
        available: false,
        requiresRefresh: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get the status of all tokens for a user
   */
  async getTokenStatus(userId: string): Promise<TokenStatus[]> {
    const statuses: TokenStatus[] = []
    const providers: Array<'spotify' | 'youtube'> = ['spotify', 'youtube']

    for (const provider of providers) {
      try {
        const tokens = await this.dualModeTokenService.getTokens(userId)
        const tokenData = tokens.get(provider)

        if (!tokenData || !tokenData.accessToken) {
          statuses.push({
            provider,
            hasToken: false,
            isValid: false,
            isExpired: false,
            isExpiringSoon: false,
            canRefresh: false
          })
          continue
        }

        const now = new Date()
        const expiresAt = tokenData.expiresAt
        const hasRefreshToken = !!tokenData.refreshToken

        let isExpired = false
        let isExpiringSoon = false

        if (expiresAt) {
          const expiryTime = expiresAt.getTime()
          const nowTime = now.getTime()
          
          isExpired = expiryTime <= nowTime
          isExpiringSoon = !isExpired && expiryTime <= nowTime + this.EXPIRY_BUFFER_MS
        }

        statuses.push({
          provider,
          hasToken: true,
          isValid: !isExpired,
          isExpired,
          isExpiringSoon,
          canRefresh: hasRefreshToken && (isExpired || isExpiringSoon),
          expiresAt
        })
      } catch (error) {
        console.error(`[OAuthTokenService] Error getting token status for ${userId}/${provider}:`, error)
        statuses.push({
          provider,
          hasToken: false,
          isValid: false,
          isExpired: false,
          isExpiringSoon: false,
          canRefresh: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return statuses
  }

  /**
   * Get a valid token for a provider, refreshing if necessary
   */
  async getValidToken(userId: string, provider: 'spotify' | 'youtube'): Promise<string | null> {
    try {
      // Check token availability
      const availability = await this.checkTokenAvailability(userId, provider)

      if (!availability.available && !availability.requiresRefresh) {
        // No token at all
        console.log(`[OAuthTokenService] No token available for ${userId}/${provider}`)
        return null
      }

      // Get the token
      const tokens = await this.dualModeTokenService.getTokens(userId)
      const tokenData = tokens.get(provider)

      if (!tokenData || !tokenData.accessToken) {
        return null
      }

      // If refresh is needed, attempt refresh
      if (availability.requiresRefresh && tokenData.refreshToken) {
        console.log(`[OAuthTokenService] Token needs refresh for ${userId}/${provider}`)
        
        const refreshResult = await this.refreshToken(userId, provider, tokenData.refreshToken)
        
        if (refreshResult.success) {
          // Get the refreshed token
          const refreshedTokens = await this.dualModeTokenService.getTokens(userId)
          const refreshedToken = refreshedTokens.get(provider)
          return refreshedToken?.accessToken || null
        } else {
          // Refresh failed, return existing token if still valid
          if (availability.available) {
            console.warn(`[OAuthTokenService] Refresh failed but returning existing token for ${userId}/${provider}`)
            return tokenData.accessToken
          }
          return null
        }
      }

      return tokenData.accessToken
    } catch (error) {
      console.error(`[OAuthTokenService] Error getting valid token for ${userId}/${provider}:`, error)
      return null
    }
  }

  /**
   * Refresh an expired or expiring token
   */
  async refreshToken(userId: string, provider: 'spotify' | 'youtube', refreshToken: string): Promise<RefreshResult> {
    const attemptKey = `${userId}-${provider}`
    
    try {
      // Check if we can attempt refresh (exponential backoff)
      if (!this.canAttemptRefresh(attemptKey)) {
        const attemptInfo = this.refreshAttempts.get(attemptKey)
        return {
          success: false,
          provider,
          error: `Rate limited - next attempt at ${attemptInfo?.nextAllowedAttempt.toISOString()}`
        }
      }

      console.log(`[OAuthTokenService] Attempting token refresh for ${userId}/${provider}`)

      // Get OAuth configuration
      const oauthProviders = getOAuthProviders(this.env)
      const oauthProvider = oauthProviders[provider]
      
      if (!oauthProvider) {
        throw new Error(`OAuth provider ${provider} not configured`)
      }

      // Create OAuth service and refresh token
      const oauthService = new OAuthService(oauthProvider.config)
      const tokenResponse = await oauthService.refreshToken(refreshToken)

      // Calculate new expiry time
      const newExpiresAt = tokenResponse.expires_in 
        ? new Date(Date.now() + tokenResponse.expires_in * 1000)
        : undefined

      // Update token in storage
      await this.dualModeTokenService.updateToken(userId, {
        provider,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || refreshToken, // Keep old refresh token if new one not provided
        expiresAt: newExpiresAt
      })

      // Clear refresh attempts on success
      this.refreshAttempts.delete(attemptKey)

      console.log(`[OAuthTokenService] Successfully refreshed token for ${userId}/${provider}`)

      return {
        success: true,
        provider,
        newExpiresAt
      }
    } catch (error) {
      console.error(`[OAuthTokenService] Failed to refresh token for ${userId}/${provider}:`, error)
      
      // Record failed attempt for backoff
      this.recordRefreshAttempt(attemptKey, false)

      return {
        success: false,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Refresh all expiring tokens for a user
   */
  async refreshExpiringTokens(userId: string): Promise<RefreshResult[]> {
    const results: RefreshResult[] = []
    const statuses = await this.getTokenStatus(userId)

    for (const status of statuses) {
      if (status.canRefresh && (status.isExpired || status.isExpiringSoon)) {
        const tokens = await this.dualModeTokenService.getTokens(userId)
        const tokenData = tokens.get(status.provider)
        
        if (tokenData?.refreshToken) {
          const result = await this.refreshToken(userId, status.provider, tokenData.refreshToken)
          results.push(result)
        }
      }
    }

    return results
  }

  /**
   * Check if we can attempt a refresh (implements exponential backoff)
   */
  private canAttemptRefresh(attemptKey: string): boolean {
    const attempt = this.refreshAttempts.get(attemptKey)
    if (!attempt) {
      return true // First attempt
    }
    
    return new Date() >= attempt.nextAllowedAttempt
  }

  /**
   * Record a refresh attempt for backoff tracking
   */
  private recordRefreshAttempt(attemptKey: string, success: boolean): void {
    if (success) {
      this.refreshAttempts.delete(attemptKey)
      return
    }

    const now = new Date()
    const existing = this.refreshAttempts.get(attemptKey)
    const attemptCount = existing ? Math.min(existing.count + 1, this.MAX_REFRESH_ATTEMPTS) : 1
    
    // Exponential backoff: 2^attemptCount minutes, max 4 hours
    const backoffMs = Math.min(
      this.REFRESH_BACKOFF_BASE_MS * Math.pow(2, attemptCount - 1),
      4 * 60 * 60 * 1000
    )
    
    const nextAllowedAttempt = new Date(now.getTime() + backoffMs)
    
    this.refreshAttempts.set(attemptKey, {
      count: attemptCount,
      lastAttempt: now,
      nextAllowedAttempt
    })
    
    console.log(`[OAuthTokenService] Refresh attempt ${attemptCount} failed for ${attemptKey}, next attempt at ${nextAllowedAttempt.toISOString()}`)
  }

  /**
   * Handle concurrent refresh attempts
   */
  private refreshPromises = new Map<string, Promise<RefreshResult>>()

  async handleConcurrentRefresh(userId: string, provider: 'spotify' | 'youtube', refreshToken: string): Promise<RefreshResult> {
    const key = `${userId}-${provider}`
    
    // Check if refresh is already in progress
    const existingPromise = this.refreshPromises.get(key)
    if (existingPromise) {
      console.log(`[OAuthTokenService] Refresh already in progress for ${key}, waiting...`)
      return existingPromise
    }

    // Start new refresh
    const refreshPromise = this.refreshToken(userId, provider, refreshToken)
    this.refreshPromises.set(key, refreshPromise)

    try {
      const result = await refreshPromise
      return result
    } finally {
      // Clean up promise map
      this.refreshPromises.delete(key)
    }
  }
}