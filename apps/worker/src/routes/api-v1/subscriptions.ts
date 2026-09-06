import { Provider, SubscriptionStatus } from '@zine/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { createContext } from '../../trpc/context';
import { appRouter } from '../../trpc/router';
import type { Env } from '../../types';
import { apiAuth } from './auth';
import { trpcErrorResponse } from './errors';

const apiV1Routes = new Hono<Env>();

const AddProviderSubscriptionBodySchema = z
  .object({
    channelId: z.string().min(1),
    name: z.string().min(1).optional(),
    imageUrl: z.string().url().optional(),
  })
  .strict();

const UpdateProviderSubscriptionBodySchema = z
  .object({
    action: z.enum(['pause', 'resume', 'auto_bookmark_on', 'auto_bookmark_off']),
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
    action: z.enum(['activate', 'hide', 'auto_bookmark_on', 'auto_bookmark_off']),
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
    action: z.enum(['pause', 'resume', 'auto_bookmark_on', 'auto_bookmark_off']),
  })
  .strict();

const UpdateXBookmarkSettingsBodySchema = z
  .object({
    dailySyncEnabled: z.boolean(),
  })
  .strict();

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
        autoBookmark: subscription.autoBookmark,
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
    const result = parsedBody.data.action.startsWith('auto_bookmark')
      ? await caller.subscriptions.setAutoBookmark({
          ...input,
          enabled: parsedBody.data.action === 'auto_bookmark_on',
        })
      : parsedBody.data.action === 'pause'
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
          autoBookmark: subscription.autoBookmark,
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
      const result = parsedBody.data.action.startsWith('auto_bookmark')
        ? await caller.subscriptions.setAutoBookmark({
            ...input,
            enabled: parsedBody.data.action === 'auto_bookmark_on',
          })
        : parsedBody.data.action === 'pause'
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
    const result = parsedBody.data.action.startsWith('auto_bookmark')
      ? await caller.subscriptions.newsletters.setAutoBookmark({
          feedId: c.req.param('feedId'),
          enabled: parsedBody.data.action === 'auto_bookmark_on',
        })
      : await caller.subscriptions.newsletters.updateStatus({
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
    const result = parsedBody.data.action.startsWith('auto_bookmark')
      ? await caller.subscriptions.rss.setAutoBookmark({
          ...input,
          enabled: parsedBody.data.action === 'auto_bookmark_on',
        })
      : parsedBody.data.action === 'pause'
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

export default apiV1Routes;
