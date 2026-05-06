import { ulid } from 'ulid';
import { createHash } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { creators } from '../schema';
import type { Database } from '../index';
import type { Creator } from '@zine/shared';

export interface CreatorParams {
  provider: string;
  providerCreatorId: string;
  name: string;
  imageUrl?: string;
  description?: string;
  handle?: string;
  externalUrl?: string;
}

export function normalizeCreatorName(name: string): string {
  return name.toLowerCase().trim();
}

// Some providers only give us a display name, so we derive a stable ID from provider + name.
export function generateSyntheticCreatorId(provider: string, name: string): string {
  const normalized = normalizeCreatorName(name);
  return createHash('sha256').update(`${provider}:${normalized}`).digest('hex').substring(0, 32);
}

function shouldUpdateCreator(existing: Creator, params: CreatorParams): boolean {
  return (
    existing.name !== params.name ||
    (!existing.imageUrl && !!params.imageUrl) ||
    (!existing.description && !!params.description) ||
    (!existing.handle && !!params.handle) ||
    (!existing.externalUrl && !!params.externalUrl)
  );
}

export interface DbContext {
  db: Database;
}

export async function findOrCreateCreator(ctx: DbContext, params: CreatorParams): Promise<Creator> {
  const normalizedName = normalizeCreatorName(params.name);

  const existing = await ctx.db.query.creators.findFirst({
    where: and(
      eq(creators.provider, params.provider),
      eq(creators.providerCreatorId, params.providerCreatorId)
    ),
  });

  if (existing) {
    const existingCreator: Creator = {
      id: existing.id,
      provider: existing.provider as Creator['provider'],
      providerCreatorId: existing.providerCreatorId,
      name: existing.name,
      normalizedName: existing.normalizedName,
      imageUrl: existing.imageUrl ?? undefined,
      description: existing.description ?? undefined,
      externalUrl: existing.externalUrl ?? undefined,
      handle: existing.handle ?? undefined,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };

    if (shouldUpdateCreator(existingCreator, params)) {
      const now = Date.now();
      await ctx.db
        .update(creators)
        .set({
          name: params.name,
          normalizedName,
          imageUrl: params.imageUrl ?? existing.imageUrl,
          description: params.description ?? existing.description,
          handle: params.handle ?? existing.handle,
          externalUrl: params.externalUrl ?? existing.externalUrl,
          updatedAt: now,
        })
        .where(eq(creators.id, existing.id));

      return {
        ...existingCreator,
        name: params.name,
        normalizedName,
        imageUrl: params.imageUrl ?? existingCreator.imageUrl,
        description: params.description ?? existingCreator.description,
        handle: params.handle ?? existingCreator.handle,
        externalUrl: params.externalUrl ?? existingCreator.externalUrl,
        updatedAt: now,
      };
    }

    return existingCreator;
  }

  const id = ulid();
  const now = Date.now();
  const newCreator: Creator = {
    id,
    provider: params.provider as Creator['provider'],
    providerCreatorId: params.providerCreatorId,
    name: params.name,
    normalizedName,
    imageUrl: params.imageUrl,
    description: params.description,
    handle: params.handle,
    externalUrl: params.externalUrl,
    createdAt: now,
    updatedAt: now,
  };

  await ctx.db.insert(creators).values({
    id: newCreator.id,
    provider: newCreator.provider,
    providerCreatorId: newCreator.providerCreatorId,
    name: newCreator.name,
    normalizedName: newCreator.normalizedName,
    imageUrl: newCreator.imageUrl ?? null,
    description: newCreator.description ?? null,
    handle: newCreator.handle ?? null,
    externalUrl: newCreator.externalUrl ?? null,
    createdAt: newCreator.createdAt,
    updatedAt: newCreator.updatedAt,
  });

  return newCreator;
}

export function extractCreatorFromMetadata(
  provider: string,
  metadata: unknown
): CreatorParams | null {
  switch (provider) {
    case 'YOUTUBE':
      return extractYouTubeCreator(metadata);
    case 'SPOTIFY':
      return extractSpotifyCreator(metadata);
    case 'X':
      return extractXCreator(metadata);
    default:
      return null;
  }
}

function extractYouTubeCreator(metadata: unknown): CreatorParams | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

  const candidate = metadata as {
    snippet?: {
      channelId?: unknown;
      channelTitle?: unknown;
    };
    channelImageUrl?: unknown;
  };
  const snippet = candidate.snippet;

  if (!snippet || typeof snippet !== 'object' || Array.isArray(snippet)) return null;

  const channelId = typeof snippet.channelId === 'string' ? snippet.channelId : undefined;
  const channelTitle = typeof snippet.channelTitle === 'string' ? snippet.channelTitle : undefined;

  if (!channelId || !channelTitle) return null;

  // Get channel image from enriched metadata (added by link-preview.ts)
  const channelImageUrl =
    typeof candidate.channelImageUrl === 'string' ? candidate.channelImageUrl : undefined;

  return {
    provider: 'YOUTUBE',
    providerCreatorId: channelId,
    name: channelTitle,
    imageUrl: channelImageUrl,
  };
}
function extractSpotifyCreator(metadata: unknown): CreatorParams | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

  const candidate = metadata as {
    show?: {
      id?: unknown;
      name?: unknown;
      images?: Array<{ url?: unknown }> | unknown;
      description?: unknown;
      publisher?: unknown;
      external_urls?: {
        spotify?: unknown;
      };
    };
  };
  const show = candidate.show;

  if (!show || typeof show !== 'object' || Array.isArray(show)) return null;

  const showId = typeof show.id === 'string' ? show.id : undefined;
  const showName = typeof show.name === 'string' ? show.name : undefined;
  const images = Array.isArray(show.images) ? show.images : undefined;
  const firstImage = images?.[0];
  const showImage = firstImage && typeof firstImage.url === 'string' ? firstImage.url : undefined;
  const description = typeof show.description === 'string' ? show.description : undefined;
  const publisher = typeof show.publisher === 'string' ? show.publisher : undefined;
  const externalUrl =
    show.external_urls && typeof show.external_urls.spotify === 'string'
      ? show.external_urls.spotify
      : undefined;

  if (!showId || !showName) return null;

  return {
    provider: 'SPOTIFY',
    providerCreatorId: showId,
    name: showName,
    imageUrl: showImage,
    description: description,
    handle: publisher,
    externalUrl,
  };
}
function extractXCreator(metadata: unknown): CreatorParams | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

  const candidate = metadata as {
    author?: {
      id?: unknown;
      name?: unknown;
      username?: unknown;
      profile_image_url?: unknown;
    };
  };
  const author = candidate.author;

  if (!author || typeof author !== 'object' || Array.isArray(author)) return null;

  const authorId = typeof author.id === 'string' ? author.id : undefined;
  const authorName = typeof author.name === 'string' ? author.name : undefined;
  const authorUsername = typeof author.username === 'string' ? author.username : undefined;
  const authorImageUrl =
    typeof author.profile_image_url === 'string' ? author.profile_image_url : undefined;

  if (!authorId || !authorName) return null;

  return {
    provider: 'X',
    providerCreatorId: authorId,
    name: authorName,
    imageUrl: authorImageUrl,
    handle: authorUsername,
  };
}
