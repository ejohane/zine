import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { footerLabel } from './format';
import type { CardItem, CardSize, Creator, Picture, QuotedPost } from './types';

export interface ItemCardProps {
  item: CardItem;
  size?: CardSize;
  /** Only for `size="tall"`: 392 wide (default) or 188 wide. */
  tallWidth?: 'wide' | 'narrow';
  /** Reference time for "Saved 2d ago". Defaults to now. */
  now?: Date;
  /** The three-dots button in the footer. */
  onAction?: (item: CardItem) => void;
}

/** Posts this short are set larger so one line does not sit lost in a big card. */
const LOUD_POST_LENGTH = 90;

/**
 * Lines of content shown before the card has been measured in a browser (server render, tests).
 * The browser then replaces this with however many lines actually fit.
 */
const FIRST_GUESS: Record<CardSize, { summary: number; words: number }> = {
  large: { summary: 2, words: 9 },
  compact: { summary: 0, words: 2 },
  tile: { summary: 2, words: 6 },
  tall: { summary: 6, words: 18 },
};

function isTall(picture: Picture): boolean {
  return picture.height > picture.width;
}

/** Counts how many whole lines of its child fit in the space the layout leaves for it. */
function useLinesThatFit(firstGuess: number, hug: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState(firstGuess);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const content = box.firstElementChild;
      if (!content) return;
      const lineHeight = parseFloat(getComputedStyle(content).lineHeight);
      // A hugging box is only as tall as its text, so add back the space left below its last sibling.
      const parent = box.parentElement;
      const last = parent?.lastElementChild;
      const spare =
        hug && parent && last
          ? Math.max(0, parent.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom)
          : 0;
      if (lineHeight > 0)
        setLines(Math.max(0, Math.floor((box.clientHeight + spare + 0.5) / lineHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (hug && box.parentElement) observer.observe(box.parentElement);
    return () => observer.disconnect();
  }, [hug]);
  return [ref, lines] as const;
}

/** `hug` keeps the box only as tall as its text, so whatever follows (media, a quote, a link) sits right under it. */
function Fill(props: {
  firstGuess: number;
  className: string;
  hug?: boolean;
  children: ReactNode;
}) {
  const [ref, lines] = useLinesThatFit(props.firstGuess, Boolean(props.hug));
  return (
    <div
      ref={ref}
      className={props.hug ? 'zn-card__fill zn-card__fill--hug' : 'zn-card__fill'}
      data-lines={lines}
    >
      <div
        className={props.className}
        style={{ '--zn-lines': lines } as CSSProperties}
        hidden={lines === 0}
      >
        {props.children}
      </div>
    </div>
  );
}

function Avatar({ creator, square }: { creator: Creator; square?: boolean }) {
  const className = square ? 'zn-card__avatar zn-card__avatar--square' : 'zn-card__avatar';
  if (creator.avatarUrl) return <img className={className} src={creator.avatarUrl} alt="" />;
  return (
    <span className={className} aria-hidden="true">
      {creator.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CreatorLine({ creator, square }: { creator: Creator; square?: boolean }) {
  return (
    <div className="zn-card__creator">
      <Avatar creator={creator} square={square} />
      <span className="zn-card__name">{creator.name}</span>
      {creator.handle ? <span className="zn-card__handle">{creator.handle}</span> : null}
    </div>
  );
}

function ratio(picture: Picture): CSSProperties {
  return { aspectRatio: `${picture.width} / ${picture.height}` };
}

/** The picture area of a video, podcast or article. Videos and articles fill it; a podcast cover is never cropped. */
function Stage({ item }: { item: CardItem }) {
  const picture = item.picture;
  if (!picture) {
    return (
      <div className="zn-card__stage zn-card__stage--empty" aria-hidden="true">
        {item.creator.name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  if (item.kind === 'podcast') {
    return (
      <div className="zn-card__stage zn-card__stage--cover">
        <img className="zn-card__backdrop" src={picture.url} alt="" />
        <img className="zn-card__cover" src={picture.url} alt="" />
      </div>
    );
  }
  return (
    <div className="zn-card__stage">
      <img src={picture.url} alt="" />
    </div>
  );
}

function Quote({ quote, withPicture }: { quote: QuotedPost; withPicture: boolean }) {
  return (
    <div className="zn-card__quote">
      <CreatorLine creator={quote.creator} square />
      <div className="zn-card__quote-text">{quote.text}</div>
      {withPicture && quote.picture ? (
        <img
          className="zn-card__quote-picture"
          src={quote.picture.url}
          alt=""
          style={ratio(quote.picture)}
        />
      ) : null}
    </div>
  );
}

function LinkBar({ domain }: { domain: string }) {
  return (
    <div className="zn-card__link-bar">
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
      </svg>
      <span>{domain}</span>
    </div>
  );
}

function Footer(props: {
  item: CardItem;
  now?: Date;
  hint?: string;
  onAction?: (item: CardItem) => void;
}) {
  const label = [props.hint, footerLabel(props.item, props.now)].filter(Boolean).join(' · ');
  return (
    <div className="zn-card__footer">
      <span className="zn-card__meta">{label}</span>
      <button
        type="button"
        className="zn-card__action"
        aria-label="More actions"
        onClick={() => props.onAction?.(props.item)}
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
    </div>
  );
}

/** Title, then creator, then content: the same order on every card. */
function Heading({ item }: { item: CardItem }) {
  return (
    <>
      {item.title ? <h3 className="zn-card__title">{item.title}</h3> : null}
      <CreatorLine creator={item.creator} />
    </>
  );
}

function PostBody({ item, size }: { item: CardItem; size: CardSize }) {
  const guess = FIRST_GUESS[size].words;
  const text = item.body ?? item.description ?? '';
  const loud =
    size !== 'compact' && size !== 'tile' && !item.picture && text.length < LOUD_POST_LENGTH;
  const picture = item.picture;
  const besideText = Boolean(picture && isTall(picture) && size === 'large');
  const follows = Boolean(picture || item.quote || item.link);
  const words = (
    <Fill
      hug={size !== 'compact' && follows && !besideText}
      firstGuess={guess}
      className={
        loud
          ? 'zn-card__content zn-card__content--words zn-card__content--loud'
          : 'zn-card__content zn-card__content--words'
      }
    >
      {text}
    </Fill>
  );
  if (size === 'compact') return words;
  if (picture && besideText) {
    return (
      <div className="zn-card__beside">
        {words}
        <img className="zn-card__media" src={picture.url} alt="" style={ratio(picture)} />
      </div>
    );
  }
  return (
    <>
      {words}
      {picture && isTall(picture) ? (
        <div className="zn-card__media-panel">
          <img src={picture.url} alt="" style={ratio(picture)} />
        </div>
      ) : null}
      {picture && !isTall(picture) ? (
        <img className="zn-card__media" src={picture.url} alt="" style={ratio(picture)} />
      ) : null}
      {item.quote ? <Quote quote={item.quote} withPicture={size === 'tall'} /> : null}
      {item.link ? <LinkBar domain={item.link} /> : null}
    </>
  );
}

function compactHint(item: CardItem): string | undefined {
  if (item.kind !== 'post') return undefined;
  if (item.quote) return `Quoting ${item.quote.creator.handle ?? item.quote.creator.name}`;
  return item.link;
}

export function ItemCard({
  item,
  size = 'large',
  tallWidth = 'wide',
  now,
  onAction,
}: ItemCardProps) {
  const isPost = item.kind === 'post';
  const picture = item.picture;
  const classes = ['zn-card', `zn-card--${size}`, `zn-card--${item.kind}`];
  if (size === 'tall' && tallWidth === 'narrow') classes.push('zn-card--narrow');
  if (!picture) classes.push('zn-card--no-picture');

  // Without a picture, an article shows its own text at full strength; otherwise the muted summary.
  const ownWords = !isPost && !picture && item.body ? item.body : undefined;
  const summary = ownWords ?? item.description;
  const content = isPost ? (
    <PostBody item={item} size={size} />
  ) : summary ? (
    <Fill
      firstGuess={ownWords ? FIRST_GUESS[size].words : FIRST_GUESS[size].summary}
      className={ownWords ? 'zn-card__content zn-card__content--words' : 'zn-card__content'}
    >
      {summary}
    </Fill>
  ) : null;

  const footer = (
    <Footer
      item={item}
      now={now}
      hint={size === 'compact' ? compactHint(item) : undefined}
      onAction={onAction}
    />
  );
  const label = item.title ?? `Post by ${item.creator.name}`;
  const link = <a className="zn-card__link" href={item.url} aria-label={`Open ${label}`} />;

  if (size === 'compact') {
    // Things you play keep their picture on the left; things you read keep it on the right.
    const side = picture ? (
      isPost ? (
        <img className="zn-card__thumb" src={picture.url} alt="" style={ratio(picture)} />
      ) : (
        <img
          className={
            item.kind === 'video'
              ? 'zn-card__thumb zn-card__thumb--frame'
              : 'zn-card__thumb zn-card__thumb--square'
          }
          src={picture.url}
          alt=""
        />
      )
    ) : null;
    const leads = item.kind === 'video' || item.kind === 'podcast';
    return (
      <article className={classes.join(' ')}>
        {link}
        {leads ? side : null}
        <div className="zn-card__text">
          <Heading item={item} />
          {content}
          {footer}
        </div>
        {leads ? null : side}
      </article>
    );
  }

  // A tile always has a picture area, so tiles line up; larger article cards without a picture are all text.
  const showStage = !isPost && (picture || size === 'tile');
  return (
    <article className={classes.join(' ')}>
      {link}
      {showStage ? <Stage item={item} /> : null}
      <div className="zn-card__text">
        <Heading item={item} />
        {content}
      </div>
      {footer}
    </article>
  );
}
