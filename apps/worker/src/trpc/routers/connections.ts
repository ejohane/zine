/**
 * Connections tRPC Router
 *
 * Handles OAuth provider connections (YouTube, Spotify).
 * Includes state management for CSRF protection during OAuth flows.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { ulid } from 'ulid';
import { eq, and, ne } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { registerOAuthState, validateOAuthState } from '../../lib/oauth-state';
import { exchangeCodeForTokens, getProviderUserInfo } from '../../lib/auth';
import { encrypt, decrypt } from '../../lib/crypto';
import { providerConnections, subscriptions } from '../../db/schema';
import type { Bindings } from '../../types';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * Supported OAuth providers
 */
export const ProviderSchema = z.enum(['YOUTUBE', 'SPOTIFY']);
export type Provider = z.infer<typeof ProviderSchema>;

/**
 * Input schema for registering OAuth state
 * State must be cryptographically random, 32-128 characters
 */
const RegisterStateInputSchema = z.object({
  provider: ProviderSchema,
  state: z
    .string()
    .min(32, 'State must be at least 32 characters')
    .max(128, 'State must be at most 128 characters'),
});

// ============================================================================
// Router
// ============================================================================

export const connectionsRouter = router({
  /**
   * Register OAuth state for CSRF protection
   *
   * Called by the client before initiating the OAuth flow.
   * The client generates a cryptographically random state and sends it here.
   * The server stores state → userId mapping in KV with a 30 minute TTL.
   *
   * Flow:
   * 1. Client generates random state
   * 2. Client calls this endpoint to register the state
   * 3. Client includes state in OAuth redirect URL
   * 4. On callback, server validates state matches the user
   *
   * @throws BAD_REQUEST if state is already registered (replay attack prevention)
   */
  registerState: protectedProcedure
    .input(RegisterStateInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate that KV is available
      if (!ctx.env.OAUTH_STATE_KV) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'OAuth state storage not configured',
        });
      }

      await registerOAuthState(input.state, ctx.userId, ctx.env.OAUTH_STATE_KV);

      return { success: true };
    }),

  /**
   * OAuth callback endpoint - exchanges authorization code for tokens
   *
   * This is called by the mobile client after the user completes OAuth authorization.
   * The flow:
   * 1. Mobile generates PKCE verifier + challenge
   * 2. Mobile redirects user to provider with challenge
   * 3. Provider redirects back to mobile with authorization code
   * 4. Mobile calls this endpoint with code + verifier
   * 5. Server exchanges code + verifier for tokens
   * 6. Server encrypts and stores tokens
   *
   * Security:
   * - State parameter prevents CSRF attacks
   * - PKCE verifier is generated on client, never stored on server
   * - Tokens are encrypted with AES-256-GCM before storage
   *
   * @throws BAD_REQUEST if state is invalid or token exchange fails
   * @throws INTERNAL_SERVER_ERROR if encryption key is not configured
   */
  callback: protectedProcedure
    .input(
      z.object({
        provider: ProviderSchema,
        code: z.string().min(1, 'Authorization code is required'),
        state: z.string().min(32).max(128),
        codeVerifier: z
          .string()
          .min(43, 'Code verifier must be at least 43 characters')
          .max(128, 'Code verifier must be at most 128 characters'),
        redirectUri: z.string().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate that required services are available
      if (!ctx.env.OAUTH_STATE_KV) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'OAuth state storage not configured',
        });
      }

      if (!ctx.env.ENCRYPTION_KEY) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Token encryption not configured',
        });
      }

      // 1. Validate state (CSRF protection)
      // This also deletes the state after validation (one-time use)
      await validateOAuthState(input.state, ctx.userId, ctx.env.OAUTH_STATE_KV);

      // 2. Exchange authorization code + PKCE verifier for tokens
      const tokens = await exchangeCodeForTokens(
        input.provider,
        input.code,
        input.codeVerifier,
        ctx.env,
        input.redirectUri
      );

      // 3. Get provider user info (for provider_user_id)
      const providerUser = await getProviderUserInfo(input.provider, tokens.access_token);

      // 4. Encrypt tokens before storage
      const encryptedAccessToken = await encrypt(tokens.access_token, ctx.env.ENCRYPTION_KEY);
      const encryptedRefreshToken = await encrypt(tokens.refresh_token, ctx.env.ENCRYPTION_KEY);

      // 5. Calculate token expiry timestamp
      const now = Date.now();
      const tokenExpiresAt = now + tokens.expires_in * 1000;

      // 6. Upsert connection (update if exists, insert if not)
      await ctx.db
        .insert(providerConnections)
        .values({
          id: ulid(),
          userId: ctx.userId,
          provider: input.provider,
          providerUserId: providerUser.id,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt,
          scopes: tokens.scope ?? null,
          status: 'ACTIVE',
          connectedAt: now,
          lastRefreshedAt: null,
        })
        .onConflictDoUpdate({
          target: [providerConnections.userId, providerConnections.provider],
          set: {
            providerUserId: providerUser.id,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            tokenExpiresAt,
            scopes: tokens.scope ?? null,
            status: 'ACTIVE',
            lastRefreshedAt: now,
          },
        });

      return { success: true };
    }),

  /**
   * List all connected providers for the authenticated user
   *
   * Returns connection status for each provider (without sensitive tokens).
   * Useful for the mobile app to show which providers are connected
   * and their current status (ACTIVE, EXPIRED, REVOKED).
   *
   * @returns Object with YOUTUBE and SPOTIFY keys, each containing connection info or null
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db.query.providerConnections.findMany({
      where: eq(providerConnections.userId, ctx.userId),
      columns: {
        provider: true,
        status: true,
        connectedAt: true,
        lastRefreshedAt: true,
        // Explicitly exclude tokens - they should never be returned to the client
      },
    });

    // Return a map for easy lookup by provider
    return {
      YOUTUBE: connections.find((c) => c.provider === 'YOUTUBE') ?? null,
      SPOTIFY: connections.find((c) => c.provider === 'SPOTIFY') ?? null,
    };
  }),

  /**
   * Disconnect a provider and clean up related data
   *
   * This performs the following steps:
   * 1. Attempt to revoke the token with the provider (best effort)
   * 2. Delete the connection from the database
   * 3. Mark related subscriptions as DISCONNECTED
   *
   * @throws NOT_FOUND if the provider is not connected
   * @throws INTERNAL_SERVER_ERROR if encryption key is not configured
   */
  disconnect: protectedProcedure
    .input(
      z.object({
        provider: ProviderSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate that encryption key is available (needed to decrypt token for revocation)
      if (!ctx.env.ENCRYPTION_KEY) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Token encryption not configured',
        });
      }

      // Find the connection
      const connection = await ctx.db.query.providerConnections.findFirst({
        where: and(
          eq(providerConnections.userId, ctx.userId),
          eq(providerConnections.provider, input.provider)
        ),
      });

      if (!connection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not connected',
        });
      }

      // 1. Attempt to revoke token with provider (best effort)
      try {
        await revokeProviderToken(input.provider, connection.accessToken, ctx.env);
      } catch (e) {
        // Log but don't fail - token revocation is best effort
        console.warn('Failed to revoke token with provider:', e);
      }

      // 2. Delete connection from database
      await ctx.db.delete(providerConnections).where(eq(providerConnections.id, connection.id));

      // 3. Mark related subscriptions as DISCONNECTED
      // We don't change UNSUBSCRIBED subscriptions since those were explicitly removed by the user
      await ctx.db
        .update(subscriptions)
        .set({
          status: 'DISCONNECTED',
          updatedAt: Date.now(),
        })
        .where(
          and(
            eq(subscriptions.userId, ctx.userId),
            eq(subscriptions.provider, input.provider),
            ne(subscriptions.status, 'UNSUBSCRIBED')
          )
        );

      return { success: true };
    }),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Attempt to revoke an OAuth token with the provider
 *
 * This is a best-effort operation - if it fails, the token will still be
 * deleted from our database and will eventually expire naturally.
 *
 * @param provider - The OAuth provider (YOUTUBE or SPOTIFY)
 * @param encryptedAccessToken - The encrypted access token from the database
 * @param env - Environment bindings with ENCRYPTION_KEY
 */
async function revokeProviderToken(
  provider: Provider,
  encryptedAccessToken: string,
  env: Bindings
): Promise<void> {
  if (!env.ENCRYPTION_KEY) {
    throw new Error('Encryption key not configured');
  }

  const token = await decrypt(encryptedAccessToken, env.ENCRYPTION_KEY);

  if (provider === 'YOUTUBE') {
    // Google supports token revocation
    const response = await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`YouTube token revocation failed: ${response.status} ${text}`);
    }
  }
  // Spotify doesn't have a token revocation endpoint
  // The token will just expire naturally (typically within 1 hour)
}

// Export type for client usage
export type ConnectionsRouter = typeof connectionsRouter;

// Re-export validation helper for use in other routes
export { validateOAuthState };
