import {
  OwnerIssueSchema,
  PublicIssueSchema,
  PublicPublicationSchema,
  OwnerPublicationSchema,
} from '@zine/shared';
import type { IssueState, PublicationRow, SelectionMetadata } from './model';
export function publicationProjection(p: PublicationRow, owner = false) {
  const value = {
    id: p.id,
    handle: p.handle,
    displayName: p.display_name || `${p.editor_name}’s Zine`,
    description: p.description,
    coverUrl: p.cover_asset_id ? `/api/v1/publication-assets/${p.cover_asset_id}` : null,
    editor: { displayName: p.editor_name },
  };
  return owner
    ? OwnerPublicationSchema.parse({
        ...value,
        revision: p.revision,
        coverAssetId: p.cover_asset_id,
      })
    : PublicPublicationSchema.parse(value);
}
export function issueProjection(state: IssueState, owner = false) {
  const { issue: i, publication: p, sections, selections } = state;
  const value = {
    id: i.id,
    publication: publicationProjection(p),
    kind: i.kind,
    title: i.title,
    coverUrl: i.cover_asset_id ? `/api/v1/publication-assets/${i.cover_asset_id}` : null,
    introduction: i.introduction,
    revision: i.revision,
    publishedAt: i.published_at === null ? null : new Date(i.published_at).toISOString(),
    sections: sections
      .filter((s) => s.removed_at === null)
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        heading: s.heading,
        selections: selections
          .filter((v) => v.section_id === s.id && v.removed_at === null)
          .sort((a, b) => a.position - b.position)
          .map((v) => ({
            id: v.id,
            ...(JSON.parse(v.metadata_json) as SelectionMetadata),
            commentary: v.commentary,
            firstPublishedRevision: v.first_published_revision,
            ...(owner ? { itemId: v.item_id, bookmarkId: v.bookmark_id } : {}),
          })),
      }))
      .filter((s) => owner || s.selections.length > 0),
  };
  return owner
    ? OwnerIssueSchema.parse({
        ...value,
        status: i.status,
        coverAssetId: i.cover_asset_id,
        weeklyWindowId: i.weekly_window_id,
      })
    : PublicIssueSchema.parse(value);
}
