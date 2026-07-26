/* global URL */

const X_ORIGIN = 'https://x.com';

export function classifyXGraphQLResponse(responseUrl, options = {}) {
  let url;
  try {
    url = new URL(responseUrl);
  } catch {
    return null;
  }
  if (!/(^|\.)x\.com$/i.test(url.hostname) && !/(^|\.)twitter\.com$/i.test(url.hostname)) {
    return null;
  }
  const operation = url.pathname.split('/').filter(Boolean).at(-1) || '';
  if (operation === 'TweetDetail') return { kind: 'DETAIL', operation };
  const listTimeline = operation === 'ListLatestTweetsTimeline';
  const followingTimeline = /(?:HomeLatest|Following).*Timeline/i.test(operation);
  if (!listTimeline && !followingTimeline) return null;
  if (listTimeline && options.expectedListId) {
    let variables = null;
    try {
      variables = JSON.parse(url.searchParams.get('variables') || 'null');
    } catch {
      return { kind: 'INVALID', operation, reason: 'invalid_list_variables' };
    }
    const observedListId = variables?.listId || variables?.list_id || null;
    if (String(observedListId || '') !== String(options.expectedListId)) {
      return { kind: 'INVALID', operation, reason: 'source_list_id_mismatch' };
    }
  }
  return {
    kind: 'TIMELINE',
    operation,
    sourceType: listTimeline ? 'FAVORITES' : 'FOLLOWING',
  };
}

function object(value) {
  return value && typeof value === 'object' ? value : null;
}

function unwrapTweet(value) {
  let current = object(value);
  for (let depth = 0; current && depth < 5; depth++) {
    if (current.__typename === 'TweetWithVisibilityResults') current = object(current.tweet);
    else if (current.result) current = object(current.result);
    else break;
  }
  return current?.legacy && (current.rest_id || current.id_str) ? current : null;
}

function authorFromTweet(tweet) {
  const user = object(tweet?.core?.user_results?.result);
  const legacy = object(user?.legacy) || {};
  const core = object(user?.core) || {};
  const avatar = object(user?.avatar) || {};
  const verification = object(user?.verification) || {};
  const username = core.screen_name || legacy.screen_name || 'unknown';
  return {
    id: user?.rest_id || null,
    username,
    name: core.name || legacy.name || username,
    profileUrl: `${X_ORIGIN}/${username}`,
    profileImageUrl: avatar.image_url || legacy.profile_image_url_https || null,
    verified: user?.is_blue_verified ?? verification.verified ?? legacy.verified ?? null,
  };
}

function normalizedHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid|dclid|msclkid|mc_cid|mc_eid)$/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function linksFromTweet(tweet) {
  const legacy = object(tweet?.legacy) || {};
  const note = object(tweet?.note_tweet?.note_tweet_results?.result);
  const entities = [legacy.entities, note?.entity_set].filter(Boolean);
  const links = new Map();
  for (const entity of entities) {
    for (const raw of entity?.urls || []) {
      const destination = raw.expanded_url || raw.url;
      const normalizedUrl = normalizedHttpUrl(destination);
      if (!normalizedUrl || links.has(normalizedUrl)) continue;
      links.set(normalizedUrl, {
        url: destination,
        normalizedUrl,
        displayUrl: raw.display_url || null,
        redirectUrl: raw.url && raw.url !== destination ? raw.url : null,
        source: 'TEXT',
        card: null,
      });
    }
  }
  return [...links.values()];
}

function mediaFromTweet(tweet) {
  const entities = tweet?.legacy?.extended_entities?.media || [];
  return entities.flatMap((entry) => {
    const url = entry.media_url_https || entry.media_url;
    if (!url) return [];
    const type =
      entry.type === 'photo'
        ? 'IMAGE'
        : entry.type === 'video'
          ? 'VIDEO'
          : entry.type === 'animated_gif'
            ? 'GIF'
            : 'UNKNOWN';
    const variants = entry.video_info?.variants || [];
    const playable = variants
      .filter((variant) => variant.url && variant.content_type !== 'application/x-mpegURL')
      .sort((left, right) => (right.bitrate || 0) - (left.bitrate || 0))[0];
    return [
      {
        type,
        url: playable?.url || url,
        previewUrl: type === 'IMAGE' ? null : url,
        altText: entry.ext_alt_text || null,
        width: entry.original_info?.width || entry.sizes?.large?.w || null,
        height: entry.original_info?.height || entry.sizes?.large?.h || null,
        durationMs: entry.video_info?.duration_millis || null,
      },
    ];
  });
}

function relationship(type, tweetId, source) {
  return tweetId
    ? {
        type,
        tweetId: String(tweetId),
        url: `${X_ORIGIN}/i/status/${tweetId}`,
        evidenceSource: source,
      }
    : null;
}

function postFromTweet(value, source, observedAt) {
  const tweet = unwrapTweet(value);
  if (!tweet) return null;
  const legacy = tweet.legacy;
  const author = authorFromTweet(tweet);
  const tweetId = String(tweet.rest_id || tweet.id_str);
  const quoted = unwrapTweet(tweet.quoted_status_result);
  const reposted = unwrapTweet(legacy.retweeted_status_result || tweet.retweeted_status_result);
  const reply = relationship('REPLY_TO', legacy.in_reply_to_status_id_str, source);
  const quote = relationship('QUOTE_OF', legacy.quoted_status_id_str || quoted?.rest_id, source);
  const repost = relationship('REPOST_OF', reposted?.rest_id, source);
  const relationships = [reply, quote, repost].filter(Boolean);
  const text =
    tweet.note_tweet?.note_tweet_results?.result?.text || legacy.full_text || legacy.text || '';
  const publishedAt = legacy.created_at ? new Date(legacy.created_at).toISOString() : null;
  return {
    tweetId,
    url: `${X_ORIGIN}/${author.username}/status/${tweetId}`,
    text,
    publishedAt,
    lang: legacy.lang || null,
    kind: reposted ? 'REPOST' : quoted ? 'QUOTE' : reply ? 'REPLY' : 'POST',
    conversationId: legacy.conversation_id_str || tweetId,
    structure: { status: 'EXACT', source, observedAt },
    author,
    media: mediaFromTweet(tweet),
    links: linksFromTweet(tweet),
    relationships,
    metrics: {
      replies: legacy.reply_count ?? null,
      reposts: legacy.retweet_count ?? null,
      likes: legacy.favorite_count ?? null,
      views: Number.isFinite(Number(tweet.views?.count)) ? Number(tweet.views.count) : null,
      bookmarks: legacy.bookmark_count ?? null,
    },
    capturedAt: observedAt,
  };
}

function referencedPosts(value, source, observedAt) {
  const tweet = unwrapTweet(value);
  if (!tweet) return [];
  return [
    postFromTweet(tweet.quoted_status_result, source, observedAt),
    postFromTweet(
      tweet.legacy?.retweeted_status_result || tweet.retweeted_status_result,
      source,
      observedAt
    ),
  ].filter(Boolean);
}

function instructionsFromPayload(payload) {
  const found = [];
  const visit = (value, depth = 0) => {
    if (!value || depth > 10) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    if (Array.isArray(value.instructions)) found.push(...value.instructions);
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'instructions') visit(child, depth + 1);
    }
  };
  visit(payload);
  return found;
}

function timelineEntries(payload) {
  return instructionsFromPayload(payload).flatMap((instruction) => instruction.entries || []);
}

function itemTweetResult(itemContent) {
  return itemContent?.tweet_results?.result || itemContent?.tweetResult?.result || null;
}

function moduleConversationIds(entry, moduleItems) {
  const metadata = entry?.content?.metadata?.conversationMetadata;
  const ids = metadata?.allTweetIds || metadata?.all_tweet_ids;
  if (Array.isArray(ids) && ids.length > 0) return ids.map(String);
  return moduleItems
    .map((item) => unwrapTweet(itemTweetResult(item?.item?.itemContent))?.rest_id)
    .filter(Boolean)
    .map(String);
}

function addPrimary(result, tweetResult, metadata) {
  const wrapper = unwrapTweet(tweetResult);
  if (!wrapper) return;
  const reposted = unwrapTweet(
    wrapper.legacy?.retweeted_status_result || wrapper.retweeted_status_result
  );
  const canonical = reposted || wrapper;
  const post = postFromTweet(canonical, result.source, result.observedAt);
  if (!post) return;
  result.posts.set(post.tweetId, post);
  for (const context of referencedPosts(canonical, result.source, result.observedAt)) {
    if (!result.posts.has(context.tweetId)) result.posts.set(context.tweetId, context);
  }
  result.items.push({
    tweetId: post.tweetId,
    position: result.items.length,
    observedAt: result.observedAt,
    presentation: reposted ? 'REPOST' : 'POST',
    repostedBy: reposted ? authorFromTweet(wrapper) : null,
    ...metadata,
  });
}

export function extractTimelineGraphQLResponse(payload, options = {}) {
  const observedAt = options.observedAt || new Date().toISOString();
  const source =
    options.sourceType === 'FOLLOWING' ? 'X_WEB_GRAPHQL_FOLLOWING' : 'X_WEB_GRAPHQL_LIST';
  const result = { source, observedAt, posts: new Map(), items: [], excludedAds: 0, adKeys: [] };
  let groupPosition = 0;
  for (const entry of timelineEntries(payload)) {
    const content = entry?.content;
    if (!content || content.cursorType || content.__typename?.includes('Cursor')) continue;
    if (content.promotedMetadata || content.itemContent?.promotedMetadata) {
      result.excludedAds++;
      result.adKeys.push(entry.entryId || `promoted-${result.adKeys.length}`);
      continue;
    }
    if (content.itemContent) {
      addPrimary(result, itemTweetResult(content.itemContent), {});
      continue;
    }
    const moduleItems = content.items || [];
    if (moduleItems.length === 0) continue;
    const tweetIds = moduleConversationIds(entry, moduleItems);
    const groupId = entry.entryId || `conversation:${tweetIds.join(':')}`;
    for (const [groupItemPosition, moduleItem] of moduleItems.entries()) {
      const itemContent = moduleItem?.item?.itemContent;
      if (moduleItem?.item?.promotedMetadata || itemContent?.promotedMetadata) {
        result.excludedAds++;
        result.adKeys.push(moduleItem.entryId || `${groupId}:promoted:${groupItemPosition}`);
        continue;
      }
      addPrimary(result, itemTweetResult(itemContent), {
        groupId,
        groupType: 'VERTICAL_CONVERSATION',
        groupPosition,
        groupItemPosition,
        groupSize: tweetIds.length || moduleItems.length,
      });
    }
    groupPosition++;
  }
  return {
    posts: [...result.posts.values()],
    items: result.items,
    excludedAds: result.excludedAds,
    adKeys: result.adKeys,
  };
}

export function extractTweetDetailGraphQLResponse(payload, options = {}) {
  const observedAt = options.observedAt || new Date().toISOString();
  const posts = new Map();
  for (const entry of timelineEntries(payload)) {
    const candidates = [
      entry?.content?.itemContent,
      ...(entry?.content?.items || []).map((item) => item?.item?.itemContent),
    ];
    for (const itemContent of candidates) {
      const post = postFromTweet(
        itemTweetResult(itemContent),
        'X_WEB_GRAPHQL_TWEET_DETAIL',
        observedAt
      );
      if (!post) continue;
      posts.set(post.tweetId, post);
      for (const context of referencedPosts(
        itemTweetResult(itemContent),
        'X_WEB_GRAPHQL_TWEET_DETAIL',
        observedAt
      )) {
        if (!posts.has(context.tweetId)) posts.set(context.tweetId, context);
      }
    }
  }
  return { posts: [...posts.values()], items: [], excludedAds: 0, adKeys: [] };
}
