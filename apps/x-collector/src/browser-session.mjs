export function createCollectionSession(checkpoint = {}) {
  const acceptedTweetIds = new Set(checkpoint.acceptedTweetIds || []);
  const acceptedAdKeys = new Set(checkpoint.acceptedAdKeys || []);
  const nextPosition = Number.isInteger(checkpoint.nextPosition)
    ? checkpoint.nextPosition
    : acceptedTweetIds.size;

  return { acceptedTweetIds, acceptedAdKeys, nextPosition };
}

export function prepareTimelineBatch(rawBatch, state, requestedCount) {
  const remaining = Math.max(0, requestedCount - state.acceptedTweetIds.size);
  const newAdKeys = [];
  for (const adKey of rawBatch.adKeys || []) {
    if (state.acceptedAdKeys.has(adKey)) continue;
    state.acceptedAdKeys.add(adKey);
    newAdKeys.push(adKey);
  }

  const items = [];
  for (const item of rawBatch.items || []) {
    if (items.length >= remaining || state.acceptedTweetIds.has(item.tweetId)) continue;
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
  return {
    payload: {
      posts: (rawBatch.posts || []).filter((post) => neededPostIds.has(post.tweetId)),
      items,
      adKeys: newAdKeys,
      excludedAds: hasStableAdKeys ? newAdKeys.length : rawBatch.excludedAds || 0,
    },
    addedItems: items.length,
    totalAccepted: state.acceptedTweetIds.size,
    complete: state.acceptedTweetIds.size >= requestedCount,
  };
}
