/** Regenerate versioned publication fixtures and OpenAPI from executable schemas. */
import { writeFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { format, resolveConfig } from 'prettier';
const formatJson = async (value: unknown, path: string) =>
  format(JSON.stringify(value), { ...(await resolveConfig(path)), parser: 'json' });
import * as foundationContracts from '../packages/shared/src/schemas/publications';
import * as deliveryContracts from '../packages/shared/src/schemas/publication-delivery';
import * as recapContracts from '../packages/shared/src/schemas/weekly-recaps';
const contracts = { ...foundationContracts, ...deliveryContracts, ...recapContracts };
const names = new Map(
  Object.entries(contracts)
    .filter(([, schema]) => schema instanceof z.ZodType)
    .map(([name, schema]) => [schema, name])
);
function jsonSchema(schema: z.ZodTypeAny, root = false): Record<string, unknown> {
  const name = names.get(schema);
  if (!root && name) return { $ref: `#/components/schemas/${name}` };
  const d = schema._def;
  if (schema instanceof z.ZodEffects) return jsonSchema(d.schema);
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault)
    return jsonSchema(d.innerType);
  if (schema instanceof z.ZodNullable)
    return { anyOf: [jsonSchema(d.innerType), { type: 'null' }] };
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    return {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, jsonSchema(v)])),
      required: Object.entries(shape)
        .filter(([, v]) => !v.isOptional())
        .map(([k]) => k),
    };
  }
  if (schema instanceof z.ZodArray)
    return {
      type: 'array',
      items: jsonSchema(d.type),
      ...(d.minLength ? { minItems: d.minLength.value } : {}),
      ...(d.maxLength ? { maxItems: d.maxLength.value } : {}),
    };
  if (schema instanceof z.ZodDiscriminatedUnion || schema instanceof z.ZodUnion)
    return { oneOf: [...d.options].map((s: z.ZodTypeAny) => jsonSchema(s)) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: d.values };
  if (schema instanceof z.ZodLiteral) return { const: d.value };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodRecord)
    return { type: 'object', additionalProperties: jsonSchema(d.valueType) };
  if (schema instanceof z.ZodString) {
    const result: Record<string, unknown> = { type: 'string' };
    for (const check of d.checks) {
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
      if (check.kind === 'regex') result.pattern = check.regex.source;
      if (check.kind === 'url') result.format = 'uri';
      if (check.kind === 'datetime') result.format = 'date-time';
    }
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result: Record<string, unknown> = {
      type: d.checks.some((v: { kind: string }) => v.kind === 'int') ? 'integer' : 'number',
    };
    for (const c of d.checks) {
      if (c.kind === 'min') result[c.inclusive ? 'minimum' : 'exclusiveMinimum'] = c.value;
      if (c.kind === 'max') result[c.inclusive ? 'maximum' : 'exclusiveMaximum'] = c.value;
    }
    return result;
  }
  return {};
}
const path = 'apps/worker/src/routes/api-v1.openapi.json',
  spec = JSON.parse(await readFile(path, 'utf8'));
spec.info.version = '1.14.0';
spec.tags = spec.tags.filter((v: { name: string }) => v.name !== 'Publications');
spec.tags.push({
  name: 'Publications',
  description:
    'Personal publications, private issue composition, public reading and publication subscriptions. Private operations require Clerk sessions; bookmark PATs are rejected.',
});
for (const [name, schema] of Object.entries(contracts))
  if (schema instanceof z.ZodType) spec.components.schemas[name] = jsonSchema(schema, true);
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const resource = (key: string, name: string) => ({
  type: 'object',
  properties: { [key]: ref(name), requestId: { type: 'string' }, traceId: { type: 'string' } },
  required: [key],
});
const endpoint = (
  url: string,
  method: string,
  summary: string,
  output: unknown,
  input?: string,
  anonymous = false,
  idempotent = false
) => {
  const params = [...url.matchAll(/\{([^}]+)\}/g)].map((v) => ({
    name: v[1],
    in: 'path',
    required: true,
    schema: ref(v[1] === 'weekStart' ? 'WeeklyRecapWeekSchema' : 'PublicationIdSchema'),
  }));
  if (idempotent)
    params.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: ref('IdempotencyKeySchema'),
    });
  const op = {
    tags: ['Publications'],
    summary,
    security: anonymous ? [] : [{ clerkBearerAuth: [] }],
    parameters: params,
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: output } } },
      ...Object.fromEntries(
        [400, 401, 403, 404, 409, 413, 415, 422, 503].map((code) => [
          code,
          {
            description: 'See typed publication error code and details.',
            content: { 'application/json': { schema: ref('PublicationErrorSchema') } },
          },
        ])
      ),
    },
    ...(input
      ? { requestBody: { required: true, content: { 'application/json': { schema: ref(input) } } } }
      : {}),
  };
  spec.paths[url] = { ...(spec.paths[url] || {}), [method]: op };
};
spec.components.securitySchemes.clerkBearerAuth = {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'Clerk session JWT',
};
for (const [method, input] of [
  ['get', undefined],
  ['post', 'CreatePublicationSchema'],
  ['patch', 'PatchPublicationSchema'],
] as const)
  endpoint(
    '/api/v1/me/publication',
    method,
    'Read or manage own publication',
    resource('publication', 'OwnerPublicationSchema'),
    input,
    false,
    method !== 'get'
  );
endpoint(
  '/api/v1/me/publication/issues',
  'post',
  'Create independent draft',
  resource('issue', 'OwnerIssueSchema'),
  'CreateIssueSchema',
  false,
  true
);
for (const [method, input] of [
  ['get', undefined],
  ['patch', 'PatchIssueSchema'],
  ['delete', 'PublishIssueSchema'],
] as const)
  endpoint(
    '/api/v1/me/issues/{id}',
    method,
    'Read or mutate owned issue',
    method === 'delete'
      ? { type: 'object', properties: { deleted: { const: true } } }
      : resource('issue', 'OwnerIssueSchema'),
    input,
    false,
    method !== 'get'
  );
endpoint(
  '/api/v1/me/issues/{id}/publish',
  'post',
  'Explicitly publish owned issue',
  resource('issue', 'OwnerIssueSchema'),
  'PublishIssueSchema',
  false,
  true
);
endpoint(
  '/api/v1/publications/{id}',
  'get',
  'Read public publication',
  resource('publication', 'PublicPublicationSchema'),
  undefined,
  true
);
endpoint(
  '/api/v1/issues/{id}',
  'get',
  'Read public published issue',
  resource('issue', 'PublicIssueSchema'),
  undefined,
  true
);
for (const [url, privateRead] of [
  ['/api/v1/me/publication/issues', true],
  ['/api/v1/publications/{id}/issues', false],
] as const) {
  endpoint(
    url,
    'get',
    'Paginated issue list',
    {
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: ref(privateRead ? 'OwnerIssueSchema' : 'PublicIssueSchema'),
        },
        nextCursor: { type: ['string', 'null'] },
      },
    },
    undefined,
    !privateRead
  );
  spec.paths[url].get.parameters.push(
    {
      name: 'limit',
      in: 'query',
      schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    },
    { name: 'cursor', in: 'query', schema: { type: 'string' } }
  );
}
for (const method of ['get', 'put', 'patch', 'delete'])
  endpoint(
    '/api/v1/publications/{id}/subscription',
    method,
    'Read or manage own publication subscription',
    resource('subscription', 'PublicationSubscriptionSchema'),
    method === 'patch' ? 'SubscriptionPreferenceSchema' : undefined
  );
endpoint('/api/v1/me/publication/subscribers', 'get', 'Private paginated subscriber list', {
  type: 'object',
  properties: {
    subscribers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          generation: { type: 'integer' },
          subscribedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    nextCursor: { type: ['string', 'null'] },
  },
});
endpoint('/api/v1/me/publication-subscriptions', 'get', 'Own active publication subscriptions', {
  type: 'object',
  properties: {
    subscriptions: { type: 'array', items: ref('PublicationSubscriptionSchema') },
    nextCursor: { type: ['string', 'null'] },
  },
});
endpoint('/api/v1/me/publication-assets', 'post', 'Upload bounded cover image bytes', {
  type: 'object',
  properties: {
    asset: {
      type: 'object',
      properties: {
        id: ref('PublicationIdSchema'),
        contentType: { const: 'image/jpeg' },
        byteSize: { type: 'integer' },
      },
    },
  },
});
spec.paths['/api/v1/me/publication-assets'].post.requestBody = {
  required: true,
  content: Object.fromEntries(
    ['image/png', 'image/jpeg', 'image/webp'].map((type) => [
      type,
      {
        schema: {
          type: 'string',
          format: 'binary',
          description: 'Maximum 5 MiB input, 20 MP decoded; sanitized JPEG output.',
        },
      },
    ])
  ),
};
endpoint(
  '/api/v1/publication-assets/{id}',
  'get',
  'Read sanitized public cover',
  {},
  undefined,
  true
);
spec.paths['/api/v1/publication-assets/{id}'].get.responses['200'] = {
  description: 'Sanitized JPEG, only when publicly referenced.',
  content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
};
endpoint('/api/v1/me/publication-assets/{id}', 'get', 'Read own private cover preview', {
  type: 'string',
  format: 'binary',
});
spec.paths['/api/v1/me/publication-assets/{id}'].get.responses['200'] = {
  description: 'Sanitized JPEG available only to its authenticated owner.',
  content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
};
// Delivery contracts use the same Clerk boundary and publication error envelope.
endpoint('/api/v1/me/publication-activity', 'get', 'Read own publication activity', {
  type: 'object',
  properties: {
    activities: { type: 'array', items: ref('PublicationActivitySchema') },
    nextCursor: { type: ['string', 'null'] },
  },
});
endpoint('/api/v1/me/publication-activity/{id}', 'patch', 'Mark own activity read', {
  type: 'object',
  properties: { id: ref('PublicationIdSchema'), read: { const: true } },
});
for (const method of ['get', 'put'])
  endpoint(
    '/api/v1/me/publication-delivery-preferences',
    method,
    'Own notification timezone',
    resource('preferences', 'DeliveryPreferencesResourceSchema'),
    method === 'put' ? 'DeliveryPreferencesSchema' : undefined
  );
for (const method of ['put', 'delete'])
  endpoint(
    '/api/v1/me/push-installations/{installationId}',
    method,
    'Manage authenticated push installation',
    resource('installation', 'PushInstallationSchema'),
    method === 'put' ? 'PushInstallationInputSchema' : undefined
  );
for (const method of ['get', 'put'])
  endpoint(
    '/api/v1/issues/{id}/visit',
    method,
    'Read or advance presented issue revision',
    resource('visit', 'IssueVisitSchema'),
    method === 'put' ? 'IssueVisitInputSchema' : undefined
  );
endpoint(
  '/api/v1/issues/{id}/selections/{selectionId}/save',
  'post',
  'Save published selection with discovery attribution',
  ref('SelectionSaveResultSchema'),
  undefined,
  false,
  true
);
endpoint(
  '/api/v1/bookmarks/{id}/discovery-references',
  'get',
  'Read own bookmark discovery references',
  {
    type: 'object',
    properties: { discoveryReferences: { type: 'array', items: ref('DiscoveryReferenceSchema') } },
  }
);

for (const method of ['get', 'put'])
  endpoint(
    '/api/v1/me/weekly-recap-preferences',
    method,
    'Own persisted weekly timezone',
    resource('preferences', 'WeeklyRecapPreferencesSchema'),
    method === 'put' ? 'WeeklyRecapPreferencesInputSchema' : undefined
  );
endpoint('/api/v1/me/weekly-recaps', 'get', 'Read private completed-week recap history', {
  type: 'object',
  properties: {
    recaps: { type: 'array', items: ref('WeeklyRecapSchema') },
    nextCursor: { type: ['string', 'null'] },
  },
});
endpoint(
  '/api/v1/me/weekly-recaps/{weekStart}',
  'get',
  'Read one private closed-week recap',
  resource('recap', 'WeeklyRecapSchema')
);
endpoint(
  '/api/v1/me/weekly-recaps/{weekStart}/issue',
  'post',
  'Create editable weekly draft from explicit saved candidates',
  resource('issue', 'OwnerIssueSchema'),
  'CreateWeeklyRecapIssueSchema',
  false,
  true
);
for (const route of ['/api/v1/me/publication-activity', '/api/v1/me/weekly-recaps'])
  spec.paths[route].get.parameters.push(
    {
      name: 'limit',
      in: 'query',
      schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    },
    { name: 'cursor', in: 'query', schema: { type: 'string' } }
  );
const openOperation = spec.paths['/api/v1/bookmarks/{id}/opened'].post;
openOperation.parameters = (openOperation.parameters || []).filter(
  (p: { name: string; in: string }) => p.name !== 'X-Zine-Interaction-Id' || p.in !== 'header'
);
openOperation.parameters.push({
  name: 'X-Zine-Interaction-Id',
  in: 'header',
  required: false,
  description: 'Stable identity for one observed open; reuse on retry.',
  schema: { type: 'string', minLength: 1, maxLength: 128 },
});
await writeFile(path, await formatJson(spec, path));
const pub = {
  id: '01J00000000000000000000001',
  handle: '01J00000000000000000000001',
  displayName: 'Loose Threads',
  description: 'Things that stayed with me.',
  coverUrl: null,
  editor: { displayName: 'Example Editor' },
};
const selection = {
  id: '01J00000000000000000000004',
  contentType: 'ARTICLE',
  title: 'Public essay',
  creatorName: 'Example Author',
  sourceName: 'example.org',
  originalUrl: 'https://example.org/essay',
  artworkUrl: null,
  commentary: 'Worth your time.',
  firstPublishedRevision: 3,
  originalAvailability: 'AVAILABLE',
};
const publicIssue = {
  id: '01J00000000000000000000002',
  publication: pub,
  kind: 'INDEPENDENT',
  title: 'Thinking about cities',
  coverUrl: null,
  introduction: 'Three perspectives.',
  revision: 3,
  publishedAt: '2026-10-08T12:00:00.000Z',
  sections: [{ id: '01J00000000000000000000003', heading: null, selections: [selection] }],
};
const fixtures = {
  version: 1,
  publicPublication: contracts.PublicPublicationSchema.parse(pub),
  publicIssue: contracts.PublicIssueSchema.parse(publicIssue),
  weeklyIssue: contracts.PublicIssueSchema.parse({ ...publicIssue, kind: 'WEEKLY' }),
  ownerDraft: contracts.OwnerIssueSchema.parse({
    ...publicIssue,
    publishedAt: null,
    status: 'DRAFT',
    coverAssetId: null,
    weeklyWindowId: null,
    sections: publicIssue.sections.map((s) => ({
      ...s,
      selections: s.selections.map((v) => ({
        ...v,
        firstPublishedRevision: null,
        itemId: 'canonical-item',
        bookmarkId: 'owned-bookmark',
      })),
    })),
  }),
  conflict: {
    error: 'REVISION_CONFLICT',
    code: 'REVISION_CONFLICT',
    details: { currentRevision: 4 },
  },
  ineligible: {
    error: 'INELIGIBLE_SELECTIONS',
    code: 'INELIGIBLE_SELECTIONS',
    details: { reason: 'PRIVATE_SOURCE' },
  },
  tombstone: { publicationId: pub.id, issueId: publicIssue.id, available: false },
  event: {
    id: '01J00000000000000000000005',
    cursor: 1,
    publicationId: pub.id,
    issueId: publicIssue.id,
    revision: 3,
    kind: 'ISSUE_PUBLISHED',
    selectionIds: [selection.id],
    occurredAt: '2026-10-08T12:00:00.000Z',
  },
};
await writeFile(
  'packages/shared/src/fixtures/publications/v1.json',
  await formatJson(fixtures, 'packages/shared/src/fixtures/publications/v1.json')
);
