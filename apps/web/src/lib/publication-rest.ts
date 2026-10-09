import { z } from 'zod';
import { PublicationSubscriptionSchema } from '@zine/shared';
import type { PublicationIntent } from './publication-continuation';
export async function performPublicationIntent(
  intent: PublicationIntent,
  token: string,
  send: typeof fetch = fetch
): Promise<void> {
  const path =
    intent.action === 'save'
      ? `/api/v1/issues/${intent.issueId}/selections/${intent.selectionId}/save`
      : `/api/v1/publications/${intent.publicationId}/subscription`;
  const response = await send(path, {
    method: intent.action === 'save' ? 'POST' : 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Idempotency-Key': intent.key },
    cache: 'no-store',
  });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? 'This selection is no longer available.'
        : response.status === 401 || response.status === 403
          ? 'Your session expired. Sign in again to continue.'
          : 'Could not complete this action. Please try again.'
    );
  if (intent.action === 'subscribe') {
    const body = await response.json();
    z.object({ subscription: PublicationSubscriptionSchema }).parse(body);
  }
}
