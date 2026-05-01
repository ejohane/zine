import * as jose from 'jose';
import type { Bindings } from '../types';
import { authLogger } from './logger';
import { isOAuthProvider, type Provider } from '@zine/shared';

export interface ClerkJWTPayload extends jose.JWTPayload {
  sub: string;
  azp?: string;
  sid?: string;
}

export interface VerifyTokenResult {
  success: true;
  userId: string;
  payload: ClerkJWTPayload;
}

export interface VerifyTokenError {
  success: false;
  error: string;
  code: 'MISSING_TOKEN' | 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'JWKS_ERROR';
}

export type VerifyTokenResponse = VerifyTokenResult | VerifyTokenError;

let jwksCache: jose.JWTVerifyGetKey | null = null;

function getJWKS(jwksUrl: string): jose.JWTVerifyGetKey {
  if (!jwksCache) {
    jwksCache = jose.createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwksCache;
}

export function clearJWKSCache(): void {
  jwksCache = null;
}

export async function verifyClerkToken(
  token: string | undefined,
  jwksUrl: string
): Promise<VerifyTokenResponse> {
  if (!token) {
    return {
      success: false,
      error: 'No authentication token provided',
      code: 'MISSING_TOKEN',
    };
  }

  try {
    const JWKS = getJWKS(jwksUrl);

    const { payload } = await jose.jwtVerify(token, JWKS, {
      clockTolerance: 5, // 5 seconds clock tolerance
    });

    const clerkPayload = payload as ClerkJWTPayload;

    if (!clerkPayload.sub) {
      return {
        success: false,
        error: 'Token missing subject claim',
        code: 'INVALID_TOKEN',
      };
    }

    return {
      success: true,
      userId: clerkPayload.sub,
      payload: clerkPayload,
    };
  } catch (error) {
    if (error instanceof jose.errors.JWTExpired) {
      return {
        success: false,
        error: 'Token has expired',
        code: 'EXPIRED_TOKEN',
      };
    }

    if (error instanceof jose.errors.JWKSNoMatchingKey) {
      return {
        success: false,
        error: 'No matching key found in JWKS',
        code: 'JWKS_ERROR',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token verification failed',
      code: 'INVALID_TOKEN',
    };
  }
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface ProviderUserInfo {
  id: string;
  email?: string;
  name?: string;
}

interface GoogleUserInfoResponse {
  id: string;
  email?: string;
  name?: string;
}

interface SpotifyUserInfoResponse {
  id: string;
  email?: string;
  display_name?: string;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isGoogleUserInfoResponse(value: unknown): value is GoogleUserInfoResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as {
    id?: unknown;
    email?: unknown;
    name?: unknown;
  };

  return (
    typeof candidate.id === 'string' &&
    isOptionalString(candidate.email) &&
    isOptionalString(candidate.name)
  );
}

function isSpotifyUserInfoResponse(value: unknown): value is SpotifyUserInfoResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const candidate = value as {
    id?: unknown;
    email?: unknown;
    display_name?: unknown;
  };

  return (
    typeof candidate.id === 'string' &&
    isOptionalString(candidate.email) &&
    isOptionalString(candidate.display_name)
  );
}
const OAUTH_CONFIG = {
  YOUTUBE: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  },
  GMAIL: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
  },
  SPOTIFY: {
    tokenUrl: 'https://accounts.spotify.com/api/token',
    userInfoUrl: 'https://api.spotify.com/v1/me',
  },
} as const;

export async function exchangeCodeForTokens(
  provider: Provider,
  code: string,
  codeVerifier: string,
  env: Bindings,
  overrideRedirectUri?: string
): Promise<OAuthTokens> {
  if (!isOAuthProvider(provider)) {
    throw new Error(`Provider ${provider} does not support OAuth`);
  }
  const config = OAUTH_CONFIG[provider];

  const isGoogleProvider = provider === 'YOUTUBE' || provider === 'GMAIL';
  const clientId = isGoogleProvider ? env.GOOGLE_CLIENT_ID : env.SPOTIFY_CLIENT_ID;
  const clientSecret = isGoogleProvider ? env.GOOGLE_CLIENT_SECRET : env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = overrideRedirectUri || env.OAUTH_REDIRECT_URI || 'zine://oauth/callback';

  if (!clientId) {
    throw new Error(`${provider} OAuth credentials not configured`);
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage: string;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.error_description || errorJson.error || errorText;
    } catch {
      errorMessage = errorText;
    }
    throw new Error(`Token exchange failed: ${errorMessage}`);
  }

  const tokens = (await response.json()) as OAuthTokens;
  authLogger.debug('Token exchange response', { provider, hasAccessToken: !!tokens.access_token });

  if (!tokens.access_token) {
    throw new Error('No access token in response');
  }

  // Spotify may omit refresh_token on repeated PKCE grants.
  if (!tokens.refresh_token) {
    authLogger.warn('Provider did not return refresh_token', { provider });
    tokens.refresh_token = tokens.access_token;
  }

  return tokens;
}

export async function getProviderUserInfo(
  provider: Provider,
  accessToken: string
): Promise<ProviderUserInfo> {
  if (!isOAuthProvider(provider)) {
    throw new Error(`Provider ${provider} does not support OAuth`);
  }
  const config = OAUTH_CONFIG[provider];

  const response = await fetch(config.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get user info: ${errorText}`);
  }

  const data: unknown = await response.json();

  if (provider === 'YOUTUBE' || provider === 'GMAIL') {
    if (!isGoogleUserInfoResponse(data)) {
      throw new Error(`Invalid ${provider} user info response`);
    }

    return {
      id: data.id,
      email: data.email,
      name: data.name,
    };
  }

  if (!isSpotifyUserInfoResponse(data)) {
    throw new Error('Invalid Spotify user info response');
  }

  return {
    id: data.id,
    email: data.email,
    name: data.display_name,
  };
}
