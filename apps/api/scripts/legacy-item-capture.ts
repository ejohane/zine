import { Buffer } from 'node:buffer';
import { searchableSegments } from '../src/enrichment';
import { contentIdentity, creatorImageReference } from '../src/identity';
import { stableId } from '../src/lib';
import { projectLegacyLifecycle, projectLegacyProgress } from './legacy-lifecycle-plan';
import type { LegacyLifecycle, LegacyProgress } from './legacy-lifecycle-plan';

export interface LegacyItem extends LegacyLifecycle, LegacyProgress {
  canonical_url: string;
  item_id: string;
  title: string;
  summary: string | null;
  creator_name: string | null;
  creator_image_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  duration: number | null;
  content_created_at: string;
  content_updated_at: string;
  content_type: string;
}

export interface LegacyTarget {
  itemId: string;
  contentId: string;
}

export async function legacyIdentity(owner: string, row: LegacyItem) {
  const content = await contentIdentity(row.canonical_url);
  return { ...content, itemId: await stableId('itm', owner, content.id) };
}

export function chooseLegacyLifecycle(rows: LegacyItem[]) {
  return [...rows].sort((a, b) => {
    const pa = projectLegacyLifecycle(a);
    const pb = projectLegacyLifecycle(b);
    const savedFirst = Number(pb.status === 'saved') - Number(pa.status === 'saved');
    const explicitFirst =
      Number(pb.decisionOrigin === 'explicit') - Number(pa.decisionOrigin === 'explicit');
    return (
      savedFirst ||
      explicitFirst ||
      pb.decisionAt.localeCompare(pa.decisionAt) ||
      a.id.localeCompare(b.id)
    );
  })[0];
}

const sqlValue = (value: string | number | null) => {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') throw new Error('Invalid SQL value');
  if (value.includes('\0')) return `CAST(X'${Buffer.from(value, 'utf8').toString('hex')}' AS TEXT)`;
  return `'${value.replaceAll("'", "''")}'`;
};
const values = (...args: (string | number | null)[]) => args.map(sqlValue).join(',');
const insert = (table: string, columns: string, ...args: (string | number | null)[]) =>
  `INSERT INTO ${table}(${columns}) VALUES(${values(...args)})`;

export async function createLegacyItemsSql(
  owner: string,
  generation: number,
  groups: LegacyItem[][],
  guardId: string
) {
  const body: string[] = [];
  const itemIds = new Set<string>();
  for (const group of groups) {
    const row = chooseLegacyLifecycle(group);
    if (!row) throw new Error('Empty legacy identity group');
    const identity = await legacyIdentity(owner, row);
    if (itemIds.has(identity.itemId)) throw new Error('Duplicate item in capture batch');
    itemIds.add(identity.itemId);
    for (const other of group) {
      if (
        (await legacyIdentity(owner, other)).itemId !== identity.itemId ||
        other.canonical_url !== row.canonical_url
      )
        throw new Error('Conflicting source records need an explicit identity decision');
    }
    const item = projectLegacyLifecycle(row);
    const progress = projectLegacyProgress(row);
    const initial = row.created_at;
    const type =
      {
        BOOK: 'book',
        ARTICLE: 'article',
        PODCAST: 'podcast_episode',
        VIDEO: 'video',
        POST: 'post',
      }[row.content_type] ?? identity.kind;
    body.push(
      `INSERT OR IGNORE INTO content_items(id,identity_key,canonical_url,platform,kind,created_at)
       VALUES(${values(identity.id, identity.key, identity.url, identity.platform, identity.kind, row.content_created_at)})`,
      insert(
        'personal_items',
        'id,owner_id,content_id,status,archived,created_at,ingested_at,saved_at,updated_at,generation,content_type,decision_at,decision_origin',
        identity.itemId,
        owner,
        identity.id,
        item.status,
        item.archived,
        initial,
        row.ingested_at,
        item.savedAt,
        row.updated_at,
        generation,
        type,
        item.decisionAt,
        item.decisionOrigin
      )
    );
    if (progress)
      body.push(
        insert(
          'progress',
          'item_id,position,unit,completed_at,contributor,updated_at',
          identity.itemId,
          progress.position,
          progress.unit,
          progress.completedAt,
          'zine:legacy-import',
          progress.updatedAt
        )
      );
    for (const original of group) {
      body.push(
        insert(
          'legacy_import_records',
          'owner_id,section,legacy_id,item_id,payload_json,applied_json',
          owner,
          'items',
          original.id,
          identity.itemId,
          JSON.stringify(original),
          original.id === row.id ? JSON.stringify({ lifecycle: item, progress }) : null
        )
      );
      const observed = original.bookmarked_at ?? original.ingested_at;
      body.push(
        insert(
          'save_occurrences',
          'id,owner_id,item_id,contributor,route,created_at,input_url',
          await stableId('sav', owner, 'legacy-library', original.id),
          owner,
          identity.itemId,
          'zine:legacy-import',
          original.bookmarked_at ? 'explicit' : 'legacy-arrival',
          observed,
          original.canonical_url
        )
      );
    }
    // Imported metadata is private and lower priority than a user's correction
    // or an independently extracted source observation.
    const metadata = {
      title: row.title,
      description: row.summary,
      creator: row.creator_name,
      creatorImageUrl: creatorImageReference(row.creator_image_url) ?? null,
      thumbnail: row.thumbnail_url,
      publishedAt: row.published_at,
      durationSeconds: row.duration,
      type,
    };
    for (const [field, value] of Object.entries(metadata)) {
      if (value === null || value === '') continue;
      const contributionId = await stableId('ctr', owner, 'legacy-library', row.id, field);
      body.push(
        insert(
          'contributions',
          'id,content_id,owner_id,field,value_json,provenance_json,contributor,category,priority,created_at,updated_at',
          contributionId,
          identity.id,
          owner,
          field,
          JSON.stringify(value),
          JSON.stringify({
            method: 'legacy-library-migration',
            sourceUrl: row.canonical_url,
            inputContributionIds: [],
          }),
          'zine:legacy-import',
          'source',
          -10,
          row.content_created_at,
          row.content_updated_at
        )
      );
      for (const segment of searchableSegments(field, value))
        if (segment.text)
          body.push(
            insert(
              'search_documents',
              'content_id,owner_id,contribution_id,field,text,anchor_json',
              identity.id,
              owner,
              contributionId,
              field,
              segment.text,
              segment.anchor ? JSON.stringify(segment.anchor) : null
            )
          );
    }
  }
  const fence = `INSERT INTO write_guards(id,valid) VALUES(
    ${sqlValue(guardId)},
    CASE WHEN COALESCE((SELECT generation FROM owner_generations WHERE owner_id=${sqlValue(owner)}),0)=${generation}
    AND NOT EXISTS (
      SELECT 1 FROM item_aliases WHERE owner_id=${sqlValue(owner)} AND alias_item_id IN (${[...itemIds].map(sqlValue).join(',')})
    ) THEN 1 ELSE 0 END
  )`;
  return [fence, ...body, `DELETE FROM write_guards WHERE id=${sqlValue(guardId)}`];
}

export async function attachLegacyItemsSql(
  owner: string,
  generation: number,
  itemId: string,
  group: LegacyItem[],
  historical: { legacyId: string; importedAt: string } | undefined,
  guardId: string
) {
  if (!group.length) throw new Error('Empty legacy identity group');
  const ownerSql = sqlValue(owner);
  const itemSql = sqlValue(itemId);
  const guardSql = sqlValue(guardId);
  const statements = [
    `INSERT INTO write_guards(id,valid) VALUES(${guardSql}, CASE WHEN
      COALESCE((SELECT generation FROM owner_generations WHERE owner_id=${ownerSql}),0)=${generation}
      AND EXISTS(SELECT 1 FROM personal_items WHERE owner_id=${ownerSql} AND id=${itemSql})
      AND NOT EXISTS(SELECT 1 FROM item_aliases WHERE owner_id=${ownerSql} AND alias_item_id=${itemSql})
      THEN 1 ELSE 0 END)`,
  ];
  const representative = chooseLegacyLifecycle(group);
  if (historical) {
    const original = group.find((row) => row.id === historical.legacyId);
    if (!original) throw new Error('Missing historical source identity');
    const sourceId = sqlValue(original.id);
    const importedAt = sqlValue(historical.importedAt);
    statements.push(
      `UPDATE personal_items AS p SET created_at=${sqlValue(original.created_at)},
        ingested_at=COALESCE(ingested_at,${sqlValue(original.ingested_at)}), revision=revision+1
      WHERE p.owner_id=${ownerSql} AND p.id=${itemSql} AND p.status!='deleted'
        AND p.created_at=${importedAt}
        AND EXISTS(SELECT 1 FROM idempotency r WHERE r.owner_id=p.owner_id AND r.operation='save'
          AND r.key='real-library-'||${sourceId} AND r.created_at=${importedAt}
          AND json_extract(r.response_json,'$.item.id')=p.id
          AND json_extract(r.response_json,'$.save.outcome')='created')`
    );
  }
  for (const row of group) {
    const projection = projectLegacyLifecycle(row);
    const applied = JSON.stringify({ lifecycle: projection, progress: projectLegacyProgress(row) });
    const matches = `p.status=${sqlValue(projection.status)}
      AND p.archived=${projection.archived}
      AND p.saved_at IS ${sqlValue(projection.savedAt)} AND p.decision_at IS ${sqlValue(projection.decisionAt)}`;
    statements.push(
      `INSERT INTO legacy_import_records(owner_id,section,legacy_id,item_id,payload_json,applied_json)
       SELECT p.owner_id,'items',${sqlValue(row.id)},p.id,
          CASE WHEN p.status!='deleted' THEN ${sqlValue(JSON.stringify(row))} END,
          CASE WHEN ${row.id === representative.id && Boolean(historical) ? matches : 'false'}
          THEN ${sqlValue(applied)} END
       FROM personal_items p WHERE p.owner_id=${ownerSql} AND p.id=${itemSql}`,
      `INSERT INTO save_occurrences(id,owner_id,item_id,contributor,route,created_at,input_url)
       SELECT ${sqlValue(await stableId('sav', owner, 'legacy-library', row.id))},p.owner_id,p.id,'zine:legacy-import',
        ${sqlValue(row.bookmarked_at ? 'explicit' : 'legacy-arrival')},
        ${sqlValue(row.bookmarked_at ?? row.ingested_at)},${sqlValue(row.canonical_url)}
       FROM personal_items p WHERE p.owner_id=${ownerSql} AND p.id=${itemSql} AND p.status!='deleted'`
    );
  }
  return [...statements, `DELETE FROM write_guards WHERE id=${guardSql}`];
}

type AppliedState = {
  lifecycle: ReturnType<typeof projectLegacyLifecycle> | null;
  progress: ReturnType<typeof projectLegacyProgress>;
};

export function reconcileLegacyStateSql(
  owner: string,
  generation: number,
  itemId: string,
  records: { original: LegacyItem; previousPayload: string; previousApplied: string | null }[],
  guardId: string
) {
  const ownerSql = sqlValue(owner);
  const itemSql = sqlValue(itemId);
  const guard = sqlValue(guardId);
  const rows = records.map(({ original }) => original);
  const representative = chooseLegacyLifecycle(rows);
  if (!representative) throw new Error('Empty migration reconciliation group');
  const appliedRecords = records.filter((row) => row.previousApplied !== null);
  if (appliedRecords.length > 1) throw new Error('Multiple applied source representatives');
  const previous = appliedRecords.length
    ? (JSON.parse(appliedRecords[0].previousApplied!) as AppliedState)
    : null;
  const lifecycle = projectLegacyLifecycle(representative);
  const progress = projectLegacyProgress(representative);
  const recordConditions = records.map(
    ({ original, previousPayload, previousApplied }) =>
      `EXISTS(SELECT 1 FROM legacy_import_records WHERE owner_id=${ownerSql}
      AND section='items' AND legacy_id=${sqlValue(original.id)} AND item_id=${itemSql}
      AND payload_json IS ${sqlValue(previousPayload)} AND applied_json IS ${sqlValue(previousApplied)})`
  );
  const target = `p.id=${itemSql} AND p.owner_id=${ownerSql} AND p.status!='deleted'`;
  const sql = [
    `INSERT INTO write_guards(id,valid) VALUES(${guard}, CASE WHEN
      COALESCE((SELECT generation FROM owner_generations WHERE owner_id=${ownerSql}),0)=${generation}
      AND EXISTS(SELECT 1 FROM personal_items p WHERE ${target})
      AND ${recordConditions.join(' AND ')} THEN 1 ELSE 0 END)`,
  ];
  const lifeMatches = (state: NonNullable<AppliedState['lifecycle']>) =>
    `p.status=${sqlValue(state.status)} AND p.archived=${state.archived}
      AND p.saved_at IS ${sqlValue(state.savedAt)} AND p.decision_at IS ${sqlValue(state.decisionAt)}
      AND p.decision_origin=${sqlValue(state.decisionOrigin)}`;
  const oldProgress = previous?.progress;
  const progressMatches = (state: AppliedState['progress']) =>
    state
      ? `EXISTS(SELECT 1 FROM progress r WHERE r.item_id=p.id AND r.contributor='zine:legacy-import'
      AND r.position IS ${sqlValue(state.position)} AND r.unit IS ${sqlValue(state.unit)}
      AND r.completed_at IS ${sqlValue(state.completedAt)} AND r.updated_at=${sqlValue(state.updatedAt)})`
      : 'NOT EXISTS(SELECT 1 FROM progress r WHERE r.item_id=p.id)';
  if (previous?.lifecycle && JSON.stringify(previous.lifecycle) !== JSON.stringify(lifecycle)) {
    sql.push(
      `UPDATE personal_items AS p SET status=${sqlValue(lifecycle.status)},archived=${lifecycle.archived},
        saved_at=${sqlValue(lifecycle.savedAt)},decision_at=${sqlValue(lifecycle.decisionAt)},
        decision_origin=${sqlValue(lifecycle.decisionOrigin)},
        updated_at=MAX(updated_at,${sqlValue(representative.updated_at)}),revision=revision+1
      WHERE ${target} AND ${lifeMatches(previous.lifecycle)}`
    );
  }
  if (previous && JSON.stringify(oldProgress) !== JSON.stringify(progress)) {
    if (progress) {
      sql.push(
        `INSERT INTO progress(item_id,position,unit,completed_at,contributor,updated_at)
        SELECT p.id,${sqlValue(progress.position)},${sqlValue(progress.unit)},${sqlValue(progress.completedAt)},
          'zine:legacy-import',${sqlValue(progress.updatedAt)} FROM personal_items p
        WHERE ${target} AND ${progressMatches(oldProgress ?? null)}
        ON CONFLICT(item_id) DO UPDATE SET position=excluded.position,unit=excluded.unit,
          completed_at=excluded.completed_at,updated_at=excluded.updated_at`
      );
    } else if (oldProgress) {
      sql.push(`DELETE FROM progress WHERE item_id IN(
        SELECT p.id FROM personal_items p WHERE ${target} AND ${progressMatches(oldProgress)}
      )`);
    }
  }
  for (const { original } of records) {
    const writeApplied =
      previous && original.id === representative.id
        ? `(SELECT json_object('lifecycle',
        json(CASE WHEN ${lifeMatches(lifecycle)} THEN ${sqlValue(JSON.stringify(lifecycle))}
                  ELSE ${sqlValue(JSON.stringify(previous.lifecycle))} END),
        'progress',json(CASE WHEN ${progressMatches(progress)} THEN ${sqlValue(JSON.stringify(progress))}
                  ELSE ${sqlValue(JSON.stringify(previous.progress))} END))
        FROM personal_items p WHERE ${target})`
        : 'NULL';
    sql.push(
      `UPDATE legacy_import_records SET payload_json=${sqlValue(JSON.stringify(original))},applied_json=${writeApplied}
      WHERE owner_id=${ownerSql} AND section='items' AND legacy_id=${sqlValue(original.id)} AND item_id=${itemSql}`
    );
  }
  return [...sql, `DELETE FROM write_guards WHERE id=${guard}`];
}
