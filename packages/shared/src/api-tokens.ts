import { z } from 'zod';

export const ApiTokenScopeSchema = z.enum(['bookmarks:read', 'bookmarks:write']);
export const ApiTokenScopesSchema = z
  .array(ApiTokenScopeSchema)
  .min(1)
  .max(2)
  .refine((scopes) => new Set(scopes).size === scopes.length, {
    message: 'Scopes must be unique',
  });

export type ApiTokenScope = z.infer<typeof ApiTokenScopeSchema>;
