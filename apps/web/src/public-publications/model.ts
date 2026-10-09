import { z } from 'zod';
import { PublicIssueSchema, PublicPublicationSchema, PublicationIdSchema } from '@zine/shared';

export const ArchiveSchema = z.object({
  issues: z.array(PublicIssueSchema),
  nextCursor: z.string().nullable(),
});
export const ReaderDataSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('issue'), issue: PublicIssueSchema }),
  z.object({
    type: z.literal('publication'),
    publication: PublicPublicationSchema,
    issues: z.array(PublicIssueSchema),
    nextCursor: z.string().nullable(),
  }),
  z.object({ type: z.literal('unavailable'), temporary: z.boolean() }),
]);
export type ReaderData = z.infer<typeof ReaderDataSchema>;
export function publicRoute(
  pathname: string
): { type: 'issue' | 'publication'; id: string } | null {
  const match = /^\/(i|p)\/([^/]+)\/?$/.exec(pathname);
  return match && PublicationIdSchema.safeParse(match[2]).success
    ? { type: match[1] === 'i' ? 'issue' : 'publication', id: match[2] }
    : null;
}
export function safeLink(value: string | null, base = 'https://myzine.app'): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function publicCover(value: string | null): string | undefined {
  return value && /^\/api\/v1\/publication-assets\/[0-9A-HJKMNP-TV-Z]{26}$/.test(value)
    ? value
    : undefined;
}
export async function loadReader(
  pathname: string,
  request: (path: string) => Promise<Response>
): Promise<{ data: ReaderData; status: number }> {
  const location = new URL(pathname, 'https://myzine.app');
  const route = publicRoute(location.pathname);
  const cursor = location.searchParams.get('cursor');
  if (!route) return { data: { type: 'unavailable', temporary: false }, status: 404 };
  try {
    const response = await request(
      `/api/v1/${route.type === 'issue' ? 'issues' : 'publications'}/${route.id}`
    );
    if (!response.ok)
      return {
        data: {
          type: 'unavailable',
          temporary: response.status !== 404 && response.status !== 410,
        },
        status: response.status === 404 || response.status === 410 ? 404 : 503,
      };
    const body = await response.json();
    if (route.type === 'issue')
      return {
        data: { type: 'issue', issue: z.object({ issue: PublicIssueSchema }).parse(body).issue },
        status: 200,
      };
    const publication = z.object({ publication: PublicPublicationSchema }).parse(body).publication;
    const archiveResponse = await request(
      `/api/v1/publications/${route.id}/issues${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`
    );
    if (!archiveResponse.ok) throw new Error('Archive unavailable');
    const archive = ArchiveSchema.parse(await archiveResponse.json());
    return { data: { type: 'publication', publication, ...archive }, status: 200 };
  } catch {
    return { data: { type: 'unavailable', temporary: true }, status: 503 };
  }
}
