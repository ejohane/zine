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
});
