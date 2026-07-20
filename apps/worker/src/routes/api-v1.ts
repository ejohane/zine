import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ulid } from 'ulid';
import {
  ContentTypeSchema,
  Provider,
  ProviderSchema,
  SubscriptionStatus,
  UserItemState,
} from '@zine/shared';
import {
  AbandonEditorialExperimentSchema,
  CreateEditorialExperimentSchema,
  CreateEditorialFeedbackSchema,
  FailEditorialRunSchema,
  FailEditorialExperimentSchema,
  PromoteEditorialExperimentSchema,
  PublishEditorialEditionSchema,
  PublishEditorialExperimentVariantSchema,
  ReviewEditorialExperimentSchema,
  StartEditorialRunSchema,
  UpdateEditorialExperimentSchema,
} from '@zine/editorial-schema';
import type { Env } from '../types';
import { createDb } from '../db';
import { apiTokens, userItemConsumptionEvents, userItems } from '../db/schema';
import { appRouter } from '../trpc/router';
import { createContext } from '../trpc/context';
import openApiSpec from './api-v1.openapi.json';
import {
  getActiveSyncJob,
  getJobStatus,
  getSyncStatus,
  initiateSyncJob,
  RateLimitError,
} from '../sync/service';
import {
  type ApiTokenScope,
  API_TOKEN_PREFIX,
  hashApiToken,
  hasApiTokenScope,
  isApiTokenActive,
} from '../lib/api-tokens';
import {
  EditorialConflictError,
  EditorialValidationError,
  getEditorialArtifact,
  getEditorialEdition,
  listEditorialEditions,
  storeEditorialEdition,
} from '../lib/editorial-storage';
import { verifyClerkRequestToken } from '../middleware/auth';
import { getEditorialToday } from '../lib/editorial-today';
import {
  EditorialFeedbackConflictError,
  EditorialFeedbackTargetError,
  getEditorialFeedbackProfile,
  recordEditorialFeedback,
} from '../lib/editorial-feedback';
import {
  EditorialRunConflictError,
  EditorialRunNotFoundError,
  failEditorialRun,
  startEditorialRun,
} from '../lib/editorial-runs';
import {
  abandonEditorialExperiment,
  createEditorialExperiment,
  EditorialExperimentConflictError,
  EditorialExperimentNotFoundError,
  EditorialExperimentTransitionError,
  EditorialExperimentValidationError,
  failEditorialExperiment,
  getEditorialExperiment,
  getEditorialExperimentVariantPreview,
  listEditorialExperiments,
  lockEditorialExperiment,
  promoteEditorialExperiment,
  publishEditorialExperimentVariant,
  reviewEditorialExperiment,
  updateEditorialExperiment,
} from '../lib/editorial-experiments';

const DEFAULT_BOOKMARKS_LIMIT = 10;
const MAX_BOOKMARKS_LIMIT = 50;

const SaveBookmarkBodySchema = z.object({
  url: z.string().url('Invalid URL format'),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
});

const PreviewBookmarkBodySchema = z.object({
  url: z.string().url('Invalid URL format'),
});

const InboxQuerySchema = z.object({
  provider: ProviderSchema.optional(),
  contentType: ContentTypeSchema.optional(),
});

const BookmarkQuerySchema = z.object({
  provider: ProviderSchema.optional(),
  contentType: ContentTypeSchema.optional(),
});

const SyncJobBodySchema = z.object({}).strict().optional();

const AddProviderSubscriptionBodySchema = z
  .object({
    channelId: z.string().min(1),
    name: z.string().min(1).optional(),
    imageUrl: z.string().url().optional(),
  })
  .strict();

const UpdateProviderSubscriptionBodySchema = z
  .object({
    action: z.enum(['pause', 'resume']),
  })
  .strict();

const RegisterOAuthStateBodySchema = z
  .object({
    state: z.string().min(32).max(128),
  })
  .strict();

const CompleteOAuthBodySchema = z
  .object({
    code: z.string().min(1),
    state: z.string().min(32).max(128),
    codeVerifier: z.string().min(43).max(128),
    redirectUri: z.string().min(1),
  })
  .strict();

const UpdateNewsletterBodySchema = z
  .object({
    action: z.enum(['activate', 'hide']),
  })
  .strict();

const AddRssFeedBodySchema = z
  .object({
    feedUrl: z.string().min(1),
    seedMode: z.enum(['latest', 'none']).optional(),
  })
  .strict();

const UpdateRssFeedBodySchema = z
  .object({
    action: z.enum(['pause', 'resume']),
  })
  .strict();

const UpdateXBookmarkSettingsBodySchema = z
  .object({
    dailySyncEnabled: z.boolean(),
  })
  .strict();

const SetTagsBodySchema = z
  .object({
    tags: z.array(z.string().min(1).max(64)).max(20),
  })
  .strict();

const UpdateProgressBodySchema = z
  .object({
    position: z.number().min(0),
    duration: z.number().min(0),
  })
  .strict();

const FinishBookmarkBodySchema = z
  .object({
    isFinished: z.boolean().optional(),
    finished: z.boolean().optional(),
    completed: z.boolean().optional(),
    read: z.boolean().optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    const fields = ['isFinished', 'finished', 'completed', 'read'] as const;
    const provided = fields.filter((field) => body[field] !== undefined);

    if (provided.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of isFinished, finished, completed, or read',
      });
    }
  });

function getRequestedFinishedState(body: z.infer<typeof FinishBookmarkBodySchema>): boolean {
  return Boolean(body.isFinished ?? body.finished ?? body.completed ?? body.read);
}

function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

function parseLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_BOOKMARKS_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BOOKMARKS_LIMIT;
  }

  return Math.min(MAX_BOOKMARKS_LIMIT, Math.max(1, parsed));
}

function editorialExperimentErrorResponse(c: Context<Env>, error: unknown): Response {
  const common = { requestId: c.get('requestId'), traceId: c.get('traceId') };
  if (error instanceof EditorialExperimentNotFoundError) {
    return c.json({ error: error.message, code: 'NOT_FOUND', ...common }, 404);
  }
  if (error instanceof EditorialExperimentConflictError) {
    return c.json({ error: error.message, code: 'EDITORIAL_EXPERIMENT_CONFLICT', ...common }, 409);
  }
  if (
    error instanceof EditorialExperimentTransitionError ||
    error instanceof EditorialExperimentValidationError
  ) {
    return c.json(
      {
        error: error.message,
        code:
          error instanceof EditorialExperimentTransitionError
            ? 'EDITORIAL_EXPERIMENT_TRANSITION'
            : 'EDITORIAL_EXPERIMENT_VALIDATION',
        ...common,
      },
      400
    );
  }
  throw error;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function getRetryAfterSeconds(message: string): number | undefined {
  const match = message.match(/wait (\d+) seconds/i);
  if (!match) {
    return undefined;
  }

  const seconds = Number.parseInt(match[1], 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}

function toPreviewItem(preview: {
  provider: string;
  contentType: string;
  providerId: string;
  title: string;
  creator: string;
  creatorImageUrl?: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  canonicalUrl: string;
  description?: string | null;
  siteName?: string | null;
  wordCount?: number | null;
  readingTimeMinutes?: number | null;
  publishedAt?: string | null;
}) {
  return {
    provider: preview.provider,
    contentType: preview.contentType,
    providerId: preview.providerId,
    title: preview.title,
    creator: preview.creator,
    creatorImageUrl: preview.creatorImageUrl ?? null,
    thumbnailUrl: preview.thumbnailUrl,
    duration: preview.duration,
    canonicalUrl: preview.canonicalUrl,
    description: preview.description ?? null,
    siteName: preview.siteName ?? null,
    wordCount: preview.wordCount ?? null,
    readingTimeMinutes: preview.readingTimeMinutes ?? null,
    publishedAt: preview.publishedAt ?? null,
  };
}

function trpcErrorResponse(c: Context<Env>, error: unknown) {
  if (error instanceof TRPCError) {
    if (error.code === 'NOT_FOUND') {
      return c.json(
        {
          error: error.message,
          code: 'NOT_FOUND',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }

    if (error.code === 'BAD_REQUEST') {
      return c.json(
        {
          error: error.message,
          code: 'BAD_REQUEST',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }

    if (error.code === 'UNAUTHORIZED') {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        401
      );
    }

    if (error.code === 'PRECONDITION_FAILED') {
      return c.json(
        {
          error: error.message,
          code: 'PRECONDITION_FAILED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        412
      );
    }

    if (error.code === 'TOO_MANY_REQUESTS') {
      return c.json(
        {
          error: error.message,
          code: 'RATE_LIMITED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        429
      );
    }
  }

  throw error;
}

function apiAuth(requiredPatScope: ApiTokenScope) {
  const middleware: MiddlewareHandler<Env> = async (c, next) => {
    const requestId = c.get('requestId');
    const traceId = c.get('traceId');
    const rawToken = extractBearerToken(c.req.header('Authorization'));

    if (!rawToken) {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId,
          traceId,
        },
        401
      );
    }

    if (!rawToken.startsWith(API_TOKEN_PREFIX)) {
      const result = await verifyClerkRequestToken(rawToken, c.env);
      if (!result.success) {
        c.header('X-Zine-Auth-Error', result.code);
        return c.json(
          {
            error: result.error,
            code: result.code,
            requestId,
            traceId,
          },
          result.code === 'INVALID_TOKEN' || result.code === 'EXPIRED_TOKEN' ? 403 : 401
        );
      }

      c.set('userId', result.userId);
      await next();
      return;
    }

    const tokenHash = await hashApiToken(rawToken);
    const db = createDb(c.env.DB);
    const token = await db.query.apiTokens.findFirst({
      where: eq(apiTokens.tokenHash, tokenHash),
    });

    if (!token || !isApiTokenActive(token)) {
      return c.json(
        {
          error: 'Unauthorized',
          code: 'UNAUTHORIZED',
          requestId,
          traceId,
        },
        401
      );
    }

    if (!hasApiTokenScope(token, requiredPatScope)) {
      return c.json(
        {
          error: 'Forbidden',
          code: 'FORBIDDEN',
          requestId,
          traceId,
        },
        403
      );
    }

    await db
      .update(apiTokens)
      .set({ lastUsedAt: Date.now() })
      .where(and(eq(apiTokens.id, token.id), eq(apiTokens.userId, token.userId)));

    c.set('userId', token.userId);
    await next();
  };

  return middleware;
}

const apiV1Routes = new Hono<Env>();

apiV1Routes.get('/openapi.json', (c) => c.json(openApiSpec));

apiV1Routes.get('/subscriptions', apiAuth('sync:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const [connections, youtube, spotify, newsletters, rss, xBookmarks] = await Promise.all([
      caller.subscriptions.connections.list(),
      caller.subscriptions.list({
        provider: Provider.YOUTUBE,
        status: SubscriptionStatus.ACTIVE,
        limit: 100,
      }),
      caller.subscriptions.list({
        provider: Provider.SPOTIFY,
        status: SubscriptionStatus.ACTIVE,
        limit: 100,
      }),
      caller.subscriptions.newsletters.stats(),
      caller.subscriptions.rss.stats(),
      caller.subscriptions.xBookmarks.status(),
    ]);

    return c.json({
      sources: [
        {
          provider: Provider.YOUTUBE,
          connectionStatus: connections.YOUTUBE?.status ?? null,
          activeCount: youtube.items.length,
        },
        {
          provider: Provider.SPOTIFY,
          connectionStatus: connections.SPOTIFY?.status ?? null,
          activeCount: spotify.items.length,
        },
        {
          provider: Provider.GMAIL,
          connectionStatus: connections.GMAIL?.status ?? null,
          activeCount: newsletters.active,
        },
        {
          provider: Provider.X,
          connectionStatus: connections.X?.status ?? null,
          activeCount: xBookmarks.importedCount,
        },
        {
          provider: Provider.RSS,
          connectionStatus: null,
          activeCount: rss.active,
        },
      ],
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/subscriptions/youtube', apiAuth('sync:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const connections = await caller.subscriptions.connections.list();
    const subscriptionItems = [];
    let cursor: string | undefined;

    do {
      const page = await caller.subscriptions.list({
        provider: Provider.YOUTUBE,
        limit: 100,
        cursor,
      });
      subscriptionItems.push(...page.items);
      cursor = page.hasMore && page.nextCursor ? page.nextCursor : undefined;
    } while (cursor);

    const discovery = await caller.subscriptions.discover.available({
      provider: Provider.YOUTUBE,
    });
    const activeSubscriptions = subscriptionItems.filter(
      (subscription) => subscription.status !== 'UNSUBSCRIBED'
    );
    const items = [
      ...activeSubscriptions.map((subscription) => ({
        subscriptionId: subscription.id,
        channelId: subscription.providerChannelId,
        name: subscription.name,
        imageUrl: subscription.imageUrl,
        status: subscription.status,
        isSubscribed: true,
        lastPolledAt: subscription.lastPolledAt,
      })),
      ...discovery.items.map((channel) => ({
        subscriptionId: null,
        channelId: channel.id,
        name: channel.name,
        imageUrl: channel.imageUrl ?? null,
        status: null,
        isSubscribed: false,
        lastPolledAt: null,
      })),
    ].sort((left, right) => left.name.localeCompare(right.name));

    return c.json({
      connection: connections.YOUTUBE
        ? {
            status: connections.YOUTUBE.status,
            providerUserId: connections.YOUTUBE.providerUserId,
            connectedAt: connections.YOUTUBE.connectedAt,
            lastRefreshedAt: connections.YOUTUBE.lastRefreshedAt,
          }
        : null,
      connectionRequired: discovery.connectionRequired,
      items,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/subscriptions/youtube/connection/state', apiAuth('sync:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = RegisterOAuthStateBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.connections.registerState({
      provider: Provider.YOUTUBE,
      state: parsedBody.data.state,
    });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/subscriptions/youtube/connection/callback', apiAuth('sync:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = CompleteOAuthBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.connections.callback({
      provider: Provider.YOUTUBE,
      ...parsedBody.data,
    });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.delete('/subscriptions/youtube/connection', apiAuth('sync:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.connections.disconnect({
      provider: Provider.YOUTUBE,
    });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/subscriptions/youtube', apiAuth('sync:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = AddProviderSubscriptionBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.add({
      provider: Provider.YOUTUBE,
      providerChannelId: parsedBody.data.channelId,
      name: parsedBody.data.name,
      imageUrl: parsedBody.data.imageUrl,
    });
    return c.json(
      {
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      201
    );
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.patch('/subscriptions/youtube/:subscriptionId', apiAuth('sync:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = UpdateProviderSubscriptionBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  const input = { subscriptionId: c.req.param('subscriptionId') };
  try {
    const result =
      parsedBody.data.action === 'pause'
        ? await caller.subscriptions.pause(input)
        : await caller.subscriptions.resume(input);
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.delete('/subscriptions/youtube/:subscriptionId', apiAuth('sync:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.remove({
      subscriptionId: c.req.param('subscriptionId'),
    });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post(
  '/subscriptions/youtube/:subscriptionId/sync',
  apiAuth('sync:write'),
  async (c) => {
    const caller = appRouter.createCaller(await createContext(c));
    try {
      const result = await caller.subscriptions.syncNow({
        subscriptionId: c.req.param('subscriptionId'),
      });
      return c.json({
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      });
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  }
);

type OAuthConnectionProvider = typeof Provider.SPOTIFY | typeof Provider.GMAIL | typeof Provider.X;

function registerOAuthConnectionRoutes(slug: string, provider: OAuthConnectionProvider) {
  apiV1Routes.post(`/subscriptions/${slug}/connection/state`, apiAuth('sync:write'), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = RegisterOAuthStateBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid request body',
          code: 'INVALID_REQUEST_BODY',
          issues: parsedBody.error.issues,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }

    const caller = appRouter.createCaller(await createContext(c));
    try {
      const result = await caller.subscriptions.connections.registerState({
        provider,
        state: parsedBody.data.state,
      });
      return c.json({
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      });
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  });

  apiV1Routes.post(
    `/subscriptions/${slug}/connection/callback`,
    apiAuth('sync:write'),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      const parsedBody = CompleteOAuthBodySchema.safeParse(body);

      if (!parsedBody.success) {
        return c.json(
          {
            error: 'Invalid request body',
            code: 'INVALID_REQUEST_BODY',
            issues: parsedBody.error.issues,
            requestId: c.get('requestId'),
            traceId: c.get('traceId'),
          },
          400
        );
      }

      const caller = appRouter.createCaller(await createContext(c));
      try {
        const result = await caller.subscriptions.connections.callback({
          provider,
          ...parsedBody.data,
        });
        return c.json({
          ...result,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        });
      } catch (error) {
        return trpcErrorResponse(c, error);
      }
    }
  );

  apiV1Routes.delete(`/subscriptions/${slug}/connection`, apiAuth('sync:write'), async (c) => {
    const caller = appRouter.createCaller(await createContext(c));
    try {
      const result = await caller.subscriptions.connections.disconnect({ provider });
      return c.json({
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      });
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  });
}

function registerManagedProviderRoutes(slug: string, provider: typeof Provider.SPOTIFY) {
  apiV1Routes.get(`/subscriptions/${slug}`, apiAuth('sync:read'), async (c) => {
    const caller = appRouter.createCaller(await createContext(c));

    try {
      const connections = await caller.subscriptions.connections.list();
      const subscriptionItems = [];
      let cursor: string | undefined;

      do {
        const page = await caller.subscriptions.list({ provider, limit: 100, cursor });
        subscriptionItems.push(...page.items);
        cursor = page.hasMore && page.nextCursor ? page.nextCursor : undefined;
      } while (cursor);

      const discovery = await caller.subscriptions.discover.available({ provider });
      const activeSubscriptions = subscriptionItems.filter(
        (subscription) => subscription.status !== 'UNSUBSCRIBED'
      );
      const items = [
        ...activeSubscriptions.map((subscription) => ({
          subscriptionId: subscription.id,
          channelId: subscription.providerChannelId,
          name: subscription.name,
          imageUrl: subscription.imageUrl,
          status: subscription.status,
          isSubscribed: true,
          lastPolledAt: subscription.lastPolledAt,
        })),
        ...discovery.items.map((item) => ({
          subscriptionId: null,
          channelId: item.id,
          name: item.name,
          imageUrl: item.imageUrl ?? null,
          status: null,
          isSubscribed: false,
          lastPolledAt: null,
        })),
      ].sort((left, right) => left.name.localeCompare(right.name));

      return c.json({
        connection: connections.SPOTIFY
          ? {
              status: connections.SPOTIFY.status,
              providerUserId: connections.SPOTIFY.providerUserId,
              connectedAt: connections.SPOTIFY.connectedAt,
              lastRefreshedAt: connections.SPOTIFY.lastRefreshedAt,
            }
          : null,
        connectionRequired: discovery.connectionRequired,
        items,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      });
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  });

  apiV1Routes.post(`/subscriptions/${slug}`, apiAuth('sync:write'), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = AddProviderSubscriptionBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid request body',
          code: 'INVALID_REQUEST_BODY',
          issues: parsedBody.error.issues,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }

    const caller = appRouter.createCaller(await createContext(c));
    try {
      const result = await caller.subscriptions.add({
        provider,
        providerChannelId: parsedBody.data.channelId,
        name: parsedBody.data.name,
        imageUrl: parsedBody.data.imageUrl,
      });
      return c.json(
        {
          ...result,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        201
      );
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  });

  apiV1Routes.patch(`/subscriptions/${slug}/:subscriptionId`, apiAuth('sync:write'), async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = UpdateProviderSubscriptionBodySchema.safeParse(body);

    if (!parsedBody.success) {
      return c.json(
        {
          error: 'Invalid request body',
          code: 'INVALID_REQUEST_BODY',
          issues: parsedBody.error.issues,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }

    const caller = appRouter.createCaller(await createContext(c));
    const input = { subscriptionId: c.req.param('subscriptionId') };
    try {
      const result =
        parsedBody.data.action === 'pause'
          ? await caller.subscriptions.pause(input)
          : await caller.subscriptions.resume(input);
      return c.json({
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      });
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  });

  apiV1Routes.delete(`/subscriptions/${slug}/:subscriptionId`, apiAuth('sync:write'), async (c) => {
    const caller = appRouter.createCaller(await createContext(c));
    try {
      const result = await caller.subscriptions.remove({
        subscriptionId: c.req.param('subscriptionId'),
      });
      return c.json({
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      });
    } catch (error) {
      return trpcErrorResponse(c, error);
    }
  });

  apiV1Routes.post(
    `/subscriptions/${slug}/:subscriptionId/sync`,
    apiAuth('sync:write'),
    async (c) => {
      const caller = appRouter.createCaller(await createContext(c));
      try {
        const result = await caller.subscriptions.syncNow({
          subscriptionId: c.req.param('subscriptionId'),
        });
        return c.json({
          ...result,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        });
      } catch (error) {
        return trpcErrorResponse(c, error);
      }
    }
  );
}

registerOAuthConnectionRoutes('spotify', Provider.SPOTIFY);
registerOAuthConnectionRoutes('gmail', Provider.GMAIL);
registerOAuthConnectionRoutes('x', Provider.X);
registerManagedProviderRoutes('spotify', Provider.SPOTIFY);

apiV1Routes.get('/subscriptions/gmail', apiAuth('sync:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const [connections, newsletters, stats] = await Promise.all([
      caller.subscriptions.connections.list(),
      caller.subscriptions.newsletters.list({ limit: 100 }),
      caller.subscriptions.newsletters.stats(),
    ]);
    return c.json({
      connection: connections.GMAIL,
      items: newsletters.items,
      stats,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.patch('/subscriptions/gmail/:feedId', apiAuth('sync:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = UpdateNewsletterBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.newsletters.updateStatus({
      feedId: c.req.param('feedId'),
      status: parsedBody.data.action === 'activate' ? 'ACTIVE' : 'HIDDEN',
    });
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.delete('/subscriptions/gmail/:feedId', apiAuth('sync:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.newsletters.unsubscribe({
      feedId: c.req.param('feedId'),
    });
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/subscriptions/gmail/sync', apiAuth('sync:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.newsletters.syncNow();
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/subscriptions/rss', apiAuth('sync:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const [feeds, stats] = await Promise.all([
      caller.subscriptions.rss.list({ limit: 100 }),
      caller.subscriptions.rss.stats(),
    ]);
    return c.json({
      items: feeds.items,
      stats,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/subscriptions/rss', apiAuth('sync:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = AddRssFeedBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.rss.add(parsedBody.data);
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') }, 201);
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.patch('/subscriptions/rss/:feedId', apiAuth('sync:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = UpdateRssFeedBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  const input = { feedId: c.req.param('feedId') };
  try {
    const result =
      parsedBody.data.action === 'pause'
        ? await caller.subscriptions.rss.pause(input)
        : await caller.subscriptions.rss.resume(input);
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.delete('/subscriptions/rss/:feedId', apiAuth('sync:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.rss.remove({ feedId: c.req.param('feedId') });
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/subscriptions/rss/:feedId/sync', apiAuth('sync:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.rss.syncNow({ feedId: c.req.param('feedId') });
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/subscriptions/x', apiAuth('sync:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const [connections, status] = await Promise.all([
      caller.subscriptions.connections.list(),
      caller.subscriptions.xBookmarks.status(),
    ]);
    return c.json({
      connection: connections.X,
      ...status,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.patch('/subscriptions/x/settings', apiAuth('sync:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = UpdateXBookmarkSettingsBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.xBookmarks.updateSettings(parsedBody.data);
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/subscriptions/x/sync', apiAuth('sync:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  try {
    const result = await caller.subscriptions.xBookmarks.syncNow();
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/sync-jobs', apiAuth('sync:write'), async (c) => {
  let body: unknown;
  const contentLength = c.req.header('content-length');
  const hasPositiveContentLength =
    contentLength !== undefined && Number.parseInt(contentLength, 10) > 0;
  const hasJsonBody =
    hasPositiveContentLength ||
    (contentLength === undefined && c.req.header('content-type')?.includes('application/json'));

  if (hasJsonBody) {
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: 'Invalid request body',
          code: 'INVALID_REQUEST_BODY',
          issues: [{ message: 'Expected a valid JSON request body' }],
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }
  }

  const parsedBody = SyncJobBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const userId = c.get('userId');
  if (!userId) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      401
    );
  }

  try {
    const result = await initiateSyncJob(userId, createDb(c.env.DB), c.env, {
      traceId: c.get('traceId'),
      requestId: c.get('requestId'),
      clientRequestId: c.get('clientRequestId'),
      source: 'api.v1.syncJobs.create',
    });

    return c.json(
      {
        ...result,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      202
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      const retryAfterSeconds = getRetryAfterSeconds(error.message);
      if (retryAfterSeconds !== undefined) {
        c.header('Retry-After', String(retryAfterSeconds));
      }

      return c.json(
        {
          error: error.message,
          code: 'RATE_LIMITED',
          retryAfterSeconds,
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        429
      );
    }
    throw error;
  }
});

apiV1Routes.get('/sync-jobs/active', apiAuth('sync:read'), async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      401
    );
  }

  const result = await getActiveSyncJob(userId, c.env.OAUTH_STATE_KV);

  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/sync-jobs/:jobId', apiAuth('sync:read'), async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      401
    );
  }

  const jobId = c.req.param('jobId');
  const storedStatus = await getJobStatus(jobId, c.env.OAUTH_STATE_KV);
  if (!storedStatus || storedStatus.userId !== userId) {
    return c.json(
      {
        error: 'Sync job not found',
        code: 'SYNC_JOB_NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }

  const result = await getSyncStatus(jobId, c.env.OAUTH_STATE_KV);

  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/inbox', apiAuth('bookmarks:read'), async (c) => {
  const parsedQuery = InboxQuerySchema.safeParse({
    provider: c.req.query('provider'),
    contentType: c.req.query('contentType'),
  });

  if (!parsedQuery.success) {
    return c.json(
      {
        error: 'Invalid query parameters',
        code: 'INVALID_QUERY_PARAMETERS',
        issues: parsedQuery.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');

  const result = await caller.items.inbox({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
    filter: {
      provider: parsedQuery.data.provider,
      contentType: parsedQuery.data.contentType,
    },
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/home', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  const result = await caller.items.home({});

  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/creators/:creatorId', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const creator = await caller.creators.get({ creatorId: c.req.param('creatorId') });
    return c.json({
      creator,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/creators/:creatorId/bookmarks', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');

  try {
    const result = await caller.creators.listBookmarks({
      creatorId: c.req.param('creatorId'),
      limit: parseLimit(c.req.query('limit')),
      cursor: cursor && cursor.length > 0 ? cursor : undefined,
      isFinished: parseBoolean(c.req.query('isFinished')),
    });
    return c.json({
      items: result.items,
      nextCursor: result.nextCursor,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/creators/:creatorId/latest-content', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.creators.fetchLatestContent({
      creatorId: c.req.param('creatorId'),
    });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/inbox/:id/bookmark', apiAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.bookmark({ id: c.req.param('id') });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/inbox/:id/archive', apiAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.archive({ id: c.req.param('id') });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/bookmarks', apiAuth('bookmarks:read'), async (c) => {
  const parsedQuery = BookmarkQuerySchema.safeParse({
    provider: c.req.query('provider'),
    contentType: c.req.query('contentType'),
  });

  if (!parsedQuery.success) {
    return c.json(
      {
        error: 'Invalid query parameters',
        code: 'INVALID_QUERY_PARAMETERS',
        issues: parsedQuery.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');
  const search = c.req.query('search')?.trim();
  const isFinished = parseBoolean(c.req.query('isFinished'));

  const result = await caller.items.library({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
    search: search && search.length > 0 ? search : undefined,
    filter: {
      provider: parsedQuery.data.provider,
      contentType: parsedQuery.data.contentType,
      isFinished,
    },
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/bookmarks/opened', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');
  const result = await caller.items.recentlyOpened({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/bookmarks/quick-wins', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');
  const result = await caller.items.quickWins({
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/collections/:id/items', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));
  const cursor = c.req.query('cursor');
  const result = await caller.collections.items({
    id: c.req.param('id'),
    limit: parseLimit(c.req.query('limit')),
    cursor: cursor && cursor.length > 0 ? cursor : undefined,
  });

  return c.json({
    items: result.items,
    nextCursor: result.nextCursor,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.post('/bookmarks/preview', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = PreviewBookmarkBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));

  try {
    const preview = await caller.bookmarks.preview({ url: parsedBody.data.url });

    if (!preview) {
      return c.json(
        {
          error: 'URL could not be previewed',
          code: 'UNSUPPORTED_URL',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        422
      );
    }

    return c.json({
      item: toPreviewItem(preview),
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/bookmarks', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = SaveBookmarkBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));
  const preview = await caller.bookmarks.preview({ url: parsedBody.data.url });

  if (!preview) {
    return c.json(
      {
        error: 'URL could not be previewed',
        code: 'UNSUPPORTED_URL',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      422
    );
  }

  try {
    const bookmark = await caller.bookmarks.save({
      ...preview,
      url: parsedBody.data.url,
      tags: parsedBody.data.tags,
    });

    return c.json({
      bookmark,
      item: toPreviewItem(preview),
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/bookmarks/:id', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const item = await caller.items.get({ id: c.req.param('id') });
    return c.json({
      item,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.patch('/bookmarks/:id', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = FinishBookmarkBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const bookmarkId = c.req.param('id');
  const userId = c.get('userId');
  if (!userId) {
    return c.json(
      {
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      401
    );
  }

  const db = createDb(c.env.DB);
  const bookmark = await db.query.userItems.findFirst({
    where: and(
      eq(userItems.id, bookmarkId),
      eq(userItems.userId, userId),
      eq(userItems.state, UserItemState.BOOKMARKED)
    ),
  });

  if (!bookmark) {
    return c.json(
      {
        error: 'Bookmark not found',
        code: 'BOOKMARK_NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }

  const isFinished = getRequestedFinishedState(parsedBody.data);
  const finishedAt = isFinished ? (bookmark.finishedAt ?? new Date().toISOString()) : null;

  if (bookmark.isFinished !== isFinished) {
    const now = Date.now();

    await db
      .update(userItems)
      .set({
        isFinished,
        finishedAt,
        updatedAt: new Date(now).toISOString(),
      })
      .where(eq(userItems.id, bookmarkId));

    await db.insert(userItemConsumptionEvents).values({
      id: ulid(),
      userId,
      userItemId: bookmark.id,
      itemId: bookmark.itemId,
      eventType: isFinished ? 'FINISHED' : 'UNFINISHED',
      occurredAt: now,
      positionSeconds: null,
      durationSeconds: null,
      deltaSeconds: null,
      source: 'MANUAL_FINISH_TOGGLE',
      metadata: JSON.stringify({ source: 'api_v1' }),
    });
  }

  return c.json({
    bookmark: {
      id: bookmark.id,
      itemId: bookmark.itemId,
      isFinished,
      finishedAt,
    },
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.delete('/bookmarks/:id', apiAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.unbookmark({ id: c.req.param('id') });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.put('/bookmarks/:id/tags', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = SetTagsBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.setTags({
      id: c.req.param('id'),
      tags: parsedBody.data.tags,
    });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.post('/bookmarks/:id/opened', apiAuth('bookmarks:write'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.markOpened({ id: c.req.param('id') });
    return c.json({
      ...result,
      lastOpenedAt: 'lastOpenedAt' in result ? result.lastOpenedAt : null,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.put('/bookmarks/:id/progress', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsedBody = UpdateProgressBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return c.json(
      {
        error: 'Invalid request body',
        code: 'INVALID_REQUEST_BODY',
        issues: parsedBody.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }

  const caller = appRouter.createCaller(await createContext(c));

  try {
    const result = await caller.items.updateProgress({
      id: c.req.param('id'),
      position: parsedBody.data.position,
      duration: parsedBody.data.duration,
    });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/bookmarks/:id/article-content', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  try {
    const item = await caller.items.get({ id: c.req.param('id') });
    const result = await caller.items.getArticleContent({ itemId: item.itemId });
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    return trpcErrorResponse(c, error);
  }
});

apiV1Routes.get('/tags', apiAuth('bookmarks:read'), async (c) => {
  const caller = appRouter.createCaller(await createContext(c));

  const result = await caller.items.listTags();
  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/editorial/today', apiAuth('bookmarks:read'), async (c) => {
  const result = await getEditorialToday(c.env.DB, c.env.ARTICLE_CONTENT, c.get('userId')!);
  return c.json({
    ...result,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/editorial/experiments', apiAuth('bookmarks:read'), async (c) => {
  const experiments = await listEditorialExperiments(
    c.env.DB,
    c.get('userId')!,
    parseLimit(c.req.query('limit'))
  );
  return c.json({ experiments, requestId: c.get('requestId'), traceId: c.get('traceId') });
});

apiV1Routes.post('/editorial/experiments', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await createEditorialExperiment(c.env.DB, c.get('userId')!, parsed.data);
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.get('/editorial/experiments/:id', apiAuth('bookmarks:read'), async (c) => {
  try {
    const experiment = await getEditorialExperiment(c.env.DB, c.get('userId')!, c.req.param('id'));
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.patch('/editorial/experiments/:id', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UpdateEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment update',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const experiment = await updateEditorialExperiment(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/lock', apiAuth('bookmarks:write'), async (c) => {
  try {
    const experiment = await lockEditorialExperiment(c.env.DB, c.get('userId')!, c.req.param('id'));
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/failure', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = FailEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment failure',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const experiment = await failEditorialExperiment(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/abandon', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = AbandonEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment abandonment',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const experiment = await abandonEditorialExperiment(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json({ experiment, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/variants', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PublishEditorialExperimentVariantSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment variant',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await publishEditorialExperimentVariant(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.get(
  '/editorial/experiments/:id/variants/:variantId',
  apiAuth('bookmarks:read'),
  async (c) => {
    try {
      const result = await getEditorialExperimentVariantPreview(
        c.env.DB,
        c.env.ARTICLE_CONTENT,
        c.get('userId')!,
        c.req.param('id'),
        c.req.param('variantId')
      );
      const requestId = c.get('requestId');
      const traceId = c.get('traceId');
      return c.json({
        ...result,
        preview: { ...result.preview, requestId, traceId },
        requestId,
        traceId,
      });
    } catch (error) {
      return editorialExperimentErrorResponse(c, error);
    }
  }
);

apiV1Routes.post('/editorial/experiments/:id/decision', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = ReviewEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment review',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await reviewEditorialExperiment(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.duplicate ? 200 : 201
    );
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/experiments/:id/promote', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PromoteEditorialExperimentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial experiment promotion',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await promoteEditorialExperiment(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data.variantId
    );
    return c.json({ ...result, requestId: c.get('requestId'), traceId: c.get('traceId') });
  } catch (error) {
    return editorialExperimentErrorResponse(c, error);
  }
});

apiV1Routes.post('/editorial/runs', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = StartEditorialRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial run',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await startEditorialRun(c.env.DB, c.get('userId')!, parsed.data);
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    if (error instanceof EditorialRunConflictError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITORIAL_RUN_CONFLICT',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        409
      );
    }
    throw error;
  }
});

apiV1Routes.post('/editorial/runs/:id/failure', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = FailEditorialRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial run failure',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await failEditorialRun(
      c.env.DB,
      c.get('userId')!,
      c.req.param('id'),
      parsed.data
    );
    return c.json({
      ...result,
      requestId: c.get('requestId'),
      traceId: c.get('traceId'),
    });
  } catch (error) {
    if (error instanceof EditorialRunNotFoundError) {
      return c.json(
        {
          error: error.message,
          code: 'NOT_FOUND',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }
    if (error instanceof EditorialRunConflictError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITORIAL_RUN_CONFLICT',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        409
      );
    }
    throw error;
  }
});

apiV1Routes.get('/editorial/feedback/profile', apiAuth('bookmarks:read'), async (c) => {
  const profile = await getEditorialFeedbackProfile(c.env.DB, c.get('userId')!);
  return c.json({
    profile,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.post('/editorial/feedback', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = CreateEditorialFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial feedback',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  const edition = await getEditorialEdition(
    c.env.DB,
    c.env.ARTICLE_CONTENT,
    c.get('userId')!,
    parsed.data.editionId
  );
  if (!edition) {
    return c.json(
      {
        error: 'Edition not found',
        code: 'NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }
  try {
    const result = await recordEditorialFeedback(
      c.env.DB,
      c.get('userId')!,
      edition.edition,
      parsed.data
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.duplicate ? 200 : 201
    );
  } catch (error) {
    if (error instanceof EditorialFeedbackConflictError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITORIAL_FEEDBACK_CONFLICT',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        409
      );
    }
    if (error instanceof EditorialFeedbackTargetError) {
      return c.json(
        {
          error: error.message,
          code: 'INVALID_EDITORIAL_TARGET',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }
    throw error;
  }
});

apiV1Routes.get('/editorial/editions', apiAuth('bookmarks:read'), async (c) => {
  const editions = await listEditorialEditions(
    c.env.DB,
    c.get('userId')!,
    parseLimit(c.req.query('limit'))
  );
  return c.json({ editions, requestId: c.get('requestId'), traceId: c.get('traceId') });
});

apiV1Routes.get('/editorial/editions/latest', apiAuth('bookmarks:read'), async (c) => {
  const result = await getEditorialEdition(c.env.DB, c.env.ARTICLE_CONTENT, c.get('userId')!);
  if (!result) {
    return c.json(
      {
        error: 'Edition not found',
        code: 'NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }
  return c.json({
    edition: result.edition,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get('/editorial/editions/:id', apiAuth('bookmarks:read'), async (c) => {
  const result = await getEditorialEdition(
    c.env.DB,
    c.env.ARTICLE_CONTENT,
    c.get('userId')!,
    c.req.param('id')
  );
  if (!result) {
    return c.json(
      {
        error: 'Edition not found',
        code: 'NOT_FOUND',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      404
    );
  }
  return c.json({
    edition: result.edition,
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
});

apiV1Routes.get(
  '/editorial/editions/:id/artifacts/:artifact',
  apiAuth('bookmarks:read'),
  async (c) => {
    const artifact = c.req.param('artifact');
    if (!['markdown', 'snapshot', 'validation', 'candidates'].includes(artifact)) {
      return c.json(
        {
          error: 'Unknown artifact',
          code: 'NOT_FOUND',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }
    const object = await getEditorialArtifact(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      c.req.param('id'),
      artifact as 'markdown' | 'snapshot' | 'validation' | 'candidates'
    );
    if (!object) {
      return c.json(
        {
          error: 'Artifact not found',
          code: 'NOT_FOUND',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        404
      );
    }
    return new Response(object.body, {
      headers: { 'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream' },
    });
  }
);

apiV1Routes.post('/editorial/editions', apiAuth('bookmarks:write'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = PublishEditorialEditionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Invalid editorial edition',
        code: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  }
  try {
    const result = await storeEditorialEdition(
      c.env.DB,
      c.env.ARTICLE_CONTENT,
      c.get('userId')!,
      parsed.data
    );
    return c.json(
      { ...result, requestId: c.get('requestId'), traceId: c.get('traceId') },
      result.created ? 201 : 200
    );
  } catch (error) {
    if (error instanceof EditorialConflictError || error instanceof EditorialRunConflictError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITION_CONFLICT',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        409
      );
    }
    if (error instanceof EditorialValidationError) {
      return c.json(
        {
          error: error.message,
          code: 'EDITORIAL_VALIDATION_FAILED',
          requestId: c.get('requestId'),
          traceId: c.get('traceId'),
        },
        400
      );
    }
    throw error;
  }
});

export default apiV1Routes;
