import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  authContinuation,
  clearIntent,
  intentPath,
  readIntent,
  storeIntent,
} from './publication-continuation';
import { performPublicationIntent } from './publication-rest';
import fixture from '../../../../packages/shared/src/fixtures/publications/v1.json';
describe('publication action continuation', () => {
  beforeEach(() => sessionStorage.clear());
  const selection = fixture.publicIssue.sections[0].selections[0];
  const action = {
    action: 'save' as const,
    publicationId: fixture.publicPublication.id,
    issueId: fixture.publicIssue.id,
    selectionId: selection.id,
  };
  test('retains only typed IDs and requires matching unexpired continuation', () => {
    const intent = storeIntent(action);
    expect(readIntent()).toEqual(intent);
    expect(authContinuation(`?continue=${intent.key}`)?.returnTo).toBe(intentPath(intent));
    expect(authContinuation('?continue=invalid&redirect_url=https://evil.test')).toBeNull();
    expect(readIntent(sessionStorage, intent.createdAt + 30 * 60 * 1000 + 1)).toBeNull();
  });
  test('does not trust corrupted storage or arbitrary redirect paths', () => {
    sessionStorage.setItem('zine.publication.intent.v1', '{"returnTo":"https://evil.test"}');
    expect(readIntent()).toBeNull();
    expect(authContinuation('?redirect_url=https://evil.test')).toBeNull();
    expect(() => storeIntent({ ...action, selectionId: 'forged' })).toThrow();
  });
  test('reuses caller action identity and bearer for save retry, without private metadata', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ bookmarkId: 'id' }));
    const intent = storeIntent(action);
    await performPublicationIntent(intent, 'session', send);
    await performPublicationIntent(intent, 'session', send);
    expect(send.mock.calls[0][0]).toBe(
      `/api/v1/issues/${action.issueId}/selections/${action.selectionId}/save`
    );
    expect(send.mock.calls[0][1]?.headers).toEqual({
      Authorization: 'Bearer session',
      'Idempotency-Key': intent.key,
    });
    expect(send.mock.calls[1][1]?.headers).toEqual(send.mock.calls[0][1]?.headers);
    expect(send.mock.calls[0][1]?.body).toBeUndefined();
    clearIntent();
    expect(readIntent()).toBeNull();
  });
  test('unavailable actions remain retryable and subscription validates its response', async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const intent = storeIntent(action);
    await expect(performPublicationIntent(intent, 'token', send)).rejects.toThrow(
      'no longer available'
    );
    expect(readIntent()).toEqual(intent);
    const subscribe = storeIntent({ action: 'subscribe', publicationId: action.publicationId });
    send.mockResolvedValue(
      Response.json({
        subscription: {
          publicationId: action.publicationId,
          subscribed: true,
          muted: false,
          generation: 1,
          subscribedAt: '2026-10-08T12:00:00.000Z',
        },
      })
    );
    await performPublicationIntent(subscribe, 'token', send);
    expect(send.mock.calls.at(-1)?.[1]?.method).toBe('PUT');
  });
});
