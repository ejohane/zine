import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppSession } from '../lib/trpc';
import {
  clearIntent,
  readIntent,
  storeIntent,
  type PublicationIntent,
} from '../lib/publication-continuation';
import { performPublicationIntent } from '../lib/publication-rest';
import { ArchiveSchema, loadReader, type ReaderData } from './model';
import { PublicReader, type ReaderAction } from './reader';

export function PublicPage({ initial }: { initial?: ReaderData }) {
  const location = useLocation();
  const session = useAppSession();
  const [data, setData] = useState<ReaderData | null>(initial || null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const running = useRef(false);
  const loadedPath = useRef(initial ? location.pathname : null);
  useEffect(() => {
    if (loadedPath.current === location.pathname) return;
    let cancelled = false;
    setData(null);
    void loadReader(location.pathname, (path) => fetch(path, { cache: 'no-store' })).then(
      (result) => {
        if (!cancelled) {
          loadedPath.current = location.pathname;
          setData(result.data);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [location.pathname]);
  const execute = useCallback(
    async (intent: PublicationIntent) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setMessage('');
      try {
        const token = await session.getToken();
        if (!token) throw new Error('Sign in to finish this action.');
        await performPublicationIntent(intent, token);
        clearIntent();
        setMessage(
          intent.action === 'save'
            ? 'Saved to your Library.'
            : 'Subscribed. You’ll hear when a new issue is published.'
        );
        window.history.replaceState(null, '', location.pathname + location.hash);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not complete this action. Please try again.'
        );
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [session, location.pathname, location.hash]
  );
  useEffect(() => {
    const intent = readIntent();
    if (!session.isLoaded || !session.isSignedIn || !intent || !data || data.type === 'unavailable')
      return;
    if (new URLSearchParams(location.search).get('continue') !== intent.key) return;
    const publicationId = data.type === 'issue' ? data.issue.publication.id : data.publication.id;
    if (
      publicationId !== intent.publicationId ||
      (intent.issueId && (data.type !== 'issue' || data.issue.id !== intent.issueId))
    )
      return;
    if (
      intent.action === 'save' &&
      data.type === 'issue' &&
      !data.issue.sections.some((section) =>
        section.selections.some((s) => s.id === intent.selectionId)
      )
    ) {
      setMessage('This selection is no longer available.');
      clearIntent();
      return;
    }
    void execute(intent);
  }, [session.isLoaded, session.isSignedIn, data, location.search, execute]);
  const action = (value: ReaderAction) => {
    try {
      const previous = readIntent();
      const intent =
        previous &&
        previous.action === value.action &&
        previous.publicationId === value.publicationId &&
        previous.selectionId === value.selectionId &&
        previous.issueId === value.issueId
          ? previous
          : storeIntent(value);
      if (!session.isLoaded || !session.isSignedIn) {
        window.location.assign(`/sign-in?continue=${intent.key}`);
        return;
      }
      void execute(intent);
    } catch {
      setMessage('Allow session storage to sign in and save your selection.');
    }
  };
  const more = async () => {
    if (data?.type !== 'publication' || !data.nextCursor || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `/api/v1/publications/${data.publication.id}/issues?cursor=${encodeURIComponent(data.nextCursor)}`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error('Could not load more issues. Please try again.');
      const next = ArchiveSchema.parse(await response.json());
      setData({
        ...data,
        issues: [
          ...data.issues,
          ...next.issues.filter(
            (issue) => !data.issues.some((existing) => existing.id === issue.id)
          ),
        ],
        nextCursor: next.nextCursor,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load more issues.');
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <main className="publication-reader" aria-busy="true">
        <p role="status">Opening this Zine…</p>
      </main>
    );
  return (
    <PublicReader
      data={data}
      busy={busy}
      message={message}
      onAction={action}
      onMore={() => void more()}
    />
  );
}
