import { useEffect, useMemo, useState } from 'react';
import { Bento } from '@zine/next-ui';
import type { CardItem } from '@zine/next-ui';
import '@fontsource-variable/inter';
import '@zine/next-design/tokens.css';
import '@zine/next-ui/cards.css';
import '@zine/next-ui/bento.css';
import './bento-home.css';
import { toBentoSections } from './bentoSections';
import type { BentoSection } from './bentoSections';
import { message } from './live-api';
import type { Home } from './live-api';

/** The preview lives at /next/?view=bento so the current Home stays as it is. */
export const isBentoView = () => new URLSearchParams(location.search).get('view') === 'bento';

type Shape = { width: number; height: number } | 'missing';

/**
 * `/v1/home` does not say how big a picture is, and a post card lays out differently for wide
 * and tall pictures. This loads each post picture once and reports its real shape.
 */
function usePostPictureShapes(sections: BentoSection[]) {
  const [shapes, setShapes] = useState<Record<string, Shape>>({});
  useEffect(() => {
    let active = true;
    const urls = new Set(
      sections.flatMap((section) =>
        section.items.flatMap((item) =>
          item.kind === 'post' && item.picture ? [item.picture.url] : []
        )
      )
    );
    for (const url of urls) {
      const image = new Image();
      const report = (shape: Shape) => {
        if (active) setShapes((previous) => ({ ...previous, [url]: shape }));
      };
      image.onload = () => report({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => report('missing');
      image.src = url;
    }
    return () => {
      active = false;
    };
  }, [sections]);
  return shapes;
}

function withShape(item: CardItem, shapes: Record<string, Shape>): CardItem {
  if (item.kind !== 'post' || !item.picture) return item;
  const shape = shapes[item.picture.url];
  if (!shape) return item;
  if (shape === 'missing' || !shape.width || !shape.height) return { ...item, picture: undefined };
  return { ...item, picture: { ...item.picture, ...shape } };
}

export function BentoHome({ load }: { load: () => Promise<Home> }) {
  const [home, setHome] = useState<Home>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    load().then(
      (result) => active && setHome(result),
      (failure) => active && setError(message(failure))
    );
    return () => {
      active = false;
    };
    // `load` is a fresh function on every render; only a retry should fetch again.
  }, [attempt]);
  useEffect(() => {
    document.documentElement.classList.add('bento-view');
    return () => document.documentElement.classList.remove('bento-view');
  }, []);

  const sections = useMemo(() => (home ? toBentoSections(home) : []), [home]);
  const shapes = usePostPictureShapes(sections);

  return (
    <main className="bento-page">
      <div className="bento-page__inner">
        <header className="bento-page__header">
          <h1>Home</h1>
          <a className="bento-page__back" href={location.pathname}>
            Current Home
          </a>
        </header>
        {error ? (
          <div role="alert">
            <p className="bento-page__status">{error}</p>
            <button
              type="button"
              className="bento-page__retry"
              onClick={() => setAttempt((count) => count + 1)}
            >
              Try again
            </button>
          </div>
        ) : !home ? (
          <p className="bento-page__status" role="status">
            Opening your Home…
          </p>
        ) : sections.length === 0 ? (
          <p className="bento-page__status">Nothing saved yet.</p>
        ) : (
          sections.map((section) => (
            <section key={section.id} className="bento-section" aria-labelledby={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              <Bento items={section.items.map((item) => withShape(item, shapes))} />
            </section>
          ))
        )}
      </div>
    </main>
  );
}
