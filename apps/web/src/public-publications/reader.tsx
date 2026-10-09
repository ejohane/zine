import { Typography } from '@zine/design-system';
import { Button } from '../components';
import { typographyStyle } from '../lib/utils';
import type { ReaderData } from './model';
import { publicCover, safeLink } from './model';

export type ReaderAction = {
  action: 'save' | 'subscribe';
  publicationId: string;
  issueId?: string;
  selectionId?: string;
};
const titleStyle = typographyStyle(Typography.displayLarge);
const bodyStyle = typographyStyle(Typography.bodyLarge);
export function PublicReader({
  data,
  onAction,
  busy = false,
  message,
  onMore,
}: {
  data: ReaderData;
  onAction?: (action: ReaderAction) => void;
  busy?: boolean;
  message?: string;
  onMore?: () => void;
}) {
  const publication =
    data.type === 'issue'
      ? data.issue.publication
      : data.type === 'publication'
        ? data.publication
        : null;
  const issue = data.type === 'issue' ? data.issue : null;
  const cover = publicCover(issue?.coverUrl || publication?.coverUrl || null);
  return (
    <main className="publication-reader">
      <header className="publication-reader__masthead">
        <a href="/about/" aria-label="About Zine">
          <img src="/zine-logo.png" width="32" height="32" alt="Zine" />
        </a>
        {publication && <a href={`/p/${publication.id}`}>{publication.displayName}</a>}
      </header>
      {data.type === 'unavailable' ? (
        <section className="publication-reader__intro">
          <h1 style={titleStyle}>
            {data.temporary ? 'This issue is taking a moment.' : 'This publication is unavailable.'}
          </h1>
          <p>
            {data.temporary
              ? 'Please try again shortly.'
              : 'The link may have been removed or is not published yet.'}
          </p>
          {data.temporary && <a href="">Try again</a>}
        </section>
      ) : (
        <>
          <section className="publication-reader__intro">
            {cover && <img className="publication-reader__cover" src={cover} alt="" />}
            <h1 style={titleStyle}>{issue?.title || publication!.displayName}</h1>
            <p className="publication-reader__byline">
              Edited by {publication!.editor.displayName}
              {issue?.publishedAt && (
                <>
                  {' '}
                  ·{' '}
                  <time dateTime={issue.publishedAt}>
                    {new Date(issue.publishedAt).toISOString().slice(0, 10)}
                  </time>
                </>
              )}
            </p>
            {(issue?.introduction || (!issue && publication!.description)) && (
              <p className="publication-reader__introduction" style={bodyStyle}>
                {issue?.introduction || publication!.description}
              </p>
            )}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                onAction?.({
                  action: 'subscribe',
                  publicationId: publication!.id,
                  ...(issue ? { issueId: issue.id } : {}),
                })
              }
            >
              Subscribe to {publication!.displayName}
            </Button>
            <p className="publication-reader__status" role="status" aria-live="polite">
              {message || ''}
            </p>
            <noscript>
              <p>
                Reading is available without JavaScript. Enable JavaScript to save selections or
                subscribe.
              </p>
            </noscript>
          </section>
          {issue ? (
            issue.sections.map((section) => (
              <section
                className="publication-reader__section"
                key={section.id}
                aria-label={section.heading || 'Selections'}
              >
                {section.heading && (
                  <h2 style={typographyStyle(Typography.headlineSmall)}>{section.heading}</h2>
                )}
                {section.selections.map((selection) => (
                  <article
                    id={`selection-${selection.id}`}
                    className="publication-reader__selection"
                    key={selection.id}
                  >
                    {safeLink(selection.artworkUrl) && (
                      <img
                        className="publication-reader__artwork"
                        src={safeLink(selection.artworkUrl)}
                        alt=""
                        loading="lazy"
                      />
                    )}
                    <div>
                      <p
                        className="publication-reader__source"
                        style={typographyStyle(Typography.bodySmall)}
                      >
                        {selection.contentType.toLowerCase()} · {selection.sourceName}
                      </p>
                      {section.heading ? (
                        <h3 style={typographyStyle(Typography.headlineSmall)}>
                          <a href={safeLink(selection.originalUrl)} rel="noopener noreferrer">
                            {selection.title}
                          </a>
                        </h3>
                      ) : (
                        <h2 style={typographyStyle(Typography.headlineSmall)}>
                          <a href={safeLink(selection.originalUrl)} rel="noopener noreferrer">
                            {selection.title}
                          </a>
                        </h2>
                      )}
                      <p className="publication-reader__byline">{selection.creatorName}</p>
                      {selection.commentary && (
                        <p className="publication-reader__commentary" style={bodyStyle}>
                          {selection.commentary}
                        </p>
                      )}
                      {selection.originalAvailability === 'UNAVAILABLE' && (
                        <p>The original is currently unavailable.</p>
                      )}
                      <div className="publication-reader__actions">
                        <a href={safeLink(selection.originalUrl)} rel="noopener noreferrer">
                          Open original
                        </a>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            onAction?.({
                              action: 'save',
                              publicationId: publication!.id,
                              issueId: issue.id,
                              selectionId: selection.id,
                            })
                          }
                        >
                          Save to Zine
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            ))
          ) : (
            <section className="publication-reader__section">
              <h2 style={typographyStyle(Typography.headlineSmall)}>Issues</h2>
              {data.type === 'publication' &&
                (data.issues.length ? (
                  data.issues.map((item) => (
                    <article className="publication-reader__archive" key={item.id}>
                      <a href={`/i/${item.id}`}>
                        <h3 style={typographyStyle(Typography.headlineSmall)}>{item.title}</h3>
                      </a>
                      <p>{item.introduction}</p>
                      <p className="publication-reader__byline">
                        {item.kind === 'WEEKLY' ? 'Weekly issue' : 'Independent issue'}
                      </p>
                    </article>
                  ))
                ) : (
                  <p>No issues published yet.</p>
                ))}
              {data.type === 'publication' && data.nextCursor && (
                <a
                  href={`/p/${data.publication.id}?cursor=${encodeURIComponent(data.nextCursor)}`}
                  aria-disabled={busy}
                  onClick={
                    onMore
                      ? (event) => {
                          event.preventDefault();
                          if (!busy) onMore();
                        }
                      : undefined
                  }
                >
                  More issues
                </a>
              )}
            </section>
          )}
        </>
      )}
      <footer className="publication-reader__footer">
        <a href="/about/">Made with Zine</a>
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
      </footer>
    </main>
  );
}
