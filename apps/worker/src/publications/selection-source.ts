import { PublicationRepository } from './repository';
import { requireFound } from './errors';
import type { SelectionMetadata } from './model';
/** Internal provenance seam: resolve public selection identity, never client metadata. */
export async function resolvePublishedSelection(
  db: D1Database,
  issueId: string,
  selectionId: string
) {
  const state = await new PublicationRepository(db).issue(issueId);
  const selection = requireFound(
    state.selections.find((v) => v.id === selectionId && v.removed_at === null)
  );
  return {
    itemId: selection.item_id,
    selectionId: selection.id,
    issueId: state.issue.id,
    publicationId: state.publication.id,
    publicationName: state.publication.display_name || `${state.publication.editor_name}’s Zine`,
    editorName: state.publication.editor_name,
    issueTitle: state.issue.title,
    commentary: selection.commentary,
    metadata: JSON.parse(selection.metadata_json) as SelectionMetadata,
  };
}
