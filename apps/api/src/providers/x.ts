import { creatorImageReference, identify } from '../identity';
import { providerJson, ProviderError } from '../remote';
import { extractWeb } from './web';
import type { Env } from '../types';
import type { ContributionInput } from '../enrichment';
import type { Extraction } from './web';
import type { FeedEntry } from './feed';

interface Post {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  conversation_id?: string;
  note_tweet?: { text: string; entities?: unknown };
  referenced_tweets?: { id: string; type: string }[];
  attachments?: { media_keys?: string[] };
  entities?: { urls?: { expanded_url: string; title?: string; description?: string }[] };
  public_metrics?: Record<string, number>;
}
interface User {
  id: string;
  name: string;
  username: string;
  description?: string;
  profile_image_url?: string;
}
interface Result {
  data?: Post | Post[];
  includes?: { users?: User[]; tweets?: Post[]; media?: Record<string, unknown>[] };
  meta?: { next_token?: string; newest_id?: string; oldest_id?: string };
  errors?: { resource_id?: string; title?: string }[];
}
const cached = new Map<string, string>();
async function bearer(env: Env) {
  if (env.X_BEARER_TOKEN) return env.X_BEARER_TOKEN;
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET)
    throw new ProviderError('x_credentials_missing', false);
  const previous = cached.get(env.X_CLIENT_ID);
  if (previous) return previous;
  const token = await providerJson<{ access_token: string }>(
    new URL('https://api.x.com/oauth2/token'),
    `Basic ${btoa(`${encodeURIComponent(env.X_CLIENT_ID)}:${encodeURIComponent(env.X_CLIENT_SECRET)}`)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
    }
  );
  if (!token.access_token) throw new ProviderError('x_app_token_unavailable', false);
  cached.set(env.X_CLIENT_ID, token.access_token);
  return token.access_token;
}
export async function xRequest<T>(env: Env, path: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.x.com/2/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return providerJson<T>(url, `Bearer ${await bearer(env)}`);
}
const postParams = {
  'tweet.fields':
    'created_at,author_id,conversation_id,note_tweet,referenced_tweets,attachments,entities,public_metrics,lang',
  expansions:
    'author_id,referenced_tweets.id,referenced_tweets.id.author_id,attachments.media_keys',
  'user.fields': 'name,username,description,profile_image_url',
  'media.fields': 'type,url,preview_image_url,duration_ms,variants,width,height',
};
const postText = (post: Post) => post.note_tweet?.text ?? post.text;
export async function extractX(env: Env, url: string): Promise<Extraction> {
  const identity = identify(url);
  if (identity.kind === 'video' || identity.kind === 'article') return extractWeb(identity.url);
  const provenance = { sourceUrl: identity.url, method: 'x-api', inputContributionIds: [] };
  const contributions: ContributionInput[] = [];
  const add = (field: ContributionInput['field'], value: unknown) => {
    if (value !== undefined && value !== null && value !== '')
      contributions.push({ field, value, category: 'source', provenance });
  };
  if (identity.kind === 'account') {
    const result = await xRequest<{ data: User }>(
      env,
      identity.key.startsWith('x:account_id:')
        ? `users/${identity.externalId}`
        : `users/by/username/${identity.externalId}`,
      {
        'user.fields': 'name,username,description,profile_image_url',
      }
    );
    add('title', result.data.name);
    add('creator', result.data.name);
    add('description', result.data.description);
    add('thumbnail', result.data.profile_image_url);
    add('creatorImageUrl', creatorImageReference(result.data.profile_image_url));
    add('source', {
      id: result.data.id,
      name: result.data.name,
      url: `https://x.com/${result.data.username}`,
      kind: 'account',
    });
    if (!/^\d+$/.test(result.data.id)) throw new ProviderError('x_invalid_account_identity', false);
    return {
      verifiedIdentity: {
        url: `https://x.com/i/user/${result.data.id}`,
        method: 'platform-identifier',
      },
      contributions,
      components: [{ component: 'metadata', status: 'available' }],
      feedUrls: [],
    };
  }
  if (identity.kind === 'list') {
    const result = await xRequest<{ data: { id: string; name: string; description?: string } }>(
      env,
      `lists/${identity.externalId}`,
      { 'list.fields': 'description,owner_id,member_count' }
    );
    add('title', result.data.name);
    add('description', result.data.description);
    return {
      contributions,
      components: [{ component: 'metadata', status: 'available' }],
      feedUrls: [],
    };
  }
  const initial = await xRequest<Result>(env, `tweets/${identity.externalId}`, postParams);
  const selected = initial.data as Post | undefined;
  if (!selected?.id) throw new ProviderError('x_post_unavailable', false);
  const posts = new Map<string, Post>([[selected.id, selected]]);
  const users = new Map<string, User>();
  const media: Record<string, unknown>[] = [];
  const absorb = (response: Result) => {
    for (const post of response.includes?.tweets ?? []) posts.set(post.id, post);
    for (const user of response.includes?.users ?? []) users.set(user.id, user);
    media.push(...(response.includes?.media ?? []));
  };
  absorb(initial);
  const visited = new Set<string>();
  let parentCoverage = 'complete';
  for (let depth = 0; depth < 20; depth++) {
    const missing = [...posts.values()]
      .flatMap((post) => post.referenced_tweets ?? [])
      .map((ref) => ref.id)
      .filter((ref) => !posts.has(ref) && !visited.has(ref));
    if (!missing.length) break;
    for (const ref of missing.slice(0, 10)) {
      visited.add(ref);
      try {
        const response = await xRequest<Result>(env, `tweets/${ref}`, postParams);
        const post = response.data as Post | undefined;
        if (post?.id) posts.set(post.id, post);
        else parentCoverage = 'partial';
        absorb(response);
      } catch {
        parentCoverage = 'partial';
      }
    }
    if (depth === 19) parentCoverage = 'partial';
  }
  let replyCoverage = 'not_available';
  if (selected.conversation_id && selected.author_id) {
    try {
      const response = await xRequest<Result>(env, 'tweets/search/recent', {
        ...postParams,
        query: `conversation_id:${selected.conversation_id} from:${selected.author_id}`,
        max_results: '100',
      });
      for (const post of Array.isArray(response.data) ? response.data : [])
        posts.set(post.id, post);
      absorb(response);
      replyCoverage = response.meta?.next_token ? 'partial' : 'recent_window_only';
    } catch {
      /* Parent/quote context still survives if search access is unavailable. */
    }
  }
  const author = selected.author_id ? users.get(selected.author_id) : undefined;
  const text = postText(selected);
  add('title', text.slice(0, 200));
  add('description', text);
  if (author) {
    add('creatorImageUrl', creatorImageReference(author.profile_image_url));
    add('creator', { name: author.name, url: `https://x.com/${author.username}`, id: author.id });
    add('source', {
      id: author.id,
      name: author.name,
      url: `https://x.com/${author.username}`,
      kind: 'account',
    });
  }
  add('publishedAt', selected.created_at);
  add('links', selected.entities?.urls);
  const thumbnail = media.find(
    (m) => typeof m.preview_image_url === 'string' || typeof m.url === 'string'
  );
  if (thumbnail) add('thumbnail', thumbnail.preview_image_url ?? thumbnail.url);
  add('thread', {
    selectedId: selected.id,
    conversationId: selected.conversation_id,
    posts: [...posts.values()]
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      .map((post) => ({ ...post, text: postText(post) })),
    users: [...users.values()],
    media,
    coverage: { parentsAndQuotes: parentCoverage, authoredReplies: replyCoverage },
  });
  return {
    contributions,
    components: [
      { component: 'metadata', status: 'available' },
      {
        component: 'thread',
        status: 'available',
        reasonCode:
          parentCoverage !== 'complete' || replyCoverage !== 'complete'
            ? 'context_coverage_limited'
            : undefined,
      },
    ],
    feedUrls: [],
  };
}

export async function xSource(env: Env, url: string) {
  const extraction = await extractX(env, url);
  const source = extraction.contributions.find((contribution) => contribution.field === 'source')
    ?.value as { id: string; name: string; url: string } | undefined;
  const identity = identify(url);
  if (identity.kind === 'list')
    return {
      url: identity.url,
      name: String(extraction.contributions.find((c) => c.field === 'title')?.value ?? 'X list'),
      kind: 'x_list',
      externalId: identity.externalId!,
    };
  if (!source) throw new ProviderError('x_source_unavailable', false);
  return { ...source, kind: 'x_account', externalId: source.id };
}
export async function xSourcePage(env: Env, url: string, cursor?: string, externalId?: string) {
  const source = externalId
    ? {
        externalId,
        kind: identify(url).kind === 'list' ? 'x_list' : 'x_account',
        name: 'X source',
        url,
      }
    : await xSource(env, url);
  const path =
    source.kind === 'x_list'
      ? `lists/${source.externalId}/tweets`
      : `users/${source.externalId}/tweets`;
  const response = await xRequest<Result>(env, path, {
    ...postParams,
    max_results: '100',
    ...(cursor ? { pagination_token: cursor } : {}),
  });
  const users = new Map((response.includes?.users ?? []).map((user) => [user.id, user]));
  const entries: FeedEntry[] = (Array.isArray(response.data) ? response.data : []).map((post) => {
    const author = post.author_id ? users.get(post.author_id) : undefined;
    return {
      id: `x:post:${post.id}`,
      url: `https://x.com/i/status/${post.id}`,
      title: postText(post).slice(0, 200),
      text: postText(post),
      publishedAt: post.created_at,
      creator: author?.name,
      creatorImageUrl: creatorImageReference(author?.profile_image_url),
      kind: 'post',
      enclosures: [],
      transcripts: [],
    };
  });
  return {
    title: source.name,
    url: source.url,
    entries,
    nextCursor: response.meta?.next_token,
    newestFirst: true,
  };
}
