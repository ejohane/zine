import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { House, Headphones, FileText, Play, MessageSquare, Plus, CheckCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { sections, progress, isComplete, resumeLabel } from './model';
import type { Section, Item, HomePresentation, Placement } from './model';
const icons: Record<Section, LucideIcon> = {
  Home: House,
  Podcasts: Headphones,
  Articles: FileText,
  Videos: Play,
  Posts: MessageSquare,
};
export function Header({
  section,
  choose,
  capture,
  showFilters = true,
  allLabel = false,
}: {
  section: Section;
  choose: (next: Section) => void;
  capture: () => void;
  showFilters?: boolean;
  allLabel?: boolean;
}) {
  const nav = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; origin: number; active: boolean } | undefined>(
    undefined
  );
  const suppressClick = useRef(false);
  useEffect(() => {
    const button = nav.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    button?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }, [section, showFilters]);
  function finish(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) return;
    if (current.active) {
      const steps = Math.round(-(event.clientX - current.x) / 64);
      choose(sections[Math.max(0, Math.min(4, current.origin + steps))]);
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    }
    drag.current = undefined;
  }
  return (
    <header className="floating-header">
      <div className="header-inner">
        {showFilters && (
          <nav
            ref={nav}
            aria-label="Content filters"
            className="filter-strip"
            onPointerDown={(e) => {
              if (e.button === 0)
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  origin: sections.indexOf(section),
                  active: false,
                };
            }}
            onPointerMove={(e) => {
              const current = drag.current;
              if (!current) return;
              const dx = e.clientX - current.x,
                dy = e.clientY - current.y;
              if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.25) {
                current.active = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                choose(sections[Math.max(0, Math.min(4, current.origin + Math.trunc(-dx / 64)))]);
              }
            }}
            onPointerUp={finish}
            onPointerCancel={() => {
              drag.current = undefined;
            }}
            onClickCapture={(e) => {
              if (suppressClick.current) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onKeyDown={(e) => {
              let index = sections.indexOf(section);
              if (e.key === 'ArrowRight') index++;
              else if (e.key === 'ArrowLeft') index--;
              else if (e.key === 'Home') index = 0;
              else if (e.key === 'End') index = 4;
              else return;
              e.preventDefault();
              const next = sections[Math.max(0, Math.min(4, index))];
              choose(next);
              nav.current?.querySelector<HTMLButtonElement>(`[data-section="${next}"]`)?.focus();
            }}
          >
            {sections.map((name) => {
              const Icon = icons[name];
              return (
                <button
                  type="button"
                  key={name}
                  data-section={name}
                  aria-pressed={section === name}
                  onClick={() => choose(name)}
                  className="filter"
                >
                  <Icon aria-hidden="true" />
                  <span>{allLabel && name === 'Home' ? 'All' : name}</span>
                </button>
              );
            })}
          </nav>
        )}
        <button
          type="button"
          className="save-button glass"
          aria-label="Save a link"
          onClick={capture}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function CreatorByline({
  author,
  image,
  icon: Icon,
}: {
  author: string;
  image?: string;
  icon: LucideIcon;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const initial = Array.from(author.trim())[0]?.toLocaleUpperCase();
  return (
    <span className="card-source">
      <span className="creator-avatar" aria-hidden="true">
        {image && image !== failedImage ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            decoding="async"
            draggable="false"
            onError={() => setFailedImage(image)}
          />
        ) : initial ? (
          initial
        ) : (
          <Icon size={11} />
        )}
      </span>
      <span className="creator-name">{author}</span>
    </span>
  );
}

export function StoryCard({
  item,
  placement,
  onOpen,
  presentation,
}: {
  item: Item;
  placement?: Omit<Placement, 'index'>;
  presentation?: HomePresentation;
  onOpen: () => void;
}) {
  const start = useRef({ x: 0, y: 0, moved: false });
  const artwork = presentation || item.section !== 'Posts' ? item.image : undefined;
  const compact = presentation === 'compact';
  const media = !!artwork && !compact;
  const Icon = icons[item.section];
  const fraction = progress(item);
  return (
    <button
      type="button"
      data-item-id={item.id}
      data-kind={item.section}
      className={`story-card ${media ? 'media-card' : 'text-card'} ${presentation ? `home-card-${presentation}` : `format-${item.section.toLowerCase()}`}`}
      style={
        placement && {
          gridColumn: `${placement.column + 1} / span ${placement.columns}`,
          gridRow: `${placement.row + 1} / span ${placement.rows}`,
        }
      }
      aria-label={`${item.section}, ${item.title}, ${item.author}, ${item.duration}${isComplete(item) ? ', finished' : ''}`}
      onPointerDown={(e) => {
        start.current = { x: e.clientX, y: e.clientY, moved: false };
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10)
          start.current.moved = true;
      }}
      onPointerCancel={() => {
        start.current.moved = true;
      }}
      onClick={(e) => {
        if (e.detail !== 0 && start.current.moved) {
          e.preventDefault();
          return;
        }
        onOpen();
      }}
    >
      {artwork && (
        <>
          <img
            src={
              artwork.startsWith('https:')
                ? artwork
                : `${import.meta.env.BASE_URL}artwork/${artwork}.jpg`
            }
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
            alt=""
            draggable="false"
          />
          {media && <span className="media-scrim" />}
        </>
      )}
      {item.section === 'Videos' && !compact && (
        <span className="play-indicator" aria-hidden="true">
          <Play size={16} fill="currentColor" />
        </span>
      )}
      <span className="card-copy">
        {!compact && item.section !== 'Posts' && (
          <CreatorByline author={item.author} image={item.creatorImage} icon={Icon} />
        )}
        <strong className="card-title">{item.title}</strong>
        {!artwork && !compact && item.section === 'Articles' && item.note && (
          <span className="card-note">{item.note}</span>
        )}
        {compact || item.section === 'Posts' ? (
          <CreatorByline author={item.author} image={item.creatorImage} icon={Icon} />
        ) : (
          <span className="card-duration">
            {item.duration}
            {isComplete(item) && <CheckCircle size={15} aria-label="Finished" />}
          </span>
        )}
        {fraction !== null && fraction > 0 && !isComplete(item) && (
          <progress value={fraction} max={1} aria-label={resumeLabel(item)} />
        )}
      </span>
    </button>
  );
}
