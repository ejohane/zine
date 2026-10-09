import type { z } from 'zod';
import type { PublicSelectionSchema } from '@zine/shared';
export interface PublicationRow {
  id: string;
  owner_id: string | null;
  handle: string;
  editor_name: string;
  display_name: string | null;
  description: string | null;
  cover_asset_id: string | null;
  revision: number;
  created_at: number;
  unavailable_at: number | null;
}
export interface IssueRow {
  id: string;
  publication_id: string;
  kind: 'WEEKLY' | 'INDEPENDENT';
  status: 'DRAFT' | 'PUBLISHED';
  title: string;
  introduction: string | null;
  cover_asset_id: string | null;
  revision: number;
  published_at: number | null;
  weekly_window_id: string | null;
  weekly_timezone: string | null;
  weekly_start: number | null;
  weekly_end: number | null;
  created_at: number;
  unavailable_at: number | null;
}
export interface SectionRow {
  id: string;
  issue_id: string;
  heading: string | null;
  position: number;
  removed_at: number | null;
}
export type SelectionMetadata = Pick<
  z.infer<typeof PublicSelectionSchema>,
  | 'contentType'
  | 'title'
  | 'creatorName'
  | 'sourceName'
  | 'originalUrl'
  | 'artworkUrl'
  | 'originalAvailability'
>;
export interface SelectionRow {
  id: string;
  issue_id: string;
  section_id: string;
  item_id: string;
  bookmark_id: string | null;
  metadata_json: string;
  source_fingerprint: string;
  commentary: string | null;
  position: number;
  first_published_revision: number | null;
  first_published_at: number | null;
  removed_at: number | null;
}
export interface IssueState {
  issue: IssueRow;
  publication: PublicationRow;
  sections: SectionRow[];
  selections: SelectionRow[];
}
