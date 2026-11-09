import { processUnderstanding, scheduleUnderstanding } from './understanding';
import type { UnderstandingPayload } from './understanding';
import { contribute } from './enrichment';
import { all, ApiError, id, now, ownedItem, stmt } from './lib';
import { ProviderError } from './remote';
import { publishedTranscript } from './providers/transcript';
import { extractWeb } from './providers/web';
import { extractSpotify } from './providers/spotify';
import { extractYouTube } from './providers/youtube';
import { hasYouTubeApi } from './providers/youtube-api';
import { extractX } from './providers/x';
import { indexItem } from './semantic';
import { diagnostic } from './diagnostics';
import { contentIdentity, personalContentIdentity } from './identity';
import { addRelationship, relationshipSchema } from './relationships';
import { reconcileVerifiedIdentity } from './reconciliation';
import { acquireBudget, budgetScope, releaseBudget } from './budgets';
import { syncSubscription } from './subscriptions';
import type { Env } from './types';
import type { ContributionInput } from './enrichment';
import type { FeedEntry } from './providers/feed';

interface JobRow {
  id: string;
  owner_id: string;
  item_id: string | null;
  kind: string;
  payload_json: string;
  attempts: number;
  lease_token: string;
}

function feedContributions(entry: FeedEntry, sourceUrl = entry.url): ContributionInput[] {
  const provenance = { sourceUrl, method: 'feed-ingestion', inputContributionIds: [] };
  const values: [ContributionInput['field'], unknown][] = [
    ['type', entry.kind],
    ['title', entry.title],
    ['description', entry.description],
    ['creator', entry.creator],
    ['publishedAt', entry.publishedAt],
    ['durationSeconds', entry.durationSeconds],
    ['thumbnail', entry.thumbnail],
    ['links', entry.enclosures],
    ['structuredData', { feedEntry: entry }],
  ];
  if (entry.text) values.push(['article', { text: entry.text }]);
  return values
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([field, value]) => ({ field, value, category: 'source', provenance }));
}

async function commitSourceContributions(
  env: Env,
  job: JobRow,
  itemId: string,
  contentId: string,
  generation: number,
  contributions: ContributionInput[]
) {
  const principal = { userId: job.owner_id, contributor: 'zine:provider' };
  for (const contribution of contributions) {
    const previous = await stmt(
      env.DB,
      `SELECT id FROM contributions WHERE content_id=? AND owner_id=? AND field=? AND contributor=? AND json_extract(provenance_json,'$.method')=? AND json_extract(provenance_json,'$.sourceUrl') IS ? ORDER BY created_at,id LIMIT 1`,
      contentId,
      job.owner_id,
      contribution.field,
      principal.contributor,
      contribution.provenance.method,
      contribution.provenance.sourceUrl ?? null
    ).first<string>('id');
    await contribute(env, principal, itemId, contribution, previous ?? undefined, generation);
  }
}
async function retainFeedMetadata(env: Env, job: JobRow) {
  const payload = JSON.parse(job.payload_json) as {
    stage?: string;
    generation: number;
    feedEntry?: FeedEntry;
    feedMetadataApplied?: boolean;
    feedEntryArtifactKey?: string;
    feedSourceUrl?: string;
  };
  if (job.kind !== 'enrich' || payload.stage || payload.feedMetadataApplied || !job.item_id) return;
  if (!payload.feedEntry && payload.feedEntryArtifactKey) {
    const registered = await stmt(
      env.DB,
      'SELECT r.artifact_key FROM subscription_snapshots r JOIN subscriptions s ON s.id=r.subscription_id WHERE r.artifact_key=? AND s.owner_id=?',
      payload.feedEntryArtifactKey,
      job.owner_id
    ).first();
    if (!registered) throw new ApiError(409, 'stale_generation', 'Feed input was erased');
    const material = await env.ARTIFACTS.get(payload.feedEntryArtifactKey);
    if (!material) throw new ProviderError('feed_metadata_pending', true, 5);
    payload.feedEntry = await material.json<FeedEntry>();
  }
  if (!payload.feedEntry) return;
  const item = await ownedItem(env, job.owner_id, job.item_id);
  if (item.generation !== payload.generation)
    throw new ApiError(409, 'stale_generation', 'Feed material belongs to a deleted generation');
  await commitSourceContributions(
    env,
    job,
    job.item_id,
    item.content_id,
    payload.generation,
    feedContributions(payload.feedEntry, payload.feedSourceUrl)
  );
  await stmt(
    env.DB,
    "UPDATE jobs SET payload_json=json_set(payload_json,'$.feedMetadataApplied',json('true')) WHERE id=? AND lease_token=?",
    job.id,
    job.lease_token
  ).run();
  payload.feedMetadataApplied = true;
  job.payload_json = JSON.stringify(payload);
}
async function enrich(env: Env, job: JobRow) {
  if (!job.item_id) throw new ProviderError('job_item_missing', false);
  const itemId = job.item_id;
  const payload = JSON.parse(job.payload_json) as {
    url: string;
    generation: number;
    feedEntry?: FeedEntry;
  };
  const item = await ownedItem(env, job.owner_id, job.item_id);
  if (item.generation !== payload.generation)
    throw new ApiError(409, 'stale_generation', 'Job refers to a deleted item generation');
  const content = await stmt(
    env.DB,
    'SELECT platform,kind FROM content_items WHERE id=?',
    item.content_id
  ).first<{ platform: string; kind: string }>();
  if (!content) throw new ProviderError('content_missing', false);
  const timestamp = now();
  await stmt(
    env.DB,
    `INSERT INTO enrichment_components(content_id,owner_id,component,status,updated_at) VALUES(?,?,'metadata','processing',?)
    ON CONFLICT(content_id,owner_id,component) DO UPDATE SET status='processing',reason_code=NULL,updated_at=excluded.updated_at`,
    item.content_id,
    job.owner_id,
    timestamp
  ).run();
  const commit = (contributions: ContributionInput[]) =>
    commitSourceContributions(env, job, itemId, item.content_id, payload.generation, contributions);
  const contributions: ContributionInput[] = [];
  let components: {
    component: string;
    status: 'available' | 'unavailable';
    reasonCode?: string;
  }[] = [];
  // Provider-specific extractors are independent modules. Until implemented,
  // explicitly fail rather than misreport a generic HTML shell as deep support.
  const extraction =
    content.platform === 'spotify'
      ? await extractSpotify(env, payload.url)
      : content.platform === 'x'
        ? await extractX(env, payload.url)
        : content.platform === 'youtube'
          ? await extractYouTube(env, payload.url, job.owner_id)
          : await extractWeb(payload.url);
  const resolvedIdentity = extraction.verifiedIdentity?.url ?? extraction.resolvedUrl;
  if (resolvedIdentity && (await contentIdentity(resolvedIdentity)).id !== item.content_id) {
    await reconcileVerifiedIdentity(
      env,
      { userId: job.owner_id, contributor: 'zine:identity' },
      itemId,
      resolvedIdentity,
      payload.generation,
      extraction.verifiedIdentity?.method ?? 'http-redirect'
    );
    return;
  }
  contributions.push(...extraction.contributions);
  components = extraction.components;
  await commit(contributions);
  // Direct source/thread links are metadata edges, not additional saves.
  const relationship = async (
    kind: 'part_of' | 'quotes' | 'reply_to' | 'references',
    targetUrl: string,
    field: string,
    method: string
  ) => {
    const target = await personalContentIdentity(env, job.owner_id, targetUrl);
    if (target.content.id === item.content_id) return;
    const inputId = await stmt(
      env.DB,
      "SELECT id FROM contributions WHERE content_id=? AND owner_id=? AND field=? AND contributor='zine:provider' AND json_extract(provenance_json,'$.method')=? ORDER BY created_at,id LIMIT 1",
      item.content_id,
      job.owner_id,
      field,
      method
    ).first<string>('id');
    await addRelationship(
      env,
      { userId: job.owner_id, contributor: 'zine:provider' },
      itemId,
      relationshipSchema.parse({
        kind,
        targetUrl: target.content.url,
        provenance: {
          method: 'source-relationship',
          sourceUrl: payload.url,
          inputContributionIds: inputId ? [inputId] : [],
        },
      }),
      payload.generation
    );
  };
  const parent = contributions.find((value) => value.field === 'source');
  if (parent && parent.value && typeof parent.value === 'object') {
    const source = parent.value as { url?: string; kind?: string; id?: string };
    if (source.url && source.kind !== content.kind)
      await relationship(
        'part_of',
        content.platform === 'x' && source.kind === 'account' && /^\d+$/.test(source.id ?? '')
          ? `https://x.com/i/user/${source.id}`
          : source.url,
        'source',
        parent.provenance.method
      );
  }
  const thread = contributions.find((value) => value.field === 'thread');
  if (content.platform === 'x' && thread?.value && typeof thread.value === 'object') {
    const value = thread.value as {
      selectedId?: string;
      posts?: { id: string; referenced_tweets?: { id: string; type: string }[] }[];
    };
    for (const reference of value.posts
      ?.find((post) => post.id === value.selectedId)
      ?.referenced_tweets?.slice(0, 3) ?? [])
      if (/^\d+$/.test(reference.id))
        await relationship(
          reference.type === 'quoted'
            ? 'quotes'
            : reference.type === 'replied_to'
              ? 'reply_to'
              : 'references',
          `https://x.com/i/status/${reference.id}`,
          'thread',
          thread.provenance.method
        );
  }

  // Component writes are guarded against deleted/re-saved generations as well.
  for (const component of components)
    await stmt(
      env.DB,
      `INSERT INTO enrichment_components(content_id,owner_id,component,status,reason_code,updated_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM personal_items WHERE id=? AND owner_id=? AND status!='deleted' AND generation=?)
    ON CONFLICT(content_id,owner_id,component) DO UPDATE SET status=excluded.status,reason_code=excluded.reason_code,updated_at=excluded.updated_at`,
      item.content_id,
      job.owner_id,
      component.component,
      component.status,
      component.reasonCode ?? null,
      now(),
      job.item_id,
      job.owner_id,
      payload.generation
    ).run();
}

async function transcriptJob(env: Env, job: JobRow) {
  if (!job.item_id) throw new ProviderError('job_item_missing', false);
  const payload = JSON.parse(job.payload_json) as {
    generation: number;
    references: FeedEntry['transcripts'];
  };
  const item = await ownedItem(env, job.owner_id, job.item_id);
  if (item.generation !== payload.generation)
    throw new ApiError(409, 'stale_generation', 'Transcript input was erased');
  const component = async (status: string, reason: string | null = null) => {
    await stmt(
      env.DB,
      `INSERT INTO enrichment_components(content_id,owner_id,component,status,reason_code,updated_at) SELECT content_id,?,'transcript',?,?,? FROM personal_items WHERE id=? AND owner_id=? AND generation=? AND status!='deleted' ON CONFLICT(content_id,owner_id,component) DO UPDATE SET status=excluded.status,reason_code=excluded.reason_code,updated_at=excluded.updated_at`,
      job.owner_id,
      status,
      reason,
      now(),
      job.item_id,
      job.owner_id,
      payload.generation
    ).run();
  };
  await component('processing');
  try {
    const transcript = await publishedTranscript(payload.references);
    const previous = await stmt(
      env.DB,
      "SELECT id FROM contributions WHERE owner_id=? AND content_id=? AND field='transcript' AND contributor='zine:provider' AND json_extract(provenance_json,'$.method')='published-transcript' ORDER BY created_at,id LIMIT 1",
      job.owner_id,
      item.content_id
    ).first<string>('id');
    await contribute(
      env,
      { userId: job.owner_id, contributor: 'zine:provider' },
      job.item_id,
      {
        field: 'transcript',
        value: transcript.value,
        category: 'source',
        provenance: {
          method: 'published-transcript',
          sourceUrl: transcript.url,
          inputContributionIds: [],
        },
      },
      previous ?? undefined,
      payload.generation
    );
    await component('available');
  } catch (error) {
    if (error instanceof ProviderError && !error.retryable) {
      await component('unavailable', error.code);
      return;
    }
    throw error;
  }
}

export async function runJob(env: Env, jobId: string) {
  const timestamp = now();
  const leaseToken = id('lease');
  const leaseUntil = new Date(Date.now() + 5 * 60000).toISOString();
  const claim = await stmt(
    env.DB,
    `UPDATE jobs SET status='running',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?
    WHERE id=? AND ((status='pending' AND available_at<=?) OR (status='running' AND lease_until<?))`,
    leaseToken,
    leaseUntil,
    timestamp,
    jobId,
    timestamp,
    timestamp
  ).run();
  if (!claim.meta.changes) return { claimed: false };
  const job = await stmt(
    env.DB,
    'SELECT * FROM jobs WHERE id=? AND lease_token=?',
    jobId,
    leaseToken
  ).first<JobRow>();
  if (!job) return { claimed: false };
  let scope: string | null = null;
  try {
    await retainFeedMetadata(env, job);
    const metadataOnly =
      job.kind === 'enrich' &&
      !JSON.parse(job.payload_json).stage &&
      JSON.parse(job.payload_json).metadataOnly;
    scope = metadataOnly
      ? null
      : job.kind === 'enrich'
        ? JSON.parse(job.payload_json).stage === 'understanding'
          ? 'workers-ai:understanding'
          : budgetScope((JSON.parse(job.payload_json) as { url: string }).url)
        : job.kind === 'index'
          ? 'workers-ai:embeddings'
          : null;
    if (
      job.kind === 'enrich' &&
      !JSON.parse(job.payload_json).stage &&
      ['provider:youtube:watch', 'provider:youtube:channel'].includes(scope ?? '') &&
      (await hasYouTubeApi(env, job.owner_id))
    )
      scope = 'provider:youtube:api';
    if (job.kind === 'sync') {
      const route = await stmt(
        env.DB,
        'SELECT so.platform,r.url,r.kind FROM subscriptions s JOIN sources so ON so.id=s.source_id JOIN source_routes r ON r.id=s.route_id WHERE s.id=? AND s.owner_id=?',
        (JSON.parse(job.payload_json) as { subscriptionId: string }).subscriptionId,
        job.owner_id
      ).first<{ platform: string; url: string; kind: string }>();
      if (route)
        scope =
          route.platform === 'youtube'
            ? route.kind === 'youtube_feed'
              ? 'provider:youtube:feed'
              : 'provider:youtube:api'
            : ['spotify', 'x'].includes(route.platform)
              ? `provider:${route.platform}`
              : `host:${new URL(route.url).hostname}`;
    }
    if (scope) {
      const budget = await acquireBudget(env, scope, leaseToken);
      if (!budget.acquired) {
        await stmt(
          env.DB,
          "UPDATE jobs SET status='pending',attempts=attempts-1,lease_token=NULL,lease_until=NULL,last_dispatched_at=NULL,available_at=?,updated_at=? WHERE id=? AND lease_token=?",
          budget.availableAt,
          now(),
          jobId,
          leaseToken
        ).run();
        return { claimed: true, status: 'deferred' };
      }
    }
    if (metadataOnly) {
      /* The available source observation is already retained. */
    } else if (job.kind === 'enrich' && JSON.parse(job.payload_json).stage === 'understanding')
      await processUnderstanding(
        env,
        job.owner_id,
        job.item_id!,
        JSON.parse(job.payload_json) as UnderstandingPayload
      );
    else if (job.kind === 'enrich' && JSON.parse(job.payload_json).stage === 'published-transcript')
      await transcriptJob(env, job);
    else if (job.kind === 'enrich') await enrich(env, job);
    else if (job.kind === 'sync')
      await syncSubscription(
        env,
        (JSON.parse(job.payload_json) as { subscriptionId: string }).subscriptionId,
        job.owner_id
      );
    else if (job.kind === 'index') {
      const complete = await indexItem(env, job.owner_id, job.item_id!);
      if (!complete) {
        const timestamp = now();
        await stmt(
          env.DB,
          `INSERT INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) SELECT ?,?,?,'index','{}','pending',?,?,? WHERE EXISTS(SELECT 1 FROM personal_items WHERE id=? AND owner_id=? AND status!='deleted')`,
          id('job'),
          job.owner_id,
          job.item_id!,
          timestamp,
          timestamp,
          timestamp,
          job.item_id!,
          job.owner_id
        ).run();
      }
    } else throw new ProviderError('job_kind_not_implemented', false);
    await stmt(
      env.DB,
      "UPDATE jobs SET status='succeeded',lease_token=NULL,lease_until=NULL,last_error_code=NULL,updated_at=? WHERE id=? AND lease_token=?",
      now(),
      jobId,
      leaseToken
    ).run();
    if (scope) await releaseBudget(env, scope, leaseToken);
    return { claimed: true, status: 'succeeded' };
  } catch (error) {
    const cancelled =
      error instanceof ApiError &&
      [
        'not_found',
        'stale_generation',
        'account_data_erased',
        'identity_changed',
        'subscription_changed',
      ].includes(error.code);
    const code =
      error instanceof ProviderError || error instanceof ApiError ? error.code : 'processing_error';
    if (scope)
      await releaseBudget(
        env,
        scope,
        leaseToken,
        code === 'rate_limited' && error instanceof ProviderError
          ? error.retryAfterSeconds
          : undefined
      );
    const retryable =
      error instanceof ProviderError ? error.retryable : !(error instanceof ApiError);
    const status = cancelled ? 'cancelled' : retryable && job.attempts < 6 ? 'pending' : 'failed';
    const delay =
      error instanceof ProviderError
        ? Math.max(error.retryAfterSeconds, Math.min(3600, 15 * 2 ** job.attempts))
        : Math.min(3600, 15 * 2 ** job.attempts);
    await stmt(
      env.DB,
      'UPDATE jobs SET status=?,lease_token=NULL,lease_until=NULL,last_error_code=?,available_at=?,updated_at=? WHERE id=? AND lease_token=?',
      status,
      code,
      new Date(Date.now() + delay * 1000).toISOString(),
      now(),
      jobId,
      leaseToken
    ).run();
    if (job.item_id && !cancelled)
      await stmt(
        env.DB,
        `UPDATE enrichment_components SET status='failed',reason_code=?,updated_at=? WHERE owner_id=? AND content_id=(SELECT content_id FROM personal_items WHERE id=? AND status!='deleted') AND status='processing'`,
        code,
        now(),
        job.owner_id,
        job.item_id
      ).run();
    if (job.kind === 'sync' && !cancelled)
      await stmt(
        env.DB,
        'UPDATE subscriptions SET last_error_code=?,next_poll_at=?,updated_at=? WHERE id=? AND owner_id=?',
        code,
        new Date(Date.now() + delay * 1000).toISOString(),
        now(),
        (JSON.parse(job.payload_json) as { subscriptionId: string }).subscriptionId,
        job.owner_id
      ).run();
    console.warn(
      JSON.stringify({
        event: 'job_attempt_failed',
        jobId,
        code,
        status,
        attempt: job.attempts,
        ...(code === 'processing_error' ? { diagnostic: diagnostic(error) } : {}),
      })
    );
    return { claimed: true, status, code };
  }
}

/** A queue outage leaves the database job pending; a future cron retries it. */
export async function dispatchOutbox(env: Env, owner?: string) {
  const timestamp = now();
  // Select each AI scope independently so a full indexing backlog cannot hide
  // understanding work behind the general delivery limit.
  const due = await all<{ id: string; kind: string; stage: string | null }>(
    env.DB,
    `WITH eligible AS (
      SELECT id,kind,json_extract(payload_json,'$.stage') AS stage,created_at,available_at,
        CASE WHEN kind='index' THEN 'index' WHEN kind='enrich' AND json_extract(payload_json,'$.stage')='understanding' THEN 'understanding' ELSE NULL END AS ai_scope
      FROM jobs WHERE ((status='pending' AND available_at<=?) OR (status='running' AND lease_until<?))
      AND (last_dispatched_at IS NULL OR last_dispatched_at<?) ${owner ? 'AND owner_id=?' : ''}
    ), ranked AS (
      SELECT *,ROW_NUMBER() OVER(PARTITION BY ai_scope ORDER BY CASE WHEN ai_scope IS NOT NULL THEN created_at END DESC,available_at,id) AS scope_rank FROM eligible
    ) SELECT id,kind,stage FROM ranked WHERE (ai_scope IS NULL AND scope_rank<=100) OR (ai_scope IS NOT NULL AND scope_rank=1)
      ORDER BY CASE WHEN kind='enrich' AND stage IS NULL THEN 0 WHEN kind='sync' THEN 1 WHEN stage='published-transcript' THEN 2 WHEN kind='index' THEN 3 ELSE 4 END,available_at,id`,
    timestamp,
    timestamp,
    new Date(Date.now() - 60000).toISOString(),
    ...(owner ? [owner] : [])
  );
  // Keep only one queued/running job per global AI budget. Without this,
  // a corpus backfill would flood the queue with messages that can only defer.
  const activeAI = await all<{ scope: string }>(
    env.DB,
    `SELECT DISTINCT CASE WHEN kind='index' THEN 'index' ELSE 'understanding' END AS scope FROM jobs WHERE (kind='index' OR (kind='enrich' AND json_extract(payload_json,'$.stage')='understanding')) AND ((status='running' AND lease_until>?) OR (status='pending' AND last_dispatched_at>?))`,
    timestamp,
    new Date(Date.now() - 60000).toISOString()
  );
  const occupied = new Set(activeAI.map((row) => row.scope));
  let sent = 0;
  for (const job of due) {
    const aiScope =
      job.kind === 'index' ? 'index' : job.stage === 'understanding' ? 'understanding' : null;
    if (aiScope && occupied.has(aiScope)) continue;
    const claimed = await stmt(
      env.DB,
      'UPDATE jobs SET last_dispatched_at=? WHERE id=? AND (last_dispatched_at IS NULL OR last_dispatched_at<?)',
      timestamp,
      job.id,
      new Date(Date.now() - 60000).toISOString()
    ).run();
    if (!claimed.meta.changes) continue;
    if (aiScope) occupied.add(aiScope);
    try {
      await env.JOBS.send({ jobId: job.id });
      sent++;
    } catch {
      await stmt(
        env.DB,
        'UPDATE jobs SET last_dispatched_at=NULL WHERE id=? AND last_dispatched_at=?',
        job.id,
        timestamp
      ).run();
      console.warn(JSON.stringify({ event: 'outbox_delivery_failed', jobId: job.id }));
    }
  }
  return { due: due.length, sent };
}

export async function scheduleSubscriptions(env: Env) {
  const timestamp = now();
  const due = await all<{ id: string; owner_id: string }>(
    env.DB,
    "SELECT id,owner_id FROM subscriptions WHERE status='active' AND next_poll_at<=? ORDER BY next_poll_at,id LIMIT 50",
    timestamp
  );
  for (const subscription of due) {
    // Stable per polling window prevents concurrent cron events creating the
    // same job. A second pending/running job for a source is not scheduled.
    const jobId = `job_sync_${subscription.id}_${Math.floor(Date.now() / 300000)}`;
    await stmt(
      env.DB,
      `INSERT OR IGNORE INTO jobs(id,owner_id,kind,payload_json,status,available_at,created_at,updated_at)
      SELECT ?,?,'sync',?,'pending',?,?,? WHERE NOT EXISTS(SELECT 1 FROM jobs WHERE owner_id=? AND kind='sync' AND json_extract(payload_json,'$.subscriptionId')=? AND status IN ('pending','running'))`,
      jobId,
      subscription.owner_id,
      JSON.stringify({ subscriptionId: subscription.id }),
      timestamp,
      timestamp,
      timestamp,
      subscription.owner_id,
      subscription.id
    ).run();
  }
}

export async function queue(batch: MessageBatch<{ jobId: string }>, env: Env) {
  for (const message of batch.messages) {
    try {
      await runJob(env, message.body.jobId);
      message.ack();
    } catch {
      message.retry({ delaySeconds: 60 });
      console.error(JSON.stringify({ event: 'job_dispatch_failed', jobId: message.body.jobId }));
    }
  }
  await scheduleUnderstanding(env);
  await scheduleIndexes(env);
  await dispatchOutbox(env);
}

export async function scheduleIndexes(env: Env, owner?: string) {
  if (!env.VECTORS) return;
  const dirty = await all<{ item_id: string; owner_id: string; requested_revision: number }>(
    env.DB,
    `SELECT r.item_id,p.owner_id,r.requested_revision FROM index_requests r JOIN personal_items p ON p.id=r.item_id WHERE r.requested_revision>r.indexed_revision
    ${owner ? 'AND p.owner_id=?' : ''} AND NOT EXISTS(SELECT 1 FROM jobs j WHERE j.item_id=r.item_id AND j.kind='index' AND j.status IN ('pending','running')) LIMIT 100`,
    ...(owner ? [owner] : [])
  );
  for (const row of dirty) {
    const timestamp = now();
    await stmt(
      env.DB,
      "INSERT OR IGNORE INTO jobs(id,owner_id,item_id,kind,payload_json,status,available_at,created_at,updated_at) VALUES(?,?,?,'index','{}','pending',?,?,?)",
      `job_index_${row.item_id}_${row.requested_revision}`,
      row.owner_id,
      row.item_id,
      timestamp,
      timestamp,
      timestamp
    ).run();
  }
}

export async function scheduled(_event: ScheduledController, env: Env) {
  if (env.VECTORS) {
    const vectors = await all<{ vector_id: string }>(
      env.DB,
      'SELECT vector_id FROM vector_garbage LIMIT 100'
    );
    if (vectors.length) {
      await env.VECTORS.deleteByIds(vectors.map((v) => v.vector_id));
      await env.DB.batch(
        vectors.map((v) =>
          stmt(env.DB, 'DELETE FROM vector_garbage WHERE vector_id=?', v.vector_id)
        )
      );
    }
  }
  // Retain unreferenced checkpoints for one hour to cover in-flight R2 writes.
  const snapshots = await all<{ artifact_key: string }>(
    env.DB,
    `SELECT p.artifact_key FROM subscription_snapshots p LEFT JOIN subscriptions s ON s.id=p.subscription_id WHERE p.created_at<? AND (s.cursor_json IS NULL OR json_extract(s.cursor_json,'$.stateKey')!=p.artifact_key) AND NOT EXISTS(SELECT 1 FROM jobs j JOIN personal_items i ON i.id=j.item_id WHERE j.owner_id=i.owner_id AND i.status!='deleted' AND i.generation=json_extract(j.payload_json,'$.generation') AND j.status IN ('pending','running','failed') AND COALESCE(json_extract(j.payload_json,'$.feedMetadataApplied'),0)=0 AND json_extract(j.payload_json,'$.feedEntryArtifactKey')=p.artifact_key) LIMIT 100`,
    new Date(Date.now() - 3600000).toISOString()
  );
  for (const snapshot of snapshots) {
    await env.ARTIFACTS.delete(snapshot.artifact_key);
    await stmt(
      env.DB,
      'DELETE FROM subscription_snapshots WHERE artifact_key=?',
      snapshot.artifact_key
    ).run();
  }
  const understandingGarbage = await all<{ artifact_key: string }>(
    env.DB,
    `SELECT a.artifact_key FROM understanding_artifacts a WHERE a.created_at<? AND NOT EXISTS(SELECT 1 FROM understanding_runs r WHERE r.state_key=a.artifact_key AND r.status='processing') LIMIT 100`,
    new Date(Date.now() - 3600000).toISOString()
  );
  for (const artifact of understandingGarbage) {
    await env.ARTIFACTS.delete(artifact.artifact_key);
    await stmt(
      env.DB,
      'DELETE FROM understanding_artifacts WHERE artifact_key=?',
      artifact.artifact_key
    ).run();
  }
  await collectMaterialArtifacts(env);
  await scheduleSubscriptions(env);
  await scheduleUnderstanding(env);
  await scheduleIndexes(env);
  await stmt(env.DB, 'DELETE FROM search_sessions WHERE expires_at<?', now()).run();
  await dispatchOutbox(env);
}

/** Quarantine uncertain uploads; a database acknowledgement failure may follow a successful commit. */
export async function collectMaterialArtifacts(env: Env) {
  const cutoff = new Date(Date.now() - 3600000).toISOString();
  await stmt(
    env.DB,
    `INSERT OR IGNORE INTO artifact_garbage(artifact_key,created_at)
    SELECT a.artifact_key,a.created_at FROM material_artifacts a WHERE a.created_at<?
    AND NOT EXISTS(SELECT 1 FROM contributions d WHERE d.artifact_key=a.artifact_key) LIMIT 100`,
    cutoff
  ).run();
  const garbage = await all<{ artifact_key: string }>(
    env.DB,
    'SELECT artifact_key FROM artifact_garbage WHERE created_at<? ORDER BY created_at LIMIT 100',
    cutoff
  );
  for (const artifact of garbage) {
    const key = artifact.artifact_key;
    const live = await stmt(
      env.DB,
      `SELECT 1 AS alive WHERE
      EXISTS(SELECT 1 FROM contributions WHERE artifact_key=?) OR
      EXISTS(SELECT 1 FROM understanding_runs WHERE state_key=? AND status='processing') OR
      EXISTS(SELECT 1 FROM subscriptions WHERE json_extract(cursor_json,'$.stateKey')=?) OR
      EXISTS(SELECT 1 FROM jobs j JOIN personal_items i ON i.id=j.item_id
        WHERE j.owner_id=i.owner_id AND i.status!='deleted' AND i.generation=json_extract(j.payload_json,'$.generation')
        AND j.status IN ('pending','running','failed') AND COALESCE(json_extract(j.payload_json,'$.feedMetadataApplied'),0)=0
        AND json_extract(j.payload_json,'$.feedEntryArtifactKey')=?)`,
      key,
      key,
      key,
      key
    ).first();
    if (!live) {
      await env.ARTIFACTS.delete(key);
      await env.DB.batch([
        stmt(env.DB, 'DELETE FROM material_artifacts WHERE artifact_key=?', key),
        stmt(env.DB, 'DELETE FROM subscription_snapshots WHERE artifact_key=?', key),
        stmt(env.DB, 'DELETE FROM understanding_artifacts WHERE artifact_key=?', key),
      ]);
    }
    await stmt(env.DB, 'DELETE FROM artifact_garbage WHERE artifact_key=?', key).run();
  }
}
