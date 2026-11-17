import { useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import type { HomeEntry, Size, Variant } from './homeLayout';
import { isMedia } from './homeLayout';

// Home cards. Article and post "Plate", video and podcast "Fade" (identical by design), plus the
// smaller phone pieces. A missing or broken avatar renders nothing.

export type Open = (id: string) => void;

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = Math.floor(s % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`
    : `${m}:${String(x).padStart(2, '0')}`;
};
const human = (s: number) => {
  const m = Math.max(1, Math.round(s / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`;
};
const site = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
const minutesLeft = (e: HomeEntry) =>
  e.readMinutes && e.progress ? Math.max(1, Math.round(e.readMinutes * (1 - e.progress))) : null;
const kindLabel = { article: 'article', video: 'video', podcast: 'podcast', post: 'post' };

function Picture({ src, className }: { src?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <span className={className} />;
  return (
    <span className={className}>
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setBroken(true)}
      />
    </span>
  );
}

export function Avatar({ src }: { src?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return null;
  return (
    <span className="av" aria-hidden="true">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setBroken(true)}
      />
    </span>
  );
}

const XMark = () => (
  <svg className="xmark" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18.9 2H22l-6.8 7.8L23 22h-6.2l-4.9-6.4L6.3 22H3.2l7.3-8.3L1 2h6.3l4.4 5.8L18.9 2Zm-1.1 18h1.7L6.3 3.9H4.5L17.8 20Z" />
  </svg>
);
const Play = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true">
    <path d="M2 1.2v7.6L8.6 5z" />
  </svg>
);

function Card({
  entry,
  open,
  className,
  style,
  children,
}: {
  entry: HomeEntry;
  open: Open;
  className: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  const by = entry.kind === 'post' && entry.handle ? `@${entry.handle}` : entry.creator;
  return (
    <a
      className={`hcard ${className}`}
      href={`#item=${encodeURIComponent(entry.id)}`}
      data-item-id={entry.id}
      style={style}
      aria-label={[entry.title, by, kindLabel[entry.kind]].filter(Boolean).join(', ')}
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        open(entry.id);
      }}
    >
      {children}
    </a>
  );
}

/* ---------- Lengths and progress ---------- */

function ReadMeta({ entry }: { entry: HomeEntry }) {
  const left = minutesLeft(entry);
  if (entry.progress)
    return (
      <span className="meta">
        <span className="left">
          {left ? `${left} min left` : `${Math.round(entry.progress * 100)}% read`}
        </span>
        <span className="bar">
          <i style={{ width: `${entry.progress * 100}%` }} />
        </span>
      </span>
    );
  return (
    <span className="meta">{entry.readMinutes ? `${entry.readMinutes} min read` : 'Article'}</span>
  );
}

function MediaLength({ entry }: { entry: HomeEntry }) {
  if (!entry.seconds) return null;
  return entry.progress ? (
    <span className="len left">{human(entry.seconds * (1 - entry.progress))} left</span>
  ) : (
    <span className="len">
      <Play />
      {clock(entry.seconds)}
    </span>
  );
}

function Badge({ entry }: { entry: HomeEntry }) {
  return (
    <>
      {entry.seconds ? (
        <span className="badge">
          {entry.progress ? (
            `${human(entry.seconds * (1 - entry.progress))} left`
          ) : (
            <>
              <Play />
              {clock(entry.seconds)}
            </>
          )}
        </span>
      ) : null}
      {entry.progress ? (
        <span className="prog">
          <i style={{ width: `${entry.progress * 100}%` }} />
        </span>
      ) : null}
    </>
  );
}

/* ---------- Grid cards ---------- */

export function ArticlePlate({
  entry,
  size,
  open,
  style,
}: {
  entry: HomeEntry;
  size: Size;
  open: Open;
  style?: React.CSSProperties;
}) {
  const plate = !!entry.thumbnail && size !== 's11';
  const opening = paragraphs(entry.preview ?? entry.summary ?? '');
  return (
    <Card
      entry={entry}
      open={open}
      style={style}
      className={`p5 ${size}${entry.thumbnail ? '' : ' noimg'}${plate ? '' : ' lead-head'}`}
    >
      {plate && (
        <div className="front">
          <Picture className="thumb" src={entry.thumbnail} />
          {entry.avatar && (
            <span className="pin">
              <Avatar src={entry.avatar} />
            </span>
          )}
        </div>
      )}
      <div className="main">
        <div className="head">
          {plate ? (
            <div className="by">
              By <b>{entry.creator}</b>
              {site(entry.url) && entry.creator !== site(entry.url) ? ` · ${site(entry.url)}` : ''}
            </div>
          ) : (
            <span className="creator lead">
              <Avatar src={entry.avatar} />
              <span className="who">
                <span className="name">{entry.creator}</span>
                {entry.creator !== site(entry.url) && (
                  <span className="site">{site(entry.url)}</span>
                )}
              </span>
            </span>
          )}
          <h3>{entry.title}</h3>
        </div>
        <div className="excerpt">
          {opening.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="tfoot">
          <ReadMeta entry={entry} />
          <span className="go">{entry.progress ? 'Keep reading' : 'Start reading'} →</span>
        </div>
      </div>
    </Card>
  );
}

export function MediaFade({
  entry,
  size,
  flag,
  open,
  style,
}: {
  entry: HomeEntry;
  size: Size;
  flag?: Variant['flag'];
  open: Open;
  style?: React.CSSProperties;
}) {
  return (
    <Card
      entry={entry}
      open={open}
      style={style}
      className={`fade ${size}${flag ? ` ${flag}` : ''}`}
    >
      <Picture className="fill" src={entry.thumbnail} />
      <span className="shade" />
      <div className="body">
        <h3 className="ttl">{entry.title}</h3>
        <span className="mrow">
          <Avatar src={entry.avatar} />
          {entry.creator && <span className="nm">{entry.creator}</span>}
          {entry.creator && entry.seconds ? <span className="dot">·</span> : null}
          <MediaLength entry={entry} />
        </span>
      </div>
      {entry.progress ? (
        <span className="watched">
          <i style={{ width: `${entry.progress * 100}%` }} />
        </span>
      ) : null}
    </Card>
  );
}

const textSize = (text: string) =>
  text.length < 300 ? 't-short' : text.length < 900 ? 't-mid' : 't-long';
const linkify = (text: string) =>
  text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <span className="link" key={i}>
        {part.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
      </span>
    ) : (
      part
    )
  );

function Author({ entry, lead }: { entry: HomeEntry; lead?: boolean }) {
  return (
    <span className={`author${lead ? ' lead' : ''}`}>
      {lead && <Avatar src={entry.avatar} />}
      <span className="id">
        {entry.creator && <span className="name">{entry.creator}</span>}
        {entry.handle && <span className="handle">@{entry.handle}</span>}
      </span>
      <XMark />
    </span>
  );
}

function PostFoot({ entry }: { entry: HomeEntry }) {
  return (
    <div className="tfoot">
      <span>{entry.threadPosts ? `Thread · ${entry.threadPosts} posts` : 'Post'}</span>
      <span className="go">{entry.threadPosts ? 'Read thread' : 'Read post'} →</span>
    </div>
  );
}

export function PostPlate({
  entry,
  size,
  open,
  style,
}: {
  entry: HomeEntry;
  size: Size;
  open: Open;
  style?: React.CSSProperties;
}) {
  const text = entry.preview ?? entry.title;
  const body = (
    <div className="flow">
      <div className={`ptext ${textSize(text)}`}>
        {paragraphs(text).map((p, i) => (
          <p key={i}>{linkify(p)}</p>
        ))}
      </div>
    </div>
  );
  return entry.thumbnail ? (
    <Card entry={entry} open={open} style={style} className={`post has-media ${size}`}>
      <div className="front">
        <Picture className="media" src={entry.thumbnail} />
        {entry.avatar && (
          <span className="pin">
            <Avatar src={entry.avatar} />
          </span>
        )}
      </div>
      <div className="inner">
        <Author entry={entry} />
        {body}
      </div>
      <PostFoot entry={entry} />
    </Card>
  ) : (
    <Card entry={entry} open={open} style={style} className={`post ${size}`}>
      <div className="inner">
        <Author entry={entry} lead />
        {body}
      </div>
      <PostFoot entry={entry} />
    </Card>
  );
}

export function GridCard({
  entry,
  variant,
  open,
  style,
}: {
  entry: HomeEntry;
  variant: Variant;
  open: Open;
  style?: React.CSSProperties;
}) {
  if (entry.kind === 'article')
    return <ArticlePlate entry={entry} size={variant.size} open={open} style={style} />;
  if (entry.kind === 'post')
    return <PostPlate entry={entry} size={variant.size} open={open} style={style} />;
  return (
    <MediaFade entry={entry} size={variant.size} flag={variant.flag} open={open} style={style} />
  );
}

/* ---------- Phone pieces ---------- */

function By({ entry }: { entry: HomeEntry }) {
  return (
    <span className="who">
      <Avatar src={entry.avatar} />
      <span className="nm">
        <b>{entry.creator ?? site(entry.url)}</b>
      </span>
    </span>
  );
}
function Handle({ entry }: { entry: HomeEntry }) {
  return (
    <span className="who">
      <Avatar src={entry.avatar} />
      <span className="id">
        {entry.creator && <b>{entry.creator}</b>}
        {entry.handle && <span>@{entry.handle}</span>}
      </span>
      <XMark />
    </span>
  );
}
function Foot({ entry }: { entry: HomeEntry }) {
  if (entry.kind === 'post')
    return (
      <span className="foot">
        {entry.threadPosts ? `Thread · ${entry.threadPosts} posts` : 'Post'}
      </span>
    );
  const left = minutesLeft(entry);
  return (
    <span className="foot">
      {entry.progress ? (
        <>
          <span className="left">
            {left ? `${left} min left` : `${Math.round(entry.progress * 100)}% read`}
          </span>
          <span className="bar">
            <i style={{ width: `${entry.progress * 100}%` }} />
          </span>
        </>
      ) : (
        <span>{entry.readMinutes ? `${entry.readMinutes} min read` : 'Article'}</span>
      )}
    </span>
  );
}
const PostText = ({ entry, className }: { entry: HomeEntry; className: string }) => (
  <div className={className}>
    {paragraphs(entry.preview ?? entry.title).map((p, i) => (
      <p key={i}>{linkify(p)}</p>
    ))}
  </div>
);

/** Full-width lead card. */
export function Feature({ entry, open }: { entry: HomeEntry; open: Open }) {
  if (isMedia(entry))
    return (
      <Card entry={entry} open={open} className="feat">
        <span className="thumb">
          <Picture className="pic" src={entry.thumbnail} />
          <Badge entry={entry} />
        </span>
        <div className="body">
          <h3 className="ttl">{entry.title}</h3>
          <By entry={entry} />
        </div>
      </Card>
    );
  return (
    <Card entry={entry} open={open} className="feat">
      {entry.thumbnail && (
        <span className="thumb">
          <Picture className="pic" src={entry.thumbnail} />
        </span>
      )}
      <div className="body">
        {entry.kind === 'post' ? <Handle entry={entry} /> : <By entry={entry} />}
        {entry.kind === 'post' ? (
          <PostText entry={entry} className="ptx fadeout" />
        ) : (
          <>
            <h3 className="ttl">{entry.title}</h3>
            {(entry.summary || entry.preview) && (
              <p className="dek">{entry.summary || entry.preview}</p>
            )}
          </>
        )}
        <Foot entry={entry} />
      </div>
    </Card>
  );
}

/** Half-width tile: picture on top, text always on the card, never on the picture. */
export function Tile({ entry, open }: { entry: HomeEntry; open: Open }) {
  if (isMedia(entry))
    return (
      <Card entry={entry} open={open} className="tile m">
        <span className="thumb">
          <Picture className="pic" src={entry.thumbnail} />
          <Badge entry={entry} />
        </span>
        <div className="body">
          <h3 className="ttl">{entry.title}</h3>
          <By entry={entry} />
        </div>
      </Card>
    );
  if (entry.kind === 'post')
    return (
      <Card entry={entry} open={open} className="tile post">
        {entry.thumbnail && (
          <span className="thumb">
            <Picture className="pic" src={entry.thumbnail} />
          </span>
        )}
        <div className="body">
          <Handle entry={entry} />
          <PostText entry={entry} className="ptx fadeout" />
        </div>
      </Card>
    );
  return (
    <Card entry={entry} open={open} className={`tile${entry.thumbnail ? '' : ' text'}`}>
      {entry.thumbnail ? (
        <span className="thumb">
          <Picture className="pic" src={entry.thumbnail} />
        </span>
      ) : null}
      <div className="body">
        {!entry.thumbnail && <By entry={entry} />}
        <h3 className="ttl serif">{entry.title}</h3>
        {entry.summary && <p className="dek fadeout">{entry.summary}</p>}
        <Foot entry={entry} />
      </div>
    </Card>
  );
}

/** One row inside a list card: text first, small picture on the right. */
export function Row({ entry, open }: { entry: HomeEntry; open: Open }) {
  if (isMedia(entry))
    return (
      <Card entry={entry} open={open} className="row">
        <div className="body">
          <h3 className="ttl">{entry.title}</h3>
          <By entry={entry} />
        </div>
        <span className={`thumb${entry.kind === 'podcast' ? ' sq' : ''}`}>
          <Picture className="pic" src={entry.thumbnail} />
          <Badge entry={entry} />
        </span>
      </Card>
    );
  if (entry.kind === 'post')
    return (
      <Card entry={entry} open={open} className="row">
        <div className="body">
          <Handle entry={entry} />
          <PostText entry={entry} className="ptx" />
        </div>
        {entry.thumbnail && (
          <span className="thumb sq">
            <Picture className="pic" src={entry.thumbnail} />
          </span>
        )}
      </Card>
    );
  return (
    <Card entry={entry} open={open} className="row">
      <div className="body">
        <By entry={entry} />
        <h3 className="ttl serif">{entry.title}</h3>
        <Foot entry={entry} />
      </div>
      {entry.thumbnail && (
        <span className="thumb">
          <Picture className="pic" src={entry.thumbnail} />
        </span>
      )}
    </Card>
  );
}

export function ListCard({ entries, open }: { entries: HomeEntry[]; open: Open }) {
  return (
    <div className="rows">
      {entries.map((entry) => (
        <Row key={entry.id} entry={entry} open={open} />
      ))}
    </div>
  );
}
