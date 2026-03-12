import { describe, expect, it } from 'vitest';

import {
  computeNewsletterScore,
  isLikelyNewsletterFeedIdentity,
  normalizeUnsubscribeIdentityUrl,
  selectBestNewsletterIssueUrl,
  shouldUpgradeNewsletterIssueUrl,
} from './gmail';

describe('gmail newsletter detection', () => {
  it('classifies Substack digests as newsletters', () => {
    const detection = computeNewsletterScore({
      listId: '<newsetter.substack.com>',
      listUnsubscribe: '<https://substack.com/unsubscribe>',
      unsubscribeMailto: null,
      unsubscribeUrl: 'https://substack.com/unsubscribe',
      unsubscribePostHeader: 'List-Unsubscribe=One-Click',
      fromAddress: 'author@substack.com',
      fromDisplayName: 'Author Weekly',
      subject: 'Weekly product digest',
    });

    expect(detection.isNewsletter).toBe(true);
    expect(detection.score).toBeGreaterThanOrEqual(0.78);
  });

  it('classifies allowlisted Stratechery messages without list-id', () => {
    const detection = computeNewsletterScore({
      listId: null,
      listUnsubscribe:
        '<https://stratechery.passport.online/api/1.0.0/users/test/channelOptOut?channel=email>',
      unsubscribeMailto: null,
      unsubscribeUrl:
        'https://stratechery.passport.online/api/1.0.0/users/test/channelOptOut?channel=email',
      unsubscribePostHeader: 'List-Unsubscribe=One-Click',
      fromAddress: 'email@stratechery.com',
      fromDisplayName: 'Ben Thompson',
      subject: 'Higher Powers and Lower Macs (This Week in Stratechery)',
    });

    expect(detection.isNewsletter).toBe(true);
    expect(detection.score).toBeGreaterThanOrEqual(0.78);
  });

  it('does not classify generic branded senders from unsubscribe headers alone', () => {
    const detection = computeNewsletterScore({
      listId: null,
      listUnsubscribe: '<https://brand.example.com/unsubscribe>',
      unsubscribeMailto: null,
      unsubscribeUrl: 'https://brand.example.com/unsubscribe',
      unsubscribePostHeader: 'List-Unsubscribe=One-Click',
      fromAddress: 'email@brand.example.com',
      fromDisplayName: 'Brand Author',
      subject: 'Thoughts on software architecture',
    });

    expect(detection.isNewsletter).toBe(false);
    expect(detection.score).toBeLessThan(0.78);
  });

  it('rejects transactional notifications even with unsubscribe headers', () => {
    const githubDetection = computeNewsletterScore({
      listId: '<repo.github.com>',
      listUnsubscribe: '<https://github.com/notifications/unsubscribe>',
      unsubscribeMailto: null,
      unsubscribeUrl: 'https://github.com/notifications/unsubscribe',
      unsubscribePostHeader: null,
      fromAddress: 'notifications@github.com',
      fromDisplayName: 'GitHub Notifications',
      subject: '[org/repo] You were mentioned in a pull request',
    });

    const uberDetection = computeNewsletterScore({
      listId: '<uber.com>',
      listUnsubscribe: '<https://uber.com/unsubscribe>',
      unsubscribeMailto: null,
      unsubscribeUrl: 'https://uber.com/unsubscribe',
      unsubscribePostHeader: null,
      fromAddress: 'noreply@uber.com',
      fromDisplayName: 'Uber',
      subject: 'Your Uber receipt',
    });

    expect(githubDetection.isNewsletter).toBe(false);
    expect(uberDetection.isNewsletter).toBe(false);
  });

  it('filters transactional senders from feed identity list results', () => {
    const githubIdentity = isLikelyNewsletterFeedIdentity({
      listId: '<repo.github.com>',
      unsubscribeMailto: null,
      unsubscribeUrl: 'https://github.com/notifications/unsubscribe',
      fromAddress: 'notifications@github.com',
      displayName: 'GitHub Notifications',
    });

    const uberIdentity = isLikelyNewsletterFeedIdentity({
      listId: '<ride.uber.com>',
      unsubscribeMailto: null,
      unsubscribeUrl: 'https://uber.com/unsubscribe',
      fromAddress: 'noreply@uber.com',
      displayName: 'Uber Receipts',
    });

    const substackIdentity = isLikelyNewsletterFeedIdentity({
      listId: '<newsetter.substack.com>',
      unsubscribeMailto: null,
      unsubscribeUrl: 'https://substack.com/unsubscribe',
      fromAddress: 'author@substack.com',
      displayName: 'Author Weekly',
    });

    const stratecheryIdentity = isLikelyNewsletterFeedIdentity({
      listId: null,
      unsubscribeMailto: null,
      unsubscribeUrl:
        'https://stratechery.passport.online/api/1.0.0/users/test/channelOptOut?channel=email',
      fromAddress: 'email@stratechery.com',
      displayName: 'Ben Thompson',
    });

    expect(githubIdentity).toBe(false);
    expect(uberIdentity).toBe(false);
    expect(substackIdentity).toBe(true);
    expect(stratecheryIdentity).toBe(true);
  });

  it('normalizes volatile unsubscribe tokens out of newsletter identity URLs', () => {
    const firstUrl =
      'https://stratechery.passport.online/api/1.0.0/users/test/channelOptOut?access_token=token-a&channel=email';
    const secondUrl =
      'https://stratechery.passport.online/api/1.0.0/users/test/channelOptOut?channel=email&access_token=token-b';

    expect(normalizeUnsubscribeIdentityUrl(firstUrl)).toBe(
      'https://stratechery.passport.online/api/1.0.0/users/test/channelOptOut?channel=email'
    );
    expect(normalizeUnsubscribeIdentityUrl(secondUrl)).toBe(
      'https://stratechery.passport.online/api/1.0.0/users/test/channelOptOut?channel=email'
    );
  });

  it('retains stable unsubscribe identity parameters while removing tracking params', () => {
    const normalizedUrl = normalizeUnsubscribeIdentityUrl(
      'https://newsletter.example.com/unsubscribe?list=weekly&user=user-123&utm_source=gmail&token=secret'
    );

    expect(normalizedUrl).toBe(
      'https://newsletter.example.com/unsubscribe?list=weekly&user=user-123'
    );
  });

  it('prefers real content links over unsubscribe/manage links', () => {
    const bestUrl = selectBestNewsletterIssueUrl({
      candidates: [
        {
          url: 'https://substack.com/account/settings',
          anchorText: 'Manage preferences',
          source: 'html_anchor',
          index: 0,
        },
        {
          url: 'https://lennysnewsletter.substack.com/p/getting-paid-to-vibe-code?utm_source=substack',
          anchorText: 'Read this issue',
          source: 'html_anchor',
          index: 1,
        },
        {
          url: 'https://substack.com/unsubscribe?token=abc',
          anchorText: 'Unsubscribe',
          source: 'html_anchor',
          index: 2,
        },
      ],
      unsubscribeUrl: 'https://substack.com/unsubscribe?token=abc',
      fromAddress: 'lenny@substack.com',
      listId: '<lennysnewsletter.substack.com>',
    });

    expect(bestUrl).toBe('https://lennysnewsletter.substack.com/p/getting-paid-to-vibe-code');
  });

  it('unwraps redirect links and returns canonical article URL', () => {
    const bestUrl = selectBestNewsletterIssueUrl({
      candidates: [
        {
          url: 'https://www.google.com/url?q=https%3A%2F%2Fnewsletter.example.com%2Fposts%2F42%3Futm_source%3Dmail&sa=D',
          anchorText: 'Open article',
          source: 'html_anchor',
          index: 0,
        },
      ],
      unsubscribeUrl: null,
      fromAddress: 'news@newsletter.example.com',
      listId: '<newsletter.example.com>',
    });

    expect(bestUrl).toBe('https://newsletter.example.com/posts/42');
  });

  it('normalizes open.substack share links to publication article URLs', () => {
    const bestUrl = selectBestNewsletterIssueUrl({
      candidates: [
        {
          url: 'https://open.substack.com/pub/lenny/p/getting-paid-to-vibe-code?redirect=app-store',
          anchorText: 'Read online',
          source: 'html_anchor',
          index: 0,
        },
      ],
      unsubscribeUrl: null,
      fromAddress: 'lenny@substack.com',
      listId: '<lenny.substack.com>',
    });

    expect(bestUrl).toBe('https://lenny.substack.com/p/getting-paid-to-vibe-code');
  });

  it('returns null when only non-content links are present', () => {
    const bestUrl = selectBestNewsletterIssueUrl({
      candidates: [
        {
          url: 'https://substack.com/unsubscribe?token=abc',
          anchorText: 'Unsubscribe',
          source: 'html_anchor',
          index: 0,
        },
        {
          url: 'https://substack.com/account/settings',
          anchorText: 'Account settings',
          source: 'html_anchor',
          index: 1,
        },
      ],
      unsubscribeUrl: 'https://substack.com/unsubscribe?token=abc',
      fromAddress: 'lenny@substack.com',
      listId: '<lennysnewsletter.substack.com>',
    });

    expect(bestUrl).toBeNull();
  });

  it('upgrades legacy Gmail fallback URLs to resolved article URLs', () => {
    const shouldUpgrade = shouldUpgradeNewsletterIssueUrl(
      'https://mail.google.com/mail/u/0/#inbox/19c3d745ca305284',
      'https://newsletter.example.com/posts/42'
    );

    expect(shouldUpgrade).toBe(true);
  });

  it('upgrades Substack redirect wrappers to final article URLs', () => {
    const shouldUpgrade = shouldUpgradeNewsletterIssueUrl(
      'https://substack.com/redirect/abc123?j=token',
      'https://newsletter.example.com/posts/42'
    );

    expect(shouldUpgrade).toBe(true);
  });

  it('upgrades open.substack wrapper URLs to publication article URLs', () => {
    const shouldUpgrade = shouldUpgradeNewsletterIssueUrl(
      'https://open.substack.com/pub/lenny/p/getting-paid-to-vibe-code?redirect=app-store',
      'https://lenny.substack.com/p/getting-paid-to-vibe-code'
    );

    expect(shouldUpgrade).toBe(true);
  });

  it('does not upgrade when URL quality is unchanged', () => {
    const shouldUpgrade = shouldUpgradeNewsletterIssueUrl(
      'https://newsletter.example.com/posts/42',
      'https://newsletter.example.com/posts/42'
    );

    expect(shouldUpgrade).toBe(false);
  });
});
