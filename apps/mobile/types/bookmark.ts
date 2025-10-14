import type { Bookmark as SharedBookmark } from '@zine/shared';

export type AlternateLinkProvider = 'youtube' | 'spotify';

export interface AlternateLink {
  provider: AlternateLinkProvider;
  url: string;
  externalId?: string;
  confidence?: number;
}

export type MobileBookmark = SharedBookmark & {
  /**
   * Additional platform links surfaced when the server merges cross-platform content.
   */
  alternateLinks?: AlternateLink[];
  /**
   * Present when preview or save detects that this URL already maps to an existing bookmark.
   */
  existingBookmarkId?: string;
};

export type Bookmark = MobileBookmark;
