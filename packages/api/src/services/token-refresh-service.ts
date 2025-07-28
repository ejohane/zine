import { SubscriptionRepository } from '@zine/shared'

export interface TokenRefreshResult {
  totalAccountsChecked: number
  tokensRefreshed: number
  errors: Array<{
    accountId: string
    provider: string
    error: string
  }>
}

export class TokenRefreshService {
  // In-memory tracking of refresh attempts to implement exponential backoff
  private refreshAttempts = new Map<string, { count: number; lastAttempt: Date; nextAllowedAttempt: Date }>()
  
  constructor(private subscriptionRepository: SubscriptionRepository) {}

  private canAttemptRefresh(accountId: string): boolean {
    const attempt = this.refreshAttempts.get(accountId)
    if (!attempt) {
      return true // First attempt
    }
    
    return new Date() >= attempt.nextAllowedAttempt
  }

  private recordRefreshAttempt(accountId: string, success: boolean): void {
    const now = new Date()
    const existing = this.refreshAttempts.get(accountId)
    
    if (success) {
      // Clear the tracking on successful refresh
      this.refreshAttempts.delete(accountId)
      return
    }
    
    // Failed attempt - implement exponential backoff
    const attemptCount = existing ? existing.count + 1 : 1
    
    // Exponential backoff: 2^attemptCount minutes, max 4 hours
    const backoffMinutes = Math.min(Math.pow(2, attemptCount), 240)
    const nextAllowedAttempt = new Date(now.getTime() + backoffMinutes * 60 * 1000)
    
    this.refreshAttempts.set(accountId, {
      count: attemptCount,
      lastAttempt: now,
      nextAllowedAttempt
    })
    
    console.log(`[TokenRefresh] Account ${accountId} failed refresh attempt ${attemptCount}, next attempt allowed at ${nextAllowedAttempt.toISOString()}`)
  }

  async refreshExpiringTokens(): Promise<TokenRefreshResult> {
    console.log('[TokenRefresh] Starting proactive token refresh')
    
    const result: TokenRefreshResult = {
      totalAccountsChecked: 0,
      tokensRefreshed: 0,
      errors: []
    }

    try {
      // Get all accounts for each provider
      const providers = ['spotify', 'youtube']
      
      for (const provider of providers) {
        const accounts = await this.subscriptionRepository.getUserAccountsByProvider(provider)
        result.totalAccountsChecked += accounts.length
        
        console.log(`[TokenRefresh] Checking ${accounts.length} ${provider} accounts`)
        
        // Check each account for tokens expiring within 1 hour
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000)
        
        for (const account of accounts) {
          // Skip accounts without expiration date or refresh token
          if (!account.expiresAt || !account.refreshToken) {
            continue
          }
          
          // Check if token expires within the next hour
          if (account.expiresAt <= oneHourFromNow) {
            // Check if we can attempt refresh (exponential backoff)
            if (!this.canAttemptRefresh(account.id)) {
              const attemptInfo = this.refreshAttempts.get(account.id)
              console.log(`[TokenRefresh] Skipping account ${account.id} due to exponential backoff (attempt ${attemptInfo?.count}, next allowed: ${attemptInfo?.nextAllowedAttempt.toISOString()})`)
              continue
            }
            
            console.log(`[TokenRefresh] Token for account ${account.id} expires within 1 hour, attempting refresh`)
            
            try {
              // Use the repository's user-specific refresh logic
              const refreshedAccount = await this.subscriptionRepository.getValidUserAccount(account.userId, provider)
              
              if (refreshedAccount && refreshedAccount.id === account.id) {
                result.tokensRefreshed++
                this.recordRefreshAttempt(account.id, true) // Success
                console.log(`[TokenRefresh] Successfully refreshed token for account ${account.id}`)
              } else if (refreshedAccount) {
                result.tokensRefreshed++
                this.recordRefreshAttempt(account.id, true) // Success
                console.log(`[TokenRefresh] Account ${account.id} was refreshed successfully`)
              } else {
                this.recordRefreshAttempt(account.id, false) // Failed
                const errorMessage = 'Failed to refresh account - no valid account returned'
                result.errors.push({
                  accountId: account.id,
                  provider,
                  error: errorMessage
                })
                console.warn(`[TokenRefresh] ${errorMessage} for account ${account.id}`)
              }
            } catch (error) {
              this.recordRefreshAttempt(account.id, false) // Failed
              const errorMessage = error instanceof Error ? error.message : 'Unknown error'
              result.errors.push({
                accountId: account.id,
                provider,
                error: errorMessage
              })
              console.error(`[TokenRefresh] Failed to refresh token for account ${account.id}:`, error)
            }
          }
        }
      }
      
      console.log(`[TokenRefresh] Completed: ${result.tokensRefreshed} tokens refreshed, ${result.errors.length} errors`)
      return result
      
    } catch (error) {
      console.error('[TokenRefresh] Fatal error during token refresh:', error)
      result.errors.push({
        accountId: 'unknown',
        provider: 'unknown',
        error: error instanceof Error ? error.message : 'Fatal error during token refresh'
      })
      return result
    }
  }
}