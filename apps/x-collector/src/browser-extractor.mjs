/* global document, URL */

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

  function httpUrl(value) {
    if (!value) return null;
    let candidate = String(value)
      .trim()
      .replace(/^From\s+/i, '');
    if (!candidate || candidate.includes('…') || candidate.includes('...')) return null;
    if (!/^https?:\/\//i.test(candidate)) {
      if (/^www\./i.test(candidate) || /^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(candidate)) {
        candidate = `https://${candidate}`;
      } else {
        return null;
      }
    }
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
    } catch {
      return null;
    }
  }

  function absoluteHttpUrl(value) {
    if (!value) return null;
    try {
      const base = /^https?:/i.test(document.baseURI || '') ? document.baseURI : 'https://x.com';
      const parsed = new URL(String(value).trim(), base);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
    } catch {
      return null;
    }
  }

  function isInternalXUrl(url) {
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    return (
      hostname === 'x.com' ||
      hostname.endsWith('.x.com') ||
      hostname === 'twitter.com' ||
      hostname.endsWith('.twitter.com')
    );
  }

  function normalizeOutboundUrl(value) {
    const parsed = absoluteHttpUrl(value);
    if (!parsed) return null;
    parsed.hash = '';
    const trackingKeys = [];
    for (const key of parsed.searchParams.keys()) {
      if (
        /^utm_/i.test(key) ||
        /^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|ref_src|ref_url)$/i.test(key)
      ) {
        trackingKeys.push(key);
      }
    }
    for (const key of trackingKeys) parsed.searchParams.delete(key);
    parsed.searchParams.sort();
    return parsed.toString();
  }

  function cardMetadata(card, destinationUrl) {
    const destination = absoluteHttpUrl(destinationUrl);
    const displayParts = [
      ...card.querySelectorAll(
        '[data-testid="card.layoutSmall.detail"] span, [data-testid="card.layoutLarge.detail"] span'
      ),
    ]
      .map((node) => node.textContent?.trim())
      .filter(Boolean);
    if (displayParts.length === 0) {
      displayParts.push(
        ...[...card.querySelectorAll('[dir="auto"]')]
          .filter((node) => node.children.length === 0)
          .map((node) => node.textContent?.trim())
          .filter(Boolean)
      );
    }
    const uniqueParts = [...new Set(displayParts)];
    const displayedDomain = uniqueParts
      .map((part) =>
        part
          .replace(/^From\s+/i, '')
          .trim()
          .toLowerCase()
      )
      .find((part) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(part));
    const destinationDomain = destination?.hostname.toLowerCase().replace(/^www\./, '') || null;
    const domain =
      destinationDomain === 't.co' && displayedDomain ? displayedDomain : destinationDomain;
    const contentParts = uniqueParts.filter((part) => {
      const normalized = part.replace(/^From\s+/i, '').toLowerCase();
      return normalized !== domain && !normalized.endsWith(` · ${domain}`);
    });
    const image = card.querySelector('img[src]')?.getAttribute('src') || null;
    const imageUrl = absoluteHttpUrl(image)?.toString() || null;
    const title = contentParts[0]?.slice(0, 500) || null;
    const description = contentParts[1]?.slice(0, 2_000) || null;
    if (!title && !description && !domain && !imageUrl) return null;
    return { title, description, domain, imageUrl };
  }

  function extractOutboundLinks(container, tweetText, excludedContainers = []) {
    const linksByUrl = new Map();
    const isExcluded = (node) => excludedContainers.some((excluded) => excluded?.contains?.(node));

    const addLink = (anchor, source, card = null) => {
      if (!anchor || isExcluded(anchor)) return;
      const observed = absoluteHttpUrl(anchor.getAttribute('href'));
      const renderedText = anchor.textContent?.trim().slice(0, 1_000) || null;
      const expandedCandidates = [
        anchor.getAttribute('data-expanded-url'),
        anchor.getAttribute('data-url'),
        anchor.getAttribute('title'),
        anchor.getAttribute('aria-label'),
        renderedText,
      ]
        .map(httpUrl)
        .filter((url) => url && !isInternalXUrl(url));
      const directDestination = expandedCandidates.find(
        (url) => url.hostname.toLowerCase() !== 't.co'
      );
      const destination =
        directDestination ||
        (observed && !isInternalXUrl(observed) ? observed : null) ||
        expandedCandidates[0] ||
        null;
      if (!destination) return;
      const normalizedUrl = normalizeOutboundUrl(destination.toString());
      if (!normalizedUrl) return;
      const observedUrl = observed?.toString() || null;
      const metadata = source === 'CARD' ? cardMetadata(card, destination.toString()) : null;
      const displayUrl = source === 'CARD' ? metadata?.domain || null : renderedText;
      const link = {
        url: destination.toString(),
        normalizedUrl,
        displayUrl,
        redirectUrl: observedUrl && observedUrl !== destination.toString() ? observedUrl : null,
        source,
        card: metadata,
      };
      const existing = linksByUrl.get(normalizedUrl);
      if (!existing || source === 'CARD') {
        linksByUrl.set(normalizedUrl, {
          ...existing,
          ...link,
          displayUrl: link.displayUrl || existing?.displayUrl || null,
          redirectUrl: link.redirectUrl || existing?.redirectUrl || null,
          card: link.card || existing?.card || null,
        });
      }
    };

    for (const anchor of tweetText?.querySelectorAll?.('a[href]') || []) {
      addLink(anchor, 'TEXT');
    }
    for (const card of container?.querySelectorAll?.('[data-testid="card.wrapper"]') || []) {
      if (isExcluded(card)) continue;
      const anchor = card.matches?.('a[href]')
        ? card
        : card.querySelector('a[href]') || card.closest?.('a[href]') || card;
      addLink(anchor, 'CARD', card);
    }
    return [...linksByUrl.values()];
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
      container: quotedContainer,
      post: {
        tweetId: quotedIdentity.tweetId,
        url: quotedIdentity.url,
        text: quotedText.textContent?.trim() || '',
        publishedAt: quotedContainer?.querySelector('time')?.getAttribute('datetime') || null,
        kind: 'POST',
        author: authorFromContainer(quotedContainer, quotedIdentity.username),
        media: extractMedia(quotedContainer || article),
        links: extractOutboundLinks(quotedContainer || article, quotedText),
        relationships: [],
        metrics: {},
        capturedAt,
      },
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
      const quotedDetails = extractQuotedPost(article, identity, capturedAt);
      const quoted = quotedDetails?.post || null;
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
        links: extractOutboundLinks(
          article,
          textNodes[0],
          quotedDetails?.container ? [quotedDetails.container] : []
        ),
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
