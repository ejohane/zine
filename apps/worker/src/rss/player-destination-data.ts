import { z } from 'zod';
import type { PodcastPlayer, PlayerDestination } from './player-destinations';

const destinationSchema = z.object({ kind: z.enum(['episode', 'show']), url: z.string().url() });
const savedSchema = z.object({
  destinations: z.object({
    OVERCAST: destinationSchema.optional(),
    APPLE_PODCASTS: destinationSchema.optional(),
    POCKET_CASTS: destinationSchema.optional(),
  }),
  nextAttemptAt: z.number().nullable(),
  attempts: z.number().default(0),
});
export type SavedPlayerLinks = Partial<Record<PodcastPlayer, PlayerDestination>>;

export function readState(raw: string | null | undefined) {
  try {
    return savedSchema.parse(JSON.parse(raw ?? 'null'));
  } catch {
    return null;
  }
}
export function savedPlayerLinks(raw: string | null | undefined): SavedPlayerLinks {
  return readState(raw)?.destinations ?? {};
}
