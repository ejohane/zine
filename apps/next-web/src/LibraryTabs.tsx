import { FileText, Headphones, Inbox, LayoutGrid, MessageSquare, Play } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { sections } from './model';
import type { Section } from './model';
import { sectionCount } from './spotlight';
import type { Home } from './live-api';

const tabs: Record<Section, [string, LucideIcon]> = {
  Home: ['All', LayoutGrid],
  Podcasts: ['Podcasts', Headphones],
  Articles: ['Articles', FileText],
  Videos: ['Videos', Play],
  Posts: ['Posts', MessageSquare],
};
const order: Section[] = ['Home', 'Articles', 'Videos', 'Podcasts', 'Posts'];

/**
 * The format filters as tabs that say how much is behind them, plus a way into the inbox. The
 * numbers come with Home; until it has loaded (or from an older saved copy) the tabs show names
 * only.
 */
export function LibraryTabs({
  section,
  choose,
  counts,
  openInbox,
}: {
  section: Section;
  choose: (next: Section) => void;
  counts: Home['counts'];
  openInbox: () => void;
}) {
  const number = (value: number | undefined) =>
    value === undefined ? null : <b>{value.toLocaleString('en-US')}</b>;
  return (
    <nav className="sp-tabs" aria-label="Content filters">
      <span className="sp-tabs__mark" aria-hidden="true">
        Z
      </span>
      {order
        .filter((id) => sections.includes(id))
        .map((id) => {
          const [label, Icon] = tabs[id];
          return (
            <button key={id} type="button" aria-pressed={section === id} onClick={() => choose(id)}>
              <Icon aria-hidden="true" />
              <span>
                <small>{label}</small>
                {number(sectionCount(counts, id))}
              </span>
            </button>
          );
        })}
      <button type="button" onClick={openInbox}>
        <Inbox aria-hidden="true" />
        <span>
          <small>Inbox</small>
          {number(counts?.inbox)}
        </span>
      </button>
    </nav>
  );
}
