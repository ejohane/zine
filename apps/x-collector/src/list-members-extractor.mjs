/* global document */

/**
 * Extract visible X List member usernames from mounted UserCell elements.
 * Invoke through browser page evaluation; keep deduplication in the caller.
 */
export function extractVisibleListMembers() {
  const usernames = [];
  for (const cell of document.querySelectorAll('[data-testid="UserCell"]')) {
    const links = [...cell.querySelectorAll('a[href^="/"]')];
    const profileLink = links.find((link) => {
      const href = link.getAttribute('href') || '';
      return /^\/[A-Za-z0-9_]{1,64}$/.test(href);
    });
    const username = profileLink?.getAttribute('href')?.slice(1);
    if (username) usernames.push(username);
  }
  return [...new Set(usernames.map((username) => username.toLocaleLowerCase()))];
}
