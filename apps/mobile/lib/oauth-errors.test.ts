import { OAuthErrorCode, parseOAuthError } from './oauth-errors';

describe('parseOAuthError', () => {
  it('classifies Gmail insufficient scope errors correctly', () => {
    const error = parseOAuthError(
      'Gmail API request failed (403): Request had insufficient authentication scopes. ACCESS_TOKEN_SCOPE_INSUFFICIENT'
    );

    expect(error.code).toBe(OAuthErrorCode.INVALID_SCOPE);
    expect(error.message).toContain('missing required scopes');
  });

  it('classifies Gmail API disabled errors correctly', () => {
    const error = parseOAuthError(
      'Gmail API has not been used in project 123 before or it is disabled. reason=accessNotConfigured'
    );

    expect(error.code).toBe(OAuthErrorCode.PROVIDER_ERROR);
    expect(error.message).toContain('Gmail API is not enabled');
  });

  it('classifies redirect URI mismatch errors correctly', () => {
    const error = parseOAuthError('Token exchange failed: redirect_uri_mismatch');

    expect(error.code).toBe(OAuthErrorCode.INVALID_REDIRECT);
    expect(error.message).toContain('OAuth redirect mismatch');
  });

  it('classifies invalid client mismatch errors correctly', () => {
    const error = parseOAuthError('Token exchange failed: invalid_client');

    expect(error.code).toBe(OAuthErrorCode.PROVIDER_ERROR);
    expect(error.message).toContain('OAuth client configuration mismatch');
  });
});
