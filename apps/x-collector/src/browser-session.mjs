export function createCollectionSession(checkpoint = {}) {
  const acceptedTweetIds = new Set(checkpoint.acceptedTweetIds || []);
  const acceptedPostIds = new Set(checkpoint.acceptedPostIds || checkpoint.acceptedTweetIds || []);
  const acceptedAdKeys = new Set(checkpoint.acceptedAdKeys || []);
  const nextPosition = Number.isInteger(checkpoint.nextPosition)
    ? checkpoint.nextPosition
    : acceptedTweetIds.size;
  const contextRecords = new Map(
    (checkpoint.contextRecords || []).map((record) => [record.rootTweetId, record])
  );
  const outsideWindowTweetIds = new Set(checkpoint.outsideWindowTweetIds || []);
  const missingTimestampTweetIds = new Set(checkpoint.missingTimestampTweetIds || []);
  const collectionPolicy = checkpoint.collectionPolicy || { mode: 'COUNT' };

  return {
    acceptedTweetIds,
    acceptedPostIds,
    acceptedAdKeys,
    contextRecords,
    outsideWindowTweetIds,
    missingTimestampTweetIds,
    collectionPolicy,
    nextPosition,
  };
}

export function reserveContextExpansion(state, rootTweetId, budget = 40) {
  const existing = state.contextRecords.get(rootTweetId);
  if (existing) return { allowed: false, duplicate: true, status: existing };
  const attempted = [...state.contextRecords.values()].filter(
    (record) => record.status !== 'SKIPPED'
  ).length;
  if (attempted >= budget) {
    const status = {
      rootTweetId,
      status: 'TRUNCATED',
      reason: 'context_budget_reached',
    };
    state.contextRecords.set(rootTweetId, status);
    return { allowed: false, duplicate: false, status };
  }
  const status = { rootTweetId, status: 'PENDING', reason: null };
  state.contextRecords.set(rootTweetId, status);
  return { allowed: true, duplicate: false, status };
}

export function finishContextExpansion(state, rootTweetId, status, reason = null) {
  if (!['COMPLETE', 'TRUNCATED', 'FAILED'].includes(status)) {
    throw new Error(`Unsupported context status ${status}`);
  }
  const record = { rootTweetId, status, reason };
  state.contextRecords.set(rootTweetId, record);
  return record;
}

export function prepareTimelineBatch(rawBatch, state, requestedCount) {
  const remaining = Math.max(0, requestedCount - state.acceptedTweetIds.size);
  const newAdKeys = [];
  for (const adKey of rawBatch.adKeys || []) {
    if (state.acceptedAdKeys.has(adKey)) continue;
    state.acceptedAdKeys.add(adKey);
    newAdKeys.push(adKey);
  }

  const postsById = new Map((rawBatch.posts || []).map((post) => [post.tweetId, post]));
  const newOutsideWindowTweetIds = [];
  const newMissingTimestampTweetIds = [];
  const items = [];
  for (const item of rawBatch.items || []) {
    if (state.acceptedTweetIds.has(item.tweetId)) continue;
    if (state.collectionPolicy.mode === 'ROLLING_WINDOW' && item.presentation !== 'REPOST') {
      const publishedAt = Date.parse(postsById.get(item.tweetId)?.publishedAt || '');
      if (!Number.isFinite(publishedAt)) {
        if (!state.missingTimestampTweetIds.has(item.tweetId)) {
          state.missingTimestampTweetIds.add(item.tweetId);
          newMissingTimestampTweetIds.push(item.tweetId);
        }
        continue;
      }
      if (publishedAt < Date.parse(state.collectionPolicy.cutoffAt)) {
        if (!state.outsideWindowTweetIds.has(item.tweetId)) {
          state.outsideWindowTweetIds.add(item.tweetId);
          newOutsideWindowTweetIds.push(item.tweetId);
        }
        continue;
      }
    }
    if (items.length >= remaining) continue;
    state.acceptedTweetIds.add(item.tweetId);
    items.push({ ...item, position: state.nextPosition++ });
  }

  const neededPostIds = new Set(items.map((item) => item.tweetId));
  for (const post of rawBatch.posts || []) {
    if (!neededPostIds.has(post.tweetId)) continue;
    for (const relationship of post.relationships || []) {
      neededPostIds.add(relationship.tweetId);
    }
  }

  const hasStableAdKeys = Array.isArray(rawBatch.adKeys);
  const posts = (rawBatch.posts || []).filter((post) => neededPostIds.has(post.tweetId));
  for (const post of posts) state.acceptedPostIds.add(post.tweetId);
  return {
    payload: {
      posts,
      items,
      adKeys: newAdKeys,
      excludedAds: hasStableAdKeys ? newAdKeys.length : rawBatch.excludedAds || 0,
      windowEvidence: {
        outsideWindowTweetIds: newOutsideWindowTweetIds,
        missingTimestampTweetIds: newMissingTimestampTweetIds,
      },
    },
    addedItems: items.length,
    totalAccepted: state.acceptedTweetIds.size,
    complete:
      state.collectionPolicy.mode === 'ROLLING_WINDOW'
        ? state.outsideWindowTweetIds.size >= state.collectionPolicy.boundaryEvidenceRequired
        : state.acceptedTweetIds.size >= requestedCount,
    safetyLimitReached:
      state.collectionPolicy.mode === 'ROLLING_WINDOW' &&
      state.acceptedTweetIds.size >= requestedCount &&
      state.outsideWindowTweetIds.size < state.collectionPolicy.boundaryEvidenceRequired,
    windowCoverage: {
      outsideWindow: state.outsideWindowTweetIds.size,
      missingPublishedAt: state.missingTimestampTweetIds.size,
      boundaryEvidenceRequired:
        state.collectionPolicy.mode === 'ROLLING_WINDOW'
          ? state.collectionPolicy.boundaryEvidenceRequired
          : 0,
      boundaryReached:
        state.collectionPolicy.mode === 'ROLLING_WINDOW' &&
        state.outsideWindowTweetIds.size >= state.collectionPolicy.boundaryEvidenceRequired,
    },
  };
}

export function prepareContextBatch(rawBatch, state) {
  const posts = [];
  for (const post of rawBatch.posts || []) {
    if (state.acceptedPostIds.has(post.tweetId)) continue;
    state.acceptedPostIds.add(post.tweetId);
    posts.push(post);
  }
  return {
    payload: {
      posts,
      items: [],
      adKeys: [],
      excludedAds: 0,
      windowEvidence: { outsideWindowTweetIds: [], missingTimestampTweetIds: [] },
    },
    addedPosts: posts.length,
  };
}
