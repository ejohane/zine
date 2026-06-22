import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ulid } from 'ulid';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { apiTokens, users } from '../../db/schema';
import {
  ApiTokenScopesSchema,
  generateApiToken,
  getApiTokenPrefix,
  hashApiToken,
  toApiTokenSummary,
} from '../../lib/api-tokens';

const CreateApiTokenInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: ApiTokenScopesSchema,
});

const RevokeApiTokenInputSchema = z.object({
  id: z.string().min(1),
});

export const apiTokensRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tokens = await ctx.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.userId, ctx.userId))
      .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id));

    return {
      tokens: tokens.map(toApiTokenSummary),
    };
  }),

  create: protectedProcedure.input(CreateApiTokenInputSchema).mutation(async ({ ctx, input }) => {
    const now = Date.now();
    const rawToken = generateApiToken();
    const tokenHash = await hashApiToken(rawToken);
    const tokenId = ulid();

    await ctx.db
      .insert(users)
      .values({
        id: ctx.userId,
        email: null,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      })
      .onConflictDoNothing();

    await ctx.db.insert(apiTokens).values({
      id: tokenId,
      userId: ctx.userId,
      name: input.name,
      tokenHash,
      tokenPrefix: getApiTokenPrefix(rawToken),
      scopesJson: JSON.stringify(input.scopes),
      createdAt: now,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
    });

    const token = await ctx.db.query.apiTokens.findFirst({
      where: and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, ctx.userId)),
    });

    if (!token) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    }

    return {
      token: toApiTokenSummary(token),
      rawToken,
    };
  }),

  revoke: protectedProcedure.input(RevokeApiTokenInputSchema).mutation(async ({ ctx, input }) => {
    const now = Date.now();
    const result = await ctx.db
      .update(apiTokens)
      .set({ revokedAt: now })
      .where(
        and(
          eq(apiTokens.id, input.id),
          eq(apiTokens.userId, ctx.userId),
          isNull(apiTokens.revokedAt)
        )
      )
      .returning({ id: apiTokens.id });

    if (result.length === 0) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'API token not found' });
    }

    return { success: true as const };
  }),
});

export type ApiTokensRouter = typeof apiTokensRouter;
