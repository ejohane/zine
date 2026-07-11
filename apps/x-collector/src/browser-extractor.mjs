/* global document */

export function extractVisibleTimelineBatch(seenAdKeys = []) {
  function metricNumber(value) {
    if (!value) return null;
    const match = String(value)
      .replace(/,/g, '')
      .match(/([\d.]+)\s*([KMB])?/i);
    if (!match) return null;
    const number = Number(match[1]);
    const multiplier =
      { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[(match[2] || '').toUpperCase()] || 1;
    return Number.isFinite(number) ? Math.round(number * multiplier) : null;
  }

  function statusIdentity(href) {
    if (!href) return null;
    const match = href.match(/^\/?([^/?#]+)\/status\/(\d+)/);
    if (!match) return null;
    return {
      tweetId: match[2],
      username: match[1],
      url: `https://x.com/${match[1]}/status/${match[2]}`,
    };
  }

  function authorFromContainer(container, fallbackUsername = 'unknown') {
    const nameRoot = container?.querySelector?.('[data-testid="User-Name"]') || container;
    const links = [...(nameRoot?.querySelectorAll?.('a[href]') || [])];
    const handleLink = links.find((link) => /^\/[^/]+$/.test(link.getAttribute('href') || ''));
    const username =
      handleLink?.getAttribute('href')?.slice(1) ||
      [...(nameRoot?.querySelectorAll?.('span') || [])]
        .map((span) => span.textContent?.trim())
        .find((text) => text?.startsWith('@'))
        ?.slice(1) ||
      fallbackUsername;
    const spanTexts = [...(nameRoot?.querySelectorAll?.('span') || [])]
      .map((span) => span.textContent?.trim())
      .filter(Boolean);
    const name = spanTexts.find((text) => text !== `@${username}`) || username;
    const avatar =
      container?.querySelector?.('img[src*="profile_images"]')?.getAttribute('src') || null;
    return {
      username,
      name,
      profileUrl: `https://x.com/${username}`,
      profileImageUrl: avatar,
    };
  }

  function isPromoted(article) {
    const social = article.querySelector('[data-testid="socialContext"]')?.textContent || '';
    if (/\bPromoted\b|\bSponsored\b/i.test(social)) return true;
    const tweetText = article.querySelector('[data-testid="tweetText"]');
    return [...article.querySelectorAll('span')].some((span) => {
      if (tweetText?.contains(span)) return false;
      return /^(Ad|Promoted|Sponsored)$/i.test(span.textContent?.trim() || '');
    });
  }

  function extractMetrics(article) {
    const valueFor = (testId) => {
      const node = article.querySelector(`[data-testid="${testId}"]`);
      return metricNumber(node?.getAttribute('aria-label') || node?.textContent);
    };
    const viewsNode = [...article.querySelectorAll('a[href*="/analytics"]')][0];
    return {
      replies: valueFor('reply'),
      reposts: valueFor('retweet'),
      likes: valueFor('like') ?? valueFor('unlike'),
      views: metricNumber(viewsNode?.getAttribute('aria-label') || viewsNode?.textContent),
    };
  }

  function extractMedia(article) {
    const seen = new Set();
    const media = [];
    for (const image of article.querySelectorAll('img[src*="pbs.twimg.com/media"]')) {
      const url = image.getAttribute('src');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      media.push({
        type: 'IMAGE',
        url,
        altText: image.getAttribute('alt') || null,
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      });
    }
    for (const video of article.querySelectorAll('video')) {
      const url = video.getAttribute('src') || video.getAttribute('poster');
      if (!url || seen.has(url)) continue;
      seen.add(url);
      media.push({
        type: 'VIDEO',
        url,
        previewUrl: video.getAttribute('poster') || null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
      });
    }
    return media;
  }

  function extractQuotedPost(article, primaryIdentity, capturedAt) {
    const identities = [...article.querySelectorAll('a[href*="/status/"]')]
      .map((link) => statusIdentity(link.getAttribute('href')))
      .filter(Boolean);
    const quotedIdentity = identities.find(
      (identity) => identity.tweetId !== primaryIdentity.tweetId
    );
    const textNodes = [...article.querySelectorAll('[data-testid="tweetText"]')];
    if (!quotedIdentity || textNodes.length < 2) return null;
    const quotedText = textNodes.at(-1);
    const quotedContainer = quotedText.closest('[role="link"]') || quotedText.parentElement;
    return {
      tweetId: quotedIdentity.tweetId,
      url: quotedIdentity.url,
      text: quotedText.textContent?.trim() || '',
      publishedAt: quotedContainer?.querySelector('time')?.getAttribute('datetime') || null,
      kind: 'POST',
      author: authorFromContainer(quotedContainer, quotedIdentity.username),
      media: extractMedia(quotedContainer || article),
      relationships: [],
      metrics: {},
      capturedAt,
    };
  }

  function extractBatch() {
    const capturedAt = new Date().toISOString();
    const posts = [];
    const items = [];
    let excludedAds = 0;
    const knownAdKeys = new Set(Array.isArray(seenAdKeys) ? seenAdKeys : []);
    const adKeys = [];

    for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if (isPromoted(article)) {
        const adKey =
          article.querySelector('a[href*="/status/"]')?.getAttribute('href') ||
          article.textContent?.trim().slice(0, 500) ||
          `ad-${knownAdKeys.size}`;
        if (!knownAdKeys.has(adKey)) {
          knownAdKeys.add(adKey);
          adKeys.push(adKey);
          excludedAds++;
        }
        continue;
      }
      const timeLink = article.querySelector('a[href*="/status/"]:has(time)');
      const identity = statusIdentity(timeLink?.getAttribute('href'));
      if (!identity) continue;
      const textNodes = [...article.querySelectorAll('[data-testid="tweetText"]')];
      const text = textNodes[0]?.textContent?.trim() || '';
      const socialContext = article.querySelector('[data-testid="socialContext"]');
      const reposted = /reposted/i.test(socialContext?.textContent || '');
      const quoted = extractQuotedPost(article, identity, capturedAt);
      const reply = /Replying to/i.test(article.textContent || '');
      const relationships = [];
      if (quoted)
        relationships.push({ type: 'QUOTE_OF', tweetId: quoted.tweetId, url: quoted.url });
      const post = {
        tweetId: identity.tweetId,
        url: identity.url,
        text,
        publishedAt: article.querySelector('time')?.getAttribute('datetime') || null,
        lang: article.querySelector('[data-testid="tweetText"]')?.getAttribute('lang') || null,
        kind: quoted ? 'QUOTE' : reply ? 'REPLY' : 'POST',
        author: authorFromContainer(article, identity.username),
        media: extractMedia(article),
        relationships,
        metrics: extractMetrics(article),
        capturedAt,
      };
      posts.push(post);
      if (quoted) posts.push(quoted);
      items.push({
        tweetId: identity.tweetId,
        observedAt: capturedAt,
        presentation: reposted ? 'REPOST' : 'POST',
        repostedBy: reposted ? authorFromContainer(socialContext, 'unknown') : null,
      });
    }
    return { posts, items, excludedAds, adKeys };
  }

  return extractBatch();
}
