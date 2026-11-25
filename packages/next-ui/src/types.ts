export type ItemKind = 'video' | 'podcast' | 'article' | 'post';

/** Large 392x368, compact 392x84, tile 188x258, tall 392x752 (or 188x532 with `tallWidth: 'narrow'`). */
export type CardSize = 'large' | 'compact' | 'tile' | 'tall';

export interface Creator {
  name: string;
  /** Shown after the name on posts, e.g. "@handle". */
  handle?: string;
  avatarUrl?: string;
}

export interface Picture {
  url: string;
  /** Intrinsic size; only the ratio is used. */
  width: number;
  height: number;
  isVideo?: boolean;
}

export interface QuotedPost {
  creator: Creator;
  text: string;
  picture?: Picture;
}

export interface CardItem {
  id: string;
  kind: ItemKind;
  /** The original link. The whole card opens it. */
  url: string;
  /** Posts often have none. */
  title?: string;
  creator: Creator;
  /** A short summary, shown muted in whatever lines the title leaves free. */
  description?: string;
  /** The item's own words: the post itself, or the text of an article. Shown at full strength. */
  body?: string;
  picture?: Picture;
  durationMinutes?: number;
  /** ISO timestamp. */
  savedAt?: string;
  /** Domain of a link the post points at. */
  link?: string;
  quote?: QuotedPost;
}
