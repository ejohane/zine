import { z } from 'zod4';
import { ApiError, all, id, now, operationGeneration, stmt } from './lib';
import { getItem } from './items';
import { filterSchema, filterSql } from './query';
import type { Env } from './types';

export const homeFilters = filterSchema.parse({
  status: 'saved',
  archived: false,
  completed: false,
  types: ['article', 'podcast_episode', 'video', 'post'],
});

export const homeDraftSchema = z
  .object({
    leadBeforeRecent: z.boolean(),
    collections: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(100),
            itemIds: z
              .array(z.string().regex(/^itm_[a-f0-9]+$/))
              .min(2)
              .max(8),
          })
          .strict()
      )
      .max(12),
  })
  .strict()
  .refine(({ collections }) => {
    const ids = collections.flatMap((collection) => collection.itemIds);
    return ids.length <= 24 && new Set(ids).size === ids.length;
  }, 'An edition can contain at most 24 unique editorial cards');

export const homePublishSchema = z
  .object({
    expectedEditionId: z.string().nullable(),
    draft: homeDraftSchema,
  })
  .strict();

export type HomeDraft = z.infer<typeof homeDraftSchema>;
export type HomeCard = ReturnType<typeof homeCard>;
type Item = Awaited<ReturnType<typeof getItem>>;
type Edition = { id: string; generatedAt: string; draft: HomeDraft };

type Post = { id?: string; text?: string; author_id?: string };
type Thread = { selectedId?: string; posts?: Post[] };
const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

// Opening text for a card: whole paragraphs while they fit, then whole sentences, never mid-word.
export function openingText(text: string, limit = 700) {
  const paragraphs = text
    .split(/\n\s*\n|\r?\n(?=\s*\S)/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const kept: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const room = limit - length - (kept.length ? 2 : 0);
    if (paragraph.length <= room) {
      kept.push(paragraph);
      length += paragraph.length + (kept.length > 1 ? 2 : 0);
      continue;
    }
    if (room < 80 && kept.length) break;
    const sentences = paragraph.match(/[^.!?]+[.!?]+["'”’)\]]*\s*|[^.!?]+$/g) ?? [paragraph];
    let cut = '';
    for (const sentence of sentences) {
      if ((cut + sentence).trim().length > room) break;
      cut += sentence;
    }
    if (!cut.trim()) {
      const slice = paragraph.slice(0, room - 1);
      cut = slice.slice(0, Math.max(slice.lastIndexOf(' '), 1)) + '…';
    }
    kept.push(cut.trim());
    break;
  }
  return kept.join('\n\n') || undefined;
}

function threadParts(thread: Thread | undefined) {
  const posts = thread?.posts ?? [];
  const selected = posts.find((post) => post.id === thread?.selectedId) ?? posts[0];
  if (!selected?.text) return {};
  const authored = posts.filter(
    (post) => post.author_id && post.author_id === selected.author_id && post.text
  );
  // The author's own posts in the conversation, starting at the saved post.
  const from = Math.max(0, authored.indexOf(selected));
  const run = authored.length ? authored.slice(from) : [selected];
  return { text: run.map((post) => post.text).join('\n\n'), count: run.length };
}

export function homeCard(item: Item) {
  const { id, savedAt, progress, content } = item;
  const {
    url,
    platform,
    type,
    title,
    thumbnail,
    creator,
    creatorImageUrl,
    durationSeconds,
    summary,
  } = content;
  const article = content.article as { text?: string; coverage?: string } | undefined;
  const thread = threadParts(content.thread as Thread | undefined);
  const description = typeof content.description === 'string' ? content.description : undefined;
  const source = article?.text || thread.text || summary || description;
  const preview = typeof source === 'string' ? openingText(source) : undefined;
  const readMinutes =
    type === 'article' && article?.text && article.coverage !== 'partial'
      ? Math.max(1, Math.ceil(words(article.text) / 230))
      : undefined;
  return {
    id,
    savedAt,
    progress,
    content: {
      url,
      platform,
      type,
      title,
      thumbnail,
      creator,
      creatorImageUrl,
      durationSeconds,
      summary,
      ...(preview ? { preview } : {}),
      ...(readMinutes ? { readMinutes } : {}),
      ...(thread.count && thread.count > 1 ? { threadPosts: thread.count } : {}),
    },
  };
}

export function assembleHome(
  edition: Edition | null,
  resume: HomeCard[],
  recent: HomeCard[],
  editorial: ReadonlyMap<string, HomeCard>
) {
  const sections: {
    id: string;
    kind: 'resume' | 'recent' | 'collection';
    title: string;
    cards: HomeCard[];
  }[] = [];
  const used = new Set<string>();
  function append(
    id: string,
    kind: (typeof sections)[number]['kind'],
    title: string,
    cards: HomeCard[]
  ) {
    const unique = new Map(cards.map((card) => [card.id, card]));
    const available = [...unique.values()]
      .filter((card) => !used.has(card.id))
      .slice(0, 30 - used.size);
    if (available.length < (kind === 'collection' ? 2 : 1)) return;
    for (const card of available) used.add(card.id);
    sections.push({ id, kind, title, cards: available });
  }
  append('resume', 'resume', 'Jump back in', resume.slice(0, 3));
  append('recent', 'recent', 'Just saved', recent.filter((card) => !used.has(card.id)).slice(0, 5));
  edition?.draft.collections.forEach(({ title, itemIds }) => {
    const cards = itemIds.flatMap((itemId) => {
      const card = editorial.get(itemId);
      return card ? [card] : [];
    });
    append(`${edition.id}-${itemIds[0]}`, 'collection', title, cards);
  });
  // Keep the two live sections in predictable positions while giving the lead collection
  // the first editorial slot. Resolve duplicates in live-section order before moving it.
  const firstEditorialItem = edition?.draft.collections[0]?.itemIds[0];
  const lead = sections.findIndex(
    (section) => section.id === `${edition?.id}-${firstEditorialItem}`
  );
  const recentIndex = sections.findIndex((section) => section.kind === 'recent');
  if (edition?.draft.leadBeforeRecent && recentIndex >= 0 && lead > recentIndex)
    sections.splice(recentIndex, 0, ...sections.splice(lead, 1));
  return { editionId: edition?.id ?? null, generatedAt: edition?.generatedAt ?? null, sections };
}

export function eligibleForHome(item: Item) {
  return (
    item.status === 'saved' &&
    !item.archived &&
    !item.progress.completedAt &&
    homeFilters.types!.includes(item.content.type)
  );
}

async function hydrate(env: Env, owner: string, ids: string[]) {
  const entries = await Promise.all(
    ids.map(async (itemId) => {
      try {
        const item = await getItem(env, owner, itemId, ['article', 'thread']);
        return eligibleForHome(item) ? ([itemId, homeCard(item)] as const) : null;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    })
  );
  return new Map(entries.filter((entry) => entry !== null));
}

async function liveIds(env: Env, owner: string, resume: boolean) {
  const { where, params } = filterSql(owner, homeFilters);
  const order = resume
    ? 'pr.updated_at DESC,p.id DESC'
    : 'COALESCE(p.saved_at,p.created_at) DESC,p.id DESC';
  if (resume) where.push('pr.position>0');
  const rows = await all<{ id: string }>(
    env.DB,
    `
    SELECT p.id FROM personal_items p JOIN content_items c ON c.id=p.content_id
    ${resume ? 'JOIN progress pr ON pr.item_id=p.id' : ''}
    WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`,
    ...params,
    resume ? 3 : 8
  );
  return rows.map((row) => row.id);
}

/**
 * How much the library holds, for clients that label their filters with numbers: open saves by
 * content type, and what is waiting in the inbox.
 */
async function libraryCounts(env: Env, owner: string) {
  const { results } = await stmt(
    env.DB,
    `SELECT status,COALESCE(content_type,'unknown') AS type,COUNT(*) AS count FROM personal_items
     WHERE owner_id=? AND status IN ('saved','received') AND archived=0 GROUP BY status,type`,
    owner
  ).all<{ status: string; type: string; count: number }>();
  const counts = { saved: 0, inbox: 0, savedByType: {} as Record<string, number> };
  for (const { status, type, count } of results) {
    if (status === 'received') counts.inbox += count;
    else {
      counts.saved += count;
      counts.savedByType[type] = count;
    }
  }
  return counts;
}

export async function getHome(env: Env, owner: string, preview?: HomeDraft) {
  const [row, resumeIds, recentIds, counts] = await Promise.all([
    preview
      ? null
      : stmt(
          env.DB,
          'SELECT id,generated_at,sections_json FROM home_editions WHERE owner_id=?',
          owner
        ).first<{ id: string; generated_at: string; sections_json: string }>(),
    liveIds(env, owner, true),
    liveIds(env, owner, false),
    libraryCounts(env, owner),
  ]);
  const edition = preview
    ? { id: 'preview', generatedAt: now(), draft: preview }
    : row
      ? {
          id: row.id,
          generatedAt: row.generated_at,
          draft: homeDraftSchema.parse(JSON.parse(row.sections_json)),
        }
      : null;
  const editorialIds = edition?.draft.collections.flatMap((collection) => collection.itemIds) ?? [];
  const hydrated = await hydrate(env, owner, [
    ...new Set([...resumeIds, ...recentIds, ...editorialIds]),
  ]);
  const cards = (ids: string[]) =>
    ids.flatMap((itemId) => {
      const card = hydrated.get(itemId);
      return card ? [card] : [];
    });
  return {
    ...assembleHome(
      edition,
      cards(resumeIds).filter((card) => (card.progress.position ?? 0) > 0),
      cards(recentIds),
      hydrated
    ),
    counts,
  };
}

export async function publishHome(
  env: Env,
  owner: string,
  { draft, expectedEditionId }: z.infer<typeof homePublishSchema>
) {
  const epoch = await operationGeneration(env, owner);
  const editionId = id('hed');
  const timestamp = now();
  const { where, params } = filterSql(owner, homeFilters);
  const ids = draft.collections.flatMap((collection) => collection.itemIds);
  // Check current ownership, lifecycle, and compare-and-swap in the same write.
  const result = await stmt(
    env.DB,
    `
    INSERT INTO home_editions(owner_id,id,generated_at,sections_json)
    SELECT ?,?,?,?
    WHERE (SELECT id FROM home_editions WHERE owner_id=?) IS ?
      AND COALESCE((SELECT generation FROM owner_generations WHERE owner_id=?),0)=?
      AND (SELECT count(*) FROM personal_items p JOIN content_items c ON c.id=p.content_id
        WHERE ${where.join(' AND ')} AND p.id IN (SELECT value FROM json_each(?)))=?
    ON CONFLICT(owner_id) DO UPDATE SET
      id=excluded.id,generated_at=excluded.generated_at,sections_json=excluded.sections_json`,
    owner,
    editionId,
    timestamp,
    JSON.stringify(draft),
    owner,
    expectedEditionId,
    owner,
    epoch,
    ...params,
    JSON.stringify(ids),
    ids.length
  ).run();
  if (!result.meta.changes)
    throw new ApiError(
      409,
      'home_edition_changed',
      'Home or its candidate saves changed; rebuild the edition'
    );
  return { editionId, generatedAt: timestamp };
}
