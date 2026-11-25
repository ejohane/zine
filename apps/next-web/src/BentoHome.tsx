import { useEffect, useMemo, useState } from 'react';
import { Bento } from '@zine/next-ui';
import type { CardItem } from '@zine/next-ui';
import '@fontsource-variable/inter';
import '@zine/next-design/tokens.css';
import '@zine/next-ui/cards.css';
import '@zine/next-ui/bento.css';
import { toBentoSections } from './bentoSections';
import type { BentoSection } from './bentoSections';
import type { Home, RemoteItem } from './live-api';

type Shape = { width: number; height: number } | 'missing';

/**
 * `/v1/home` does not say how big a picture is, and a post card lays out differently for wide
 * and tall pictures. This loads each post picture once and reports its real shape.
 */
function usePostPictureShapes(sections: BentoSection[]) {
  const [shapes, setShapes] = useState<Record<string, Shape>>({});
  const urls = useMemo(
    () =>
      [
        ...new Set(
          sections.flatMap((section) =>
            section.items.flatMap((item) =>
              item.kind === 'post' && item.picture ? [item.picture.url] : []
            )
          )
        ),
      ]
        .sort()
        .join('\n'),
    [sections]
  );
  useEffect(() => {
    let active = true;
    for (const url of urls ? urls.split('\n') : []) {
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
  }, [urls]);
  return shapes;
}

function withShape(item: CardItem, shapes: Record<string, Shape>): CardItem {
  if (item.kind !== 'post' || !item.picture) return item;
  const shape = shapes[item.picture.url];
  if (!shape) return item;
  if (shape === 'missing' || !shape.width || !shape.height) return { ...item, picture: undefined };
  return { ...item, picture: { ...item.picture, ...shape } };
}

/**
 * Home: the sections `/v1/home` composed, as bentos of Zine Next cards, followed by the rest of
 * the loaded library. A card opens the original in a new tab; its three dots open the item here.
 */
export function BentoHome({
  home,
  items,
  open,
}: {
  home: Home | undefined;
  items: RemoteItem[];
  open: (id: string) => void;
}) {
  const sections = useMemo(() => toBentoSections(home, items), [home, items]);
  const shapes = usePostPictureShapes(sections);
  return (
    <div className="bento-home" aria-label="Home">
      {sections.map((section) => (
        <section key={section.id} className="bento-section" aria-labelledby={'home-' + section.id}>
          <h2 id={'home-' + section.id}>{section.title}</h2>
          <Bento
            items={section.items.map((item) => withShape(item, shapes))}
            onAction={(item) => open(item.id)}
            newTab
          />
        </section>
      ))}
    </div>
  );
}
