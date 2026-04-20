/**
 * Connection Health Monitoring: Error Classification
 *
 * Classifies polling authentication errors to determine appropriate recovery actions.
 *
 * @see /features/subscriptions/backend-spec.md - Section 6.4: Connection Health & Recovery
 */

// Error Classification

/**
 * Check if error indicates token expiration (401 Unauthorized)
 *
 * @param error - The error to classify
 * @returns true if the error suggests token expiration
 */
export function isTokenExpiredError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('401') || msg.includes('unauthorized') || msg.includes('token expired');
}

/**
 * Check if refresh token is invalid (cannot be refreshed)
 *
 * @param error - The error to classify
 * @returns true if the refresh token is permanently invalid
 */
export function isRefreshTokenInvalid(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return msg.includes('invalid_grant') || msg.includes('refresh token') || msg.includes('revoked');
}

/**
 * Check if provider access was revoked (403 Forbidden)
 *
 * @param error - The error to classify
 * @returns true if the error indicates access was revoked
 */
export function isAccessRevokedError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return (
    msg.includes('403') ||
    msg.includes('access revoked') ||
    msg.includes('insufficient permissions')
  );
}
