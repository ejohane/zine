import { describe, expect, it } from 'vitest';

import { buildNewsletterAvatarUrl } from './avatar';

describe('newsletter avatar resolver', () => {
  it('prefers list-id publication domains for Substack newsletters', () => {
    const avatarUrl = buildNewsletterAvatarUrl({
      listId: '<lennysnewsletter.substack.com>',
      fromAddress: 'hello@substack.com',
      unsubscribeUrl: 'https://substack.com/unsubscribe',
    });

    expect(avatarUrl).toBe(
      'https://www.google.com/s2/favicons?domain=lennysnewsletter.substack.com&sz=128'
    );
  });

  it('prefers custom unsubscribe hosts over list-id when available', () => {
    const avatarUrl = buildNewsletterAvatarUrl({
      listId: '<thorstenball.substack.com>',
      fromAddress: 'thorstenball@substack.com',
      unsubscribeUrl:
        'https://registerspill.thorstenball.com/action/disable_email/disable?token=abc',
    });

    expect(avatarUrl).toBe(
      'https://www.google.com/s2/favicons?domain=registerspill.thorstenball.com&sz=128'
    );
  });

  it('resolves open.substack canonical URLs to publication subdomains', () => {
    const avatarUrl = buildNewsletterAvatarUrl({
      canonicalUrl:
        'https://open.substack.com/pub/lenny/p/getting-paid-to-vibe-code?utm_source=mail',
    });

    expect(avatarUrl).toBe('https://www.google.com/s2/favicons?domain=lenny.substack.com&sz=128');
  });

  it('ignores Gmail-only hosts and uses sender domain fallback', () => {
    const avatarUrl = buildNewsletterAvatarUrl({
      canonicalUrl: 'https://mail.google.com/mail/u/0/#inbox/123',
      fromAddress: 'newsletter@beehiiv.com',
    });

    expect(avatarUrl).toBe('https://www.google.com/s2/favicons?domain=beehiiv.com&sz=128');
  });

  it('returns null when no domain identity is available', () => {
    const avatarUrl = buildNewsletterAvatarUrl({
      canonicalUrl: 'not-a-url',
      fromAddress: null,
      listId: null,
      unsubscribeUrl: null,
      creatorHandle: null,
    });

    expect(avatarUrl).toBeNull();
  });
});
