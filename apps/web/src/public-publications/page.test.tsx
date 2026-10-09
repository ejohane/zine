import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import fixture from '../../../../packages/shared/src/fixtures/publications/v1.json';
import { PublicPage } from './page';
import { ReaderDataSchema } from './model';
import { readIntent, storeIntent } from '../lib/publication-continuation';
const session = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
  getToken: vi.fn(async () => 'real-session-adapter'),
}));
vi.mock('../lib/trpc', () => ({ useAppSession: () => session }));
const initial = ReaderDataSchema.parse({ type: 'issue', issue: fixture.publicIssue });
function page(path = `/i/${fixture.publicIssue.id}`) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PublicPage initial={initial} />
    </MemoryRouter>
  );
}
describe('public reader actions', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    session.isSignedIn = true;
    session.getToken.mockResolvedValue('real-session-adapter');
  });
  test('renders full anonymous content without requesting tokens or mutating', () => {
    session.isSignedIn = false;
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    page();
    expect(screen.getByRole('heading', { name: 'Thinking about cities' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open original' })).toHaveAttribute(
      'href',
      'https://example.org/essay'
    );
    expect(send).not.toHaveBeenCalled();
    expect(session.getToken).not.toHaveBeenCalled();
  });
  test('explicit Save performs trusted REST action and clears successful intent', async () => {
    const send = vi.fn().mockResolvedValue(Response.json({ bookmarkId: 'saved' }));
    vi.stubGlobal('fetch', send);
    page();
    await userEvent.click(screen.getByRole('button', { name: 'Save to Zine' }));
    expect(await screen.findByText('Saved to your Library.')).toBeVisible();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toContain('/selections/');
    expect(readIntent()).toBeNull();
  });
  test('resumes only matching explicit intent after authentication and retains identity on retry', async () => {
    const intent = storeIntent({
      action: 'save',
      publicationId: fixture.publicPublication.id,
      issueId: fixture.publicIssue.id,
      selectionId: fixture.publicIssue.sections[0].selections[0].id,
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ bookmarkId: 'saved' }));
    vi.stubGlobal('fetch', send);
    page(`/i/${fixture.publicIssue.id}?continue=${intent.key}`);
    expect(
      await screen.findByText('Could not complete this action. Please try again.')
    ).toBeVisible();
    expect(readIntent()?.key).toBe(intent.key);
    await userEvent.click(screen.getByRole('button', { name: 'Save to Zine' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][1].headers['Idempotency-Key']).toBe(intent.key);
  });
  test('stale or forged callback cannot trigger a mutation', () => {
    storeIntent({ action: 'subscribe', publicationId: fixture.publicPublication.id });
    const send = vi.fn();
    vi.stubGlobal('fetch', send);
    page(`/i/${fixture.publicIssue.id}?continue=forged`);
    expect(send).not.toHaveBeenCalled();
  });
});
