import { FileText, Headphones, Inbox, LayoutGrid, MessageSquare, Play } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { sections } from './model';
import type { Section } from './model';

const tabs: Record<Section, [string, LucideIcon]> = {
  Home: ['All', LayoutGrid],
  Podcasts: ['Podcasts', Headphones],
  Articles: ['Articles', FileText],
  Videos: ['Videos', Play],
  Posts: ['Posts', MessageSquare],
};
const order: Section[] = ['Home', 'Articles', 'Videos', 'Podcasts', 'Posts'];

/** The format filters as tabs, plus a way into the inbox. Names only: Erik asked for no counts. */
export function LibraryTabs({
  section,
  choose,
  openInbox,
}: {
  section: Section;
  choose: (next: Section) => void;
  openInbox: () => void;
}) {
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
              </span>
            </button>
          );
        })}
      <button type="button" onClick={openInbox}>
        <Inbox aria-hidden="true" />
        <span>
          <small>Inbox</small>
        </span>
      </button>
    </nav>
  );
}
