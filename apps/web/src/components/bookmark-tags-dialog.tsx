import { LoaderCircle, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { normalizeTagKey, normalizeTagName, sanitizeTagNames } from '@zine/shared/tags';

import type { LibraryItem } from '../lib/router-types';
import { trpc } from '../lib/trpc';
import { Button } from '../components';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

type BookmarkTagsDialogProps = {
  bookmark: Pick<LibraryItem, 'id' | 'title' | 'tags'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BookmarkTagsDialog({ bookmark, open, onOpenChange }: BookmarkTagsDialogProps) {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const tagsQuery = trpc.items.listTags.useQuery();
  const initialTagNames = useMemo(
    () => sanitizeTagNames((bookmark.tags ?? []).map((tag) => tag.name)),
    [bookmark.tags]
  );

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSaveErrorMessage(null);
      return;
    }

    setQuery('');
    setSaveErrorMessage(null);
    setSelectedTags(initialTagNames);
  }, [initialTagNames, open]);

  const setTagsMutation = trpc.items.setTags.useMutation({
    onSuccess: () => {
      void Promise.all([
        utils.items.get.invalidate({ id: bookmark.id }),
        utils.items.library.invalidate(),
        utils.items.home.invalidate(),
        utils.items.listTags.invalidate(),
      ]);
      onOpenChange(false);
    },
  });

  const normalizedQuery = normalizeTagName(query);
  const normalizedQueryKey = normalizeTagKey(query);
  const allTags = tagsQuery.data?.tags ?? [];
  const selectedTagKeys = useMemo(
    () => new Set(selectedTags.map((tag) => normalizeTagKey(tag))),
    [selectedTags]
  );
  const initialTagKeys = useMemo(
    () => new Set(initialTagNames.map((tag) => normalizeTagKey(tag))),
    [initialTagNames]
  );
  const filteredTags = useMemo(() => {
    if (!normalizedQuery) {
      return allTags;
    }

    return allTags.filter((tag) => normalizeTagKey(tag.name).includes(normalizedQueryKey));
  }, [allTags, normalizedQuery, normalizedQueryKey]);
  const canCreateTag =
    normalizedQuery.length > 0 &&
    normalizedQuery.length <= 32 &&
    !selectedTagKeys.has(normalizedQueryKey) &&
    !allTags.some((tag) => normalizeTagKey(tag.name) === normalizedQueryKey);
  const hasChanges =
    initialTagKeys.size !== selectedTagKeys.size ||
    Array.from(selectedTagKeys).some((tagKey) => !initialTagKeys.has(tagKey));

  const toggleTag = (name: string) => {
    const normalizedName = normalizeTagName(name);
    const normalizedKey = normalizeTagKey(normalizedName);

    if (!normalizedName || normalizedName.length > 32) {
      return;
    }

    setSelectedTags((previous) => {
      const next = previous.some((tag) => normalizeTagKey(tag) === normalizedKey)
        ? previous.filter((tag) => normalizeTagKey(tag) !== normalizedKey)
        : [...previous, normalizedName];

      return sanitizeTagNames(next);
    });
  };

  const handleSave = async () => {
    if (!hasChanges || setTagsMutation.isPending) {
      return;
    }

    setSaveErrorMessage(null);

    try {
      await setTagsMutation.mutateAsync({
        id: bookmark.id,
        tags: sanitizeTagNames(selectedTags),
      });
    } catch (error) {
      setSaveErrorMessage(error instanceof Error ? error.message : 'Failed to update tags.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          className="bookmark-tags-dialog__content"
          aria-describedby="bookmark-tags-dialog-description"
          aria-labelledby="bookmark-tags-dialog-title"
        >
          <div className="bookmark-tags-dialog">
            <div className="bookmark-tags-dialog__header">
              <div className="bookmark-tags-dialog__header-copy">
                <DialogTitle
                  id="bookmark-tags-dialog-title"
                  className="bookmark-tags-dialog__title"
                >
                  Tags
                </DialogTitle>
                <DialogDescription
                  id="bookmark-tags-dialog-description"
                  className="bookmark-tags-dialog__description"
                >
                  Organize this bookmark the same way the mobile flow does.
                </DialogDescription>
                <p className="bookmark-tags-dialog__bookmark-title">{bookmark.title}</p>
              </div>

              <button
                type="button"
                className="button button--ghost bookmark-tags-dialog__close"
                aria-label="Close tags dialog"
                onClick={() => onOpenChange(false)}
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            </div>

            <div className="bookmark-tags-dialog__body">
              <label className="field bookmark-tags-dialog__field">
                <span className="field__label">Add or search tags</span>
                <span className="field__hint">Tags are trimmed, deduped, and capped at 20.</span>
                <div className="manual-bookmark-dialog__input-row">
                  <input
                    autoFocus
                    type="text"
                    value={query}
                    placeholder="Design systems"
                    aria-label="Add or search tags"
                    onChange={(event) => setQuery(event.currentTarget.value)}
                  />

                  {canCreateTag ? (
                    <Button
                      type="button"
                      tone="ghost"
                      onClick={() => {
                        toggleTag(normalizedQuery);
                        setQuery('');
                      }}
                      aria-label={`Add tag ${normalizedQuery}`}
                    >
                      <Plus size={16} strokeWidth={2.1} />
                      Add tag
                    </Button>
                  ) : null}
                </div>
              </label>

              <section className="bookmark-tags-dialog__section" aria-label="Selected tags">
                <div className="bookmark-tags-dialog__section-header">
                  <strong>Selected</strong>
                  <span>{selectedTags.length}/20</span>
                </div>

                {selectedTags.length > 0 ? (
                  <div className="chip-row">
                    {selectedTags.map((tag) => (
                      <button
                        key={normalizeTagKey(tag)}
                        type="button"
                        className="chip chip--active bookmark-tags-dialog__chip"
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="bookmark-tags-dialog__empty">No tags selected yet.</p>
                )}
              </section>

              <section className="bookmark-tags-dialog__section" aria-label="Available tags">
                <div className="bookmark-tags-dialog__section-header">
                  <strong>Available</strong>
                  <span>{tagsQuery.isLoading ? 'Loading…' : `${filteredTags.length} tags`}</span>
                </div>

                {tagsQuery.isLoading ? (
                  <p className="bookmark-tags-dialog__empty">Loading tags…</p>
                ) : filteredTags.length > 0 ? (
                  <div className="chip-row">
                    {filteredTags.map((tag) => {
                      const isSelected = selectedTagKeys.has(normalizeTagKey(tag.name));

                      return (
                        <button
                          key={tag.id}
                          type="button"
                          className={isSelected ? 'chip chip--active' : 'chip'}
                          aria-pressed={isSelected}
                          onClick={() => toggleTag(tag.name)}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="bookmark-tags-dialog__empty">No matching tags yet.</p>
                )}
              </section>
            </div>

            <div className="bookmark-tags-dialog__footer">
              {saveErrorMessage ? (
                <p className="bookmark-tags-dialog__footer-note bookmark-tags-dialog__footer-note--error">
                  {saveErrorMessage}
                </p>
              ) : null}

              <Button
                type="button"
                className="bookmark-tags-dialog__save"
                disabled={!hasChanges || setTagsMutation.isPending}
                onClick={() => void handleSave()}
              >
                {setTagsMutation.isPending ? (
                  <>
                    <LoaderCircle
                      className="manual-bookmark-dialog__spinner"
                      size={16}
                      strokeWidth={2}
                    />
                    Saving tags...
                  </>
                ) : (
                  'Save tags'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
