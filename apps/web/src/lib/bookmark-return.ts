/** Only canonical bookmark paths can override the normal post-auth destination. */
export function bookmarkReturnDestination(search: string): string | null {
  const value = new URLSearchParams(search).get('returnTo');
  return value && /^\/item\/[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}
