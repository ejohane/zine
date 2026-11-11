import { z } from 'zod4';
import { tokenInputSchema } from './access';
import { tokenScopes } from './permissions';
import { alertSchema } from './operations';
import { eventSchema, webhookSchema, webhookInputSchema, webhookPatchSchema } from './events';
import { googleCredentialSchema } from './connections';
import { saveSchema, patchItemSchema, progressSchema } from './items';
import { searchSchema } from './query';
import {
  contextSchema,
  annotationSchema,
  collectionSchema,
  collectionNoteSchema,
} from './personal';
import { contributionSchema, fieldValueSchemas } from './enrichment';
import { subscribeSchema, subscriptionFiltersSchema } from './subscriptions';
import { relationshipSchema, relationshipUpdateSchema } from './relationships';
import { reconciliationSchema } from './reconciliation';

type Json = Record<string, unknown>;
const nullableString = z.string().nullable();
const context = z.object({
  id: z.string(),
  text: z.string(),
  origin: z.enum(['explicit', 'experience', 'inferred']),
  contributor: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
const progress = z.object({
  position: z.number().nullable(),
  unit: nullableString,
  completedAt: nullableString,
  updatedAt: nullableString.optional(),
});
const item = z.object({
  id: z.string(),
  status: z.enum(['saved', 'received', 'dismissed']),
  archived: z.boolean(),
  createdAt: z.string(),
  savedAt: nullableString,
  updatedAt: z.string(),
  revision: z.number().int(),
  content: z
    .object({
      id: z.string(),
      url: z.string(),
      platform: z.string(),
      type: z.string(),
      title: z.string().optional(),
      creatorImageUrl: z.url().optional(),
      description: z.string().optional(),
      summary: z.string().optional(),
      durationSeconds: z.number().optional(),
    })
    .passthrough(),
  context: z.array(context),
  tags: z.array(z.string()),
  collectionIds: z.array(z.string()),
  progress,
  enrichment: z.object({
    fields: z.record(z.string(), z.unknown()),
    components: z.array(
      z.object({
        component: z.string(),
        status: z.enum(['pending', 'processing', 'available', 'unavailable', 'failed']),
        reasonCode: nullableString,
      })
    ),
  }),
  occurrences: z.array(
    z.object({
      id: z.string(),
      route: z.string(),
      contributor: z.string(),
      subscriptionId: nullableString,
      createdAt: z.string(),
    })
  ),
});
const receipt = z.object({
  item: z.object({
    id: z.string(),
    contentId: z.string(),
    status: z.literal('saved'),
    archived: z.literal(false),
    url: z.string(),
  }),
  save: z.object({ id: z.string(), outcome: z.enum(['created', 'already_saved', 'reactivated']) }),
  enrichment: z.object({ status: z.enum(['pending', 'processing', 'available']) }),
});
const match = z
  .object({
    field: z.string(),
    excerpt: z.string(),
    contributionId: nullableString.optional(),
    matchedBy: z.array(z.string()).optional(),
    startSeconds: z.number().optional(),
    endSeconds: z.number().optional(),
  })
  .passthrough();
const annotation = annotationSchema.safeExtend({
  id: z.string(),
  contributor: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
const collection = collectionSchema.extend({
  id: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  notes: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        itemIds: z.array(z.string()),
        contributor: z.string().optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
      })
    )
    .optional(),
});
const source = z.object({
  id: z.string(),
  url: z.string(),
  name: nullableString,
  platform: z.string().optional(),
  createdAt: z.string().optional(),
  routes: z
    .array(
      z.object({ id: z.string(), url: z.string(), kind: z.string(), name: z.string().optional() })
    )
    .optional(),
});
const subscription = z.object({
  id: z.string(),
  sourceId: z.string(),
  routeId: z.string(),
  autoSave: z.boolean(),
  filters: subscriptionFiltersSchema,
  status: z.enum(['active', 'unsubscribed']),
  initialized: z.boolean(),
  nextPollAt: z.string(),
  lastSuccessAt: nullableString,
  lastErrorCode: nullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
});
const job = z.object({
  id: z.string(),
  kind: z.enum(['enrich', 'sync', 'index']),
  status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled']),
  attempts: z.number().int(),
  errorCode: nullableString,
  createdAt: z.string(),
  updatedAt: z.string(),
  itemId: nullableString.optional(),
  availableAt: z.string().optional(),
});
const pending = z.object({ jobId: z.string(), status: z.string() });
const material = z.object({ field: z.string(), value: z.unknown(), provenance: z.unknown() });

const schemaSources: Record<string, z.ZodType> = {
  SaveInput: saveSchema,
  SaveReceipt: receipt,
  Item: item,
  ItemPatch: patchItemSchema,
  ItemPatchResult: z.object({ id: z.string(), status: z.string(), archived: z.boolean() }),
  ItemList: z.object({ items: z.array(item), nextCursor: nullableString }),
  SearchInput: searchSchema,
  SearchResult: z.object({
    items: z.array(item.extend({ matches: z.array(match), score: z.number().optional() })),
    nextCursor: nullableString,
    resultWindow: z.number().optional(),
    index: z.object({ pendingItems: z.number(), eventuallyConsistent: z.boolean() }).optional(),
  }),
  ContextInput: contextSchema,
  ContextPatch: contextSchema.pick({ text: true }),
  Context: context,
  ContextPatchResult: context.pick({ id: true, text: true, updatedAt: true }),
  ContextList: z.object({ entries: z.array(context) }),
  ProgressInput: progressSchema,
  Progress: progress,
  AnnotationInput: annotationSchema,
  Annotation: annotation,
  AnnotationList: z.object({
    annotations: z.array(
      z.object({
        id: z.string(),
        kind: z.enum(['note', 'highlight', 'timestamp']),
        text: nullableString,
        anchor: z.unknown(),
        contributor: z.string(),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
    ),
  }),
  CollectionInput: collectionSchema,
  CollectionPatch: collectionSchema.partial(),
  Collection: collection,
  CollectionList: z.object({ collections: z.array(collection), nextCursor: nullableString }),
  CollectionMembershipInput: z
    .object({ position: z.number().finite().min(-1e9).max(1e9).optional() })
    .strict(),
  Membership: z.object({ collectionId: z.string(), itemId: z.string() }),
  OrderedItems: z.object({
    items: z.array(z.object({ position: z.number(), item })),
    nextCursor: nullableString,
  }),
  CollectionNoteInput: collectionNoteSchema,
  CollectionNote: collectionNoteSchema.extend({ id: z.string(), createdAt: z.string().optional() }),
  ContributionInput: contributionSchema,
  ContributionReceipt: z.object({
    id: z.string(),
    field: z.string(),
    category: z.string(),
    provenance: z.unknown(),
    contributor: z.string(),
    visibility: z.literal('private'),
    updatedAt: z.string(),
  }),
  Contribution: material.extend({ id: z.string(), category: z.string(), contributor: z.string() }),
  ContributionList: z.object({
    contributions: z.array(
      z.object({
        id: z.string(),
        field: z.string(),
        category: z.string(),
        contributor: z.string(),
        visibility: z.enum(['private', 'public']),
        provenance: z.unknown(),
        value: z.unknown().optional(),
        artifactAvailable: z.boolean(),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
    ),
  }),
  Material: material,
  ReconciliationInput: reconciliationSchema,
  ReconciliationResult: z.object({
    outcome: z.enum(['merged', 'unchanged', 'suppressed']),
    sourceItemId: z.string(),
    canonicalItemId: z.string(),
    eventId: nullableString,
  }),
  IdentityAliases: z.object({
    canonicalItemId: z.string(),
    contentId: z.string(),
    aliases: z.array(
      z.object({
        itemId: z.string(),
        contentId: z.string(),
        url: z.string(),
        createdAt: z.string(),
      })
    ),
    nextCursor: nullableString,
  }),
  ReconciliationEvents: z.object({
    events: z.array(
      z.object({
        id: z.string(),
        sourceItemId: z.string(),
        targetItemId: z.string(),
        contributor: z.string(),
        evidence: z.object({
          method: z.enum(['http-redirect', 'platform-identifier']),
          sourceUrl: z.string(),
          finalUrl: z.string(),
          observedAt: z.string(),
        }),
        state: z.object({
          originalSourceItemId: z.string(),
          originalTargetItemId: z.string(),
          source: z.unknown(),
          target: z.unknown(),
          lifecycleResolution: z.enum(['source_explicit_or_new', 'existing_target']),
          progress: z.unknown(),
          collectionPositionConflicts: z.array(z.unknown()),
          collapsedRelationships: z.array(z.unknown()),
        }),
        createdAt: z.string(),
      })
    ),
    nextCursor: nullableString,
  }),
  RelationshipInput: relationshipSchema,
  RelationshipUpdate: relationshipUpdateSchema,
  RelationshipCreated: z.object({
    id: z.string(),
    sourceItemId: z.string(),
    targetContentId: z.string(),
    kind: z.string(),
    created: z.boolean(),
  }),
  RelationshipUpdated: z.object({
    id: z.string(),
    provenance: contributionSchema.shape.provenance,
  }),
  RelationshipList: z.object({
    relationships: z.array(
      z.object({
        id: z.string(),
        kind: z.string(),
        direction: z.enum(['outgoing', 'incoming']),
        source: z.object({ itemId: z.string(), url: z.string() }),
        target: z.object({
          itemId: nullableString,
          contentId: z.string(),
          url: z.string(),
          platform: z.string(),
          type: z.string(),
        }),
        contributor: z.string(),
        provenance: contributionSchema.shape.provenance,
        createdAt: z.string(),
        updatedAt: z.string(),
      })
    ),
    nextCursor: nullableString,
  }),
  SourceResolveInput: z.object({ url: z.string().url().max(8192) }).strict(),
  Source: source,
  SourceList: z.object({ sources: z.array(source), nextCursor: nullableString }),
  SubscriptionInput: subscribeSchema,
  Subscription: subscription,
  SubscriptionCreated: subscribeSchema.extend({
    id: z.string(),
    status: z.literal('active'),
    jobId: z.string(),
  }),
  SubscriptionList: z.object({ subscriptions: z.array(subscription), nextCursor: nullableString }),
  SubscriptionPatch: z
    .object({
      autoSave: z.boolean().optional(),
      filters: subscriptionFiltersSchema.optional(),
      status: z.enum(['active', 'unsubscribed']).optional(),
    })
    .strict(),
  Job: job,
  JobList: z.object({ jobs: z.array(job) }),
  Pending: pending,
  TokenInput: tokenInputSchema,
  TokenCreated: z.object({
    id: z.string(),
    name: z.string(),
    token: z.string(),
    scopes: z.array(z.enum(tokenScopes)),
    expiresAt: z.string(),
    createdAt: z.string(),
  }),
  TokenList: z.object({
    tokens: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        expiresAt: z.string(),
        revokedAt: nullableString,
        createdAt: z.string(),
        lastUsedAt: nullableString,
        scopes: z.array(z.enum(tokenScopes)),
      })
    ),
  }),
  MemberPage: z.object({
    items: z.array(z.unknown()),
    total: z.number().nullable(),
    nextCursor: nullableString,
    consistency: z.enum(['live', 'retained']),
    complete: z.boolean(),
  }),
  ExportManifest: z.object({
    schemaVersion: z.literal(1),
    consistency: z.literal('live'),
    sections: z.array(z.string()),
    credentialsIncluded: z.literal(false),
    description: z.string(),
  }),
  ExportPage: z.object({
    schemaVersion: z.literal(1),
    consistency: z.literal('live'),
    section: z.string(),
    records: z.array(z.record(z.string(), z.unknown())),
    nextCursor: nullableString,
  }),
  DataErased: z.object({
    authoritativeDataDeleted: z.literal(true),
    derivedArtifactCleanup: z.literal('queued'),
    erasedAt: z.string(),
  }),
  GoogleCredentialInput: googleCredentialSchema,
  ConnectionResult: z.object({ provider: z.literal('google'), status: z.literal('active') }),
  ConnectionList: z.object({
    connections: z.array(
      z.object({
        provider: z.literal('google'),
        status: z.enum(['active', 'reauthorization_required']),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
    ),
  }),
  EventPage: z.object({
    events: z.array(eventSchema),
    nextCursor: z.string(),
    hasMore: z.boolean(),
    retentionDays: z.number(),
  }),
  WebhookInput: webhookInputSchema,
  WebhookPatch: webhookPatchSchema,
  Webhook: webhookSchema,
  WebhookCreated: webhookSchema.extend({
    secret: z
      .string()
      .meta({ format: 'password', description: 'Signing secret shown only on creation' }),
  }),
  WebhookList: z.object({ webhooks: z.array(webhookSchema) }),
  WebhookDeliveries: z.object({
    deliveries: z.array(
      z.object({
        id: z.string(),
        eventSequence: z.number(),
        status: z.string(),
        attempts: z.number(),
        availableAt: z.string(),
        httpStatus: z.number().nullable(),
        errorCode: z.string().nullable(),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
    ),
    nextCursor: z.string().nullable(),
  }),
  WebhookDispatch: z.object({ accepted: z.literal(true), candidates: z.number().int() }),
  DeliveryRetry: z.object({ queued: z.literal(true) }),
  IndexRebuild: z.object({ queued: z.literal(true), items: z.number().int() }),
  OperationalStatus: z.object({
    indexing: z.object({ total: z.number().int(), dirty: z.number().int() }),
    observedAt: z.string(),
    deploymentId: z.string(),
    environment: z.string(),
    jobs: z.record(z.string(), z.unknown()),
    subscriptions: z.record(z.string(), z.unknown()),
    cron: z.record(z.string(), z.unknown()),
    conditions: z.record(z.string(), z.boolean()),
    usage: z.record(z.string(), z.unknown()),
    scope: z.string(),
  }),
  Usage: z.object({
    policy: z.record(z.string(), z.number()),
    windows: z.array(
      z.object({
        metric: z.string(),
        subject: z.string(),
        windowStart: z.string(),
        resetAt: z.string(),
        used: z.number(),
        limit: z.number(),
      })
    ),
    accounting: z.string(),
    retention: z.string(),
  }),
  OperationalAlerts: z.object({ alerts: z.array(alertSchema) }),
  OperationalCheck: z.object({
    status: z.record(z.string(), z.unknown()),
    alerts: z.array(alertSchema),
  }),
  Health: z.object({
    service: z.literal('zine-api'),
    releaseSha: z.string(),
    status: z.literal('ok'),
    version: z.string(),
    deploymentId: z.string(),
  }),
  Me: z.object({
    id: z.string(),
    contributor: z.string(),
    scopes: z.array(z.enum(tokenScopes)).nullable(),
  }),
  Error: z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string().optional(),
      details: z.unknown().optional(),
      retryable: z.boolean().optional(),
    }),
  }),
};
for (const [name, schema] of Object.entries(fieldValueSchemas))
  if (schema) schemaSources[`Field_${name}`] = schema;

interface Operation {
  method: string;
  path: string;
  summary: string;
  input?: string;
  output?: string;
  status?: number;
  query?: { name: string; schema: Json; description?: string }[];
}
const operations: Operation[] = [];
const op = (
  method: string,
  path: string,
  summary: string,
  input?: string,
  output?: string,
  status = 200
) => {
  const value: Operation = { method, path, summary, input, output, status };
  operations.push(value);
  return value;
};
const p = '/v1';
op(
  'get',
  '/health',
  'Check database connectivity and identify the serving Worker version',
  undefined,
  'Health'
);
op('get', `${p}/me`, 'Authenticated identity', undefined, 'Me');
op(
  'post',
  `${p}/ops/index/rebuild`,
  'Rebuild owner search vectors from authoritative retained material',
  undefined,
  'IndexRebuild',
  202
);
op(
  'post',
  `${p}/webhooks/{hookId}/dispatch`,
  'Dispatch up to five due deliveries; normal retry timing applies',
  undefined,
  'WebhookDispatch',
  202
);
op(
  'get',
  `${p}/events`,
  'Replay owner change events within 30-day retention',
  undefined,
  'EventPage'
);
op(
  'post',
  `${p}/webhooks`,
  'Create signed webhook; signing secret is revealed once',
  'WebhookInput',
  'WebhookCreated',
  201
);
op('get', `${p}/webhooks`, 'List owned webhook metadata', undefined, 'WebhookList');
op(
  'patch',
  `${p}/webhooks/{hookId}`,
  'Enable or disable delivery; pending work is cancelled',
  'WebhookPatch',
  'Webhook'
);
op(
  'delete',
  `${p}/webhooks/{hookId}`,
  'Remove webhook and its deliveries',
  undefined,
  undefined,
  204
);
op(
  'get',
  `${p}/webhooks/{hookId}/deliveries`,
  'Page owned delivery status',
  undefined,
  'WebhookDeliveries'
);
op(
  'post',
  `${p}/webhooks/{hookId}/deliveries/{deliveryId}/retry`,
  'Retry a failed owned delivery',
  undefined,
  'DeliveryRetry'
);

op(
  'get',
  `${p}/ops/status`,
  'Owner queue, subscriptions, usage and shared cron status',
  undefined,
  'OperationalStatus'
);
op('get', `${p}/ops/usage`, 'Current owner and caller usage windows', undefined, 'Usage');
op('get', `${p}/ops/alerts`, 'Durable owner alert lifecycle', undefined, 'OperationalAlerts');
op('post', `${p}/ops/check`, 'Evaluate and persist owner alerts', undefined, 'OperationalCheck');
op(
  'post',
  `${p}/saves`,
  'Durably save a reference; safe retries use Idempotency-Key',
  'SaveInput',
  'SaveReceipt',
  201
);
const browse = op(
  'get',
  `${p}/items`,
  'Browse and filter personal items; defaults to all saved items including archived',
  undefined,
  'ItemList'
);
op(
  'post',
  `${p}/items/search`,
  'Keyword, semantic or hybrid retrieval with accessible evidence',
  'SearchInput',
  'SearchResult'
);
op(
  'get',
  `${p}/items/{itemId}`,
  'Retrieve personal state and accessible content information',
  undefined,
  'Item'
);
op(
  'patch',
  `${p}/items/{itemId}`,
  'Change lifecycle, archive state or tags',
  'ItemPatch',
  'ItemPatchResult'
);
op(
  'delete',
  `${p}/items/{itemId}`,
  'Remove personal data and retain automatic-ingestion suppression',
  undefined,
  undefined,
  204
);
op(
  'patch',
  `${p}/items/{itemId}/progress`,
  'Update position and completion independently',
  'ProgressInput',
  'Progress'
);
op(
  'post',
  `${p}/items/{itemId}/relationships`,
  'Record a private relationship without merging or automatically saving the target',
  'RelationshipInput',
  'RelationshipCreated',
  201
);
op(
  'get',
  `${p}/items/{itemId}/relationships`,
  'Page incoming and outgoing private content relationships',
  undefined,
  'RelationshipList'
);
op(
  'patch',
  `${p}/items/{itemId}/relationships/{relationshipId}`,
  'Replace the provenance of your own relationship contribution',
  'RelationshipUpdate',
  'RelationshipUpdated'
);
op(
  'delete',
  `${p}/items/{itemId}/relationships/{relationshipId}`,
  'Remove an owned relationship',
  undefined,
  undefined,
  204
);
op(
  'post',
  `${p}/items/{itemId}/reconcile`,
  'Verify redirect or platform identity before privately reconciling duplicates; conflicting observations remain inspectable',
  'ReconciliationInput',
  'ReconciliationResult'
);
op(
  'get',
  `${p}/items/{itemId}/identity`,
  'Page private aliases that resolve to this canonical personal item',
  undefined,
  'IdentityAliases'
);
op(
  'get',
  `${p}/items/{itemId}/reconciliations`,
  'Page retained private reconciliation evidence and state-resolution receipts',
  undefined,
  'ReconciliationEvents'
);
for (const field of ['transcript', 'article', 'thread'])
  op(
    'get',
    `${p}/items/{itemId}/${field}`,
    `Retrieve accessible ${field}; distinguish pending, failed and unavailable`,
    undefined,
    'Material'
  );
op(
  'get',
  `${p}/items/{itemId}/context`,
  'List accumulated personal context',
  undefined,
  'ContextList'
);
op(
  'post',
  `${p}/items/{itemId}/context`,
  'Append personal context',
  'ContextInput',
  'Context',
  201
);
op(
  'patch',
  `${p}/items/{itemId}/context/{entryId}`,
  'Edit personal context',
  'ContextPatch',
  'ContextPatchResult'
);
op(
  'delete',
  `${p}/items/{itemId}/context/{entryId}`,
  'Remove personal context',
  undefined,
  undefined,
  204
);
op(
  'get',
  `${p}/items/{itemId}/annotations`,
  'List notes, text highlights and timestamp annotations',
  undefined,
  'AnnotationList'
);
op(
  'post',
  `${p}/items/{itemId}/annotations`,
  'Add an annotation',
  'AnnotationInput',
  'Annotation',
  201
);
op(
  'patch',
  `${p}/items/{itemId}/annotations/{annotationId}`,
  'Replace an annotation',
  'AnnotationInput',
  'Annotation'
);
op(
  'delete',
  `${p}/items/{itemId}/annotations/{annotationId}`,
  'Remove an annotation',
  undefined,
  undefined,
  204
);
op('get', `${p}/collections`, 'List personal collections', undefined, 'CollectionList');
op(
  'post',
  `${p}/collections`,
  'Create a personal collection',
  'CollectionInput',
  'Collection',
  201
);
op(
  'get',
  `${p}/collections/{collectionId}`,
  'Retrieve a collection and its notes',
  undefined,
  'Collection'
);
op(
  'patch',
  `${p}/collections/{collectionId}`,
  'Update collection name or description',
  'CollectionPatch',
  'Collection'
);
op(
  'delete',
  `${p}/collections/{collectionId}`,
  'Delete a collection while retaining its library items',
  undefined,
  undefined,
  204
);
op(
  'get',
  `${p}/collections/{collectionId}/items`,
  'Retrieve collection members in explicit order',
  undefined,
  'OrderedItems'
);
op(
  'put',
  `${p}/collections/{collectionId}/items/{itemId}`,
  'Add or reposition a saved item',
  'CollectionMembershipInput',
  'Membership'
);
op(
  'delete',
  `${p}/collections/{collectionId}/items/{itemId}`,
  'Remove membership without deleting the item',
  undefined,
  undefined,
  204
);
op(
  'post',
  `${p}/collections/{collectionId}/notes`,
  'Add collection context or synthesis with supporting item references',
  'CollectionNoteInput',
  'CollectionNote',
  201
);
op(
  'patch',
  `${p}/collections/{collectionId}/notes/{noteId}`,
  'Replace collection context or synthesis',
  'CollectionNoteInput',
  'CollectionNote'
);
op(
  'delete',
  `${p}/collections/{collectionId}/notes/{noteId}`,
  'Delete a collection note',
  undefined,
  undefined,
  204
);
op(
  'get',
  `${p}/items/{itemId}/enrichment`,
  'List visible contributions and their origins',
  undefined,
  'ContributionList'
);
op(
  'post',
  `${p}/items/{itemId}/enrichment`,
  'Contribute private information with provenance',
  'ContributionInput',
  'ContributionReceipt',
  201
);
op(
  'put',
  `${p}/items/{itemId}/enrichment/{contributionId}`,
  'Correct a contribution owned by the same contributing experience',
  'ContributionInput',
  'ContributionReceipt'
);
op(
  'get',
  `${p}/items/{itemId}/enrichment/{contributionId}`,
  'Read a visible contribution including large material',
  undefined,
  'Contribution'
);
op(
  'post',
  `${p}/items/{itemId}/enrichment/retry`,
  'Request new enrichment without changing lifecycle',
  undefined,
  'Pending',
  202
);
op(
  'get',
  `${p}/items/{itemId}/jobs`,
  'Inspect background work for an owned item',
  undefined,
  'JobList'
);
op('get', `${p}/jobs/{jobId}`, 'Inspect an owned background job', undefined, 'Job');
op(
  'post',
  `${p}/jobs/{jobId}/retry`,
  'Retry failed work without reviving deleted generations',
  undefined,
  'Pending',
  202
);
op(
  'post',
  `${p}/sources/resolve`,
  'Resolve a source and its available delivery routes',
  'SourceResolveInput',
  'Source'
);
op('get', `${p}/sources`, 'List resolved sources', undefined, 'SourceList');
op(
  'get',
  `${p}/sources/{sourceId}`,
  'Retrieve an owned source and delivery routes',
  undefined,
  'Source'
);
op(
  'post',
  `${p}/subscriptions`,
  'Subscribe: latest matching item, then future intake',
  'SubscriptionInput',
  'SubscriptionCreated',
  201
);
op('get', `${p}/subscriptions`, 'List subscriptions', undefined, 'SubscriptionList');
op(
  'get',
  `${p}/subscriptions/{subscriptionId}`,
  'Inspect subscription state',
  undefined,
  'Subscription'
);
op(
  'patch',
  `${p}/subscriptions/{subscriptionId}`,
  'Change future selection and saving behavior',
  'SubscriptionPatch',
  'Subscription'
);
op(
  'delete',
  `${p}/subscriptions/{subscriptionId}`,
  'Unsubscribe while retaining existing items',
  undefined,
  undefined,
  204
);
op(
  'post',
  `${p}/subscriptions/{subscriptionId}/sync`,
  'Request subscription intake',
  undefined,
  'Pending',
  202
);
op(
  'post',
  `${p}/tokens`,
  'Issue a one-time API credential; interactive login required',
  'TokenInput',
  'TokenCreated',
  201
);
op(
  'get',
  `${p}/tokens`,
  'List credential metadata; interactive login required',
  undefined,
  'TokenList'
);
op(
  'delete',
  `${p}/tokens/{tokenId}`,
  'Revoke an API credential immediately',
  undefined,
  undefined,
  204
);

op(
  'get',
  `${p}/connections`,
  'List connected provider status without credentials',
  undefined,
  'ConnectionList'
);
op(
  'put',
  `${p}/connections/google`,
  'Validate and store an existing Google grant; interactive login required',
  'GoogleCredentialInput',
  'ConnectionResult'
);
op(
  'delete',
  `${p}/connections/google`,
  'Disconnect Google from this service without revoking other installations',
  undefined,
  undefined,
  204
);

op('get', `${p}/export`, 'Get a live portable-data export manifest', undefined, 'ExportManifest');
op(
  'get',
  `${p}/export/{section}`,
  'Page private account data including retained enrichment material',
  undefined,
  'ExportPage'
);
op(
  'delete',
  `${p}/account/data`,
  'Erase this service account data and revoke API credentials; interactive login required',
  undefined,
  'DataErased'
);

op(
  'get',
  `${p}/items/{itemId}/members`,
  'Read platform collection members without saving or subscribing to them',
  undefined,
  'MemberPage'
);

const pageParams = [
  { name: 'limit', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  { name: 'cursor', schema: { type: 'string' } },
];
browse.query = [
  ...pageParams,
  ...['type', 'platform', 'tag', 'collectionId', 'subscriptionId', 'sourceId'].map((name) => ({
    name,
    schema: { type: 'string' },
    description: 'Comma-separated values; any value matches within a filter.',
  })),
  {
    name: 'status',
    schema: { type: 'string', enum: ['saved', 'received', 'dismissed'], default: 'saved' },
  },
  { name: 'archived', schema: { type: 'boolean' } },
  { name: 'completed', schema: { type: 'boolean' } },
  { name: 'tagMatch', schema: { type: 'string', enum: ['any', 'all'], default: 'any' } },
  ...['savedAfter', 'savedBefore'].map((name) => ({
    name,
    schema: { type: 'string', format: 'date-time' },
  })),
  { name: 'url', schema: { type: 'string', format: 'uri' } },
];
for (const operation of operations) {
  if (
    operation.method === 'get' &&
    [
      '/v1/collections',
      '/v1/sources',
      '/v1/subscriptions',
      '/v1/collections/{collectionId}/items',
      '/v1/items/{itemId}/identity',
      '/v1/items/{itemId}/reconciliations',
      '/v1/items/{itemId}/relationships',
    ].includes(operation.path)
  )
    operation.query = [...pageParams];
  if (operation.path === '/v1/items/{itemId}/relationships' && operation.method === 'get')
    operation.query = [
      ...pageParams,
      {
        name: 'direction',
        schema: { type: 'string', enum: ['both', 'incoming', 'outgoing'], default: 'both' },
      },
    ];
  if (operation.path === '/v1/items/{itemId}' && operation.method === 'get')
    operation.query = [
      {
        name: 'include',
        schema: { type: 'string' },
        description: 'Comma-separated transcript, article, thread, members or structuredData.',
      },
    ];
}

let cached: Json | undefined;
export function responseContract(method: string, path: string, status: number) {
  const operation = operations.find(
    (operation) => operation.method === method.toLowerCase() && operation.path === path
  );
  if (!operation?.output || status >= 400) return status >= 400 ? schemaSources.Error : undefined;
  return schemaSources[operation.output];
}
export function openApiDocument(): Json {
  if (cached) return cached;
  const schemas: Record<string, unknown> = {};
  const normalize = (value: unknown, name: string): unknown => {
    if (Array.isArray(value)) return value.map((child) => normalize(child, name));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '$schema' && key !== '$defs')
        .map(([key, child]) => [
          key,
          key === '$ref' && typeof child === 'string' && child.startsWith('#/$defs/')
            ? `#/components/schemas/${name}_${child.slice(8)}`
            : normalize(child, name),
        ])
    );
  };
  for (const [name, schema] of Object.entries(schemaSources)) {
    const converted = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Json;
    schemas[name] = normalize(converted, name);
    for (const [def, value] of Object.entries((converted.$defs as Json) ?? {}))
      schemas[`${name}_${def}`] = normalize(value, name);
  }
  (schemas.RelationshipInput as Json).oneOf = [
    { required: ['targetItemId'], not: { required: ['targetUrl'] } },
    { required: ['targetUrl'], not: { required: ['targetItemId'] } },
  ];
  const contribution = schemas.ContributionInput as Json;
  contribution.allOf = Object.keys(fieldValueSchemas).map((field) => ({
    if: { properties: { field: { const: field } }, required: ['field'] },
    then: { properties: { value: { $ref: `#/components/schemas/Field_${field}` } } },
  }));
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operations) {
    const parameters: Json[] = [...operation.path.matchAll(/\{(\w+)\}/g)].map((match) => ({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }));
    for (const parameter of operation.query ?? [])
      parameters.push({ ...parameter, in: 'query', required: false });
    if (operation.path === '/v1/saves')
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: false,
        schema: { type: 'string', maxLength: 200 },
        description:
          'Stable for a retry; a different payload with the same key returns 409. Deleted receipts return 410.',
      });
    const responses: Record<string, unknown> = {};
    for (const status of [401, 403, 404, 409, 410, 413, 415, 422, 429, 500, 503])
      responses[String(status)] = {
        description: `HTTP ${status}; machine-readable error code and request correlation`,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      };
    const success = operation.output
      ? {
          description: operation.summary,
          content: {
            'application/json': { schema: { $ref: `#/components/schemas/${operation.output}` } },
          },
        }
      : { description: 'Completed; no response body' };
    responses[String(operation.status ?? 200)] = success;
    if (operation.path === '/v1/saves') responses['200'] = success;
    paths[operation.path] ??= {};
    paths[operation.path][operation.method] = {
      operationId: `${operation.method}_${operation.path.replace(/[^a-zA-Z0-9]+/g, '_')}`,
      summary: operation.summary,
      security: operation.path.startsWith('/v1/') ? [{ bearerAuth: [] }] : [],
      parameters,
      ...(operation.input
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: `#/components/schemas/${operation.input}` } },
              },
            },
          }
        : {}),
      responses,
    };
  }
  cached = {
    openapi: '3.1.0',
    info: {
      title: 'Zine API',
      version: '0.1.0',
      description:
        'Independent rewrite. See verification ledger for implementation and acceptance status. Content stays at its source; personal state and accessible understanding are combined by this API.',
    },
    servers: [{ url: 'https://api-next.myzine.app' }, { url: 'http://localhost:8890' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Verified interactive session or a Zine API token. Tokens are independently stored and revocable.',
        },
      },
      schemas,
    },
    paths,
  };
  return cached;
}
