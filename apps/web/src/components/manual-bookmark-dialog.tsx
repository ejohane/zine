import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BookmarkSaveResult } from '../lib/router-types';
import { trpc } from '../lib/trpc';
import { isValidUrl } from '../lib/format';
import { Dialog, DialogContent } from './ui/dialog';
import { ManualBookmarkDialogView } from './manual-bookmark-dialog-view';

const PREVIEW_DEBOUNCE_MS = 500;

function getSaveStatusMessage(status: BookmarkSaveResult['status']) {
  switch (status) {
    case 'already_bookmarked':
      return 'Already in your library';
    case 'rebookmarked':
      return 'Added back to library';
    case 'created':
    default:
      return 'Saved to library';
  }
}

type ManualBookmarkDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (result: BookmarkSaveResult) => void;
};

export function ManualBookmarkDialog({ open, onOpenChange, onSaved }: ManualBookmarkDialogProps) {
  const [url, setUrl] = useState('');
  const [debouncedUrl, setDebouncedUrl] = useState('');
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const inputFocusFrame = useRef<number | null>(null);

  const trimmedUrl = url.trim();
  const urlIsValid = isValidUrl(trimmedUrl);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedUrl(trimmedUrl);
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [trimmedUrl]);

  useEffect(() => {
    if (open) {
      inputFocusFrame.current = window.requestAnimationFrame(() => {
        const input = document.querySelector<HTMLInputElement>('[aria-label="Bookmark URL"]');
        input?.focus();
      });
      return () => {
        if (inputFocusFrame.current !== null) {
          window.cancelAnimationFrame(inputFocusFrame.current);
        }
      };
    }

    setUrl('');
    setDebouncedUrl('');
    setSaveErrorMessage(null);
    inputFocusFrame.current = null;
  }, [open]);

  const previewQuery = trpc.bookmarks.preview.useQuery(
    { url: debouncedUrl },
    {
      enabled: open && debouncedUrl.length > 0 && urlIsValid,
      placeholderData: (previousData) => previousData,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    }
  );

  const saveMutation = trpc.bookmarks.save.useMutation();

  const resolvedPreview = useMemo(() => {
    if (!urlIsValid || !open) {
      return null;
    }

    return previewQuery.data ?? null;
  }, [open, previewQuery.data, urlIsValid]);

  const previewErrorMessage = useMemo(() => {
    if (!open || !urlIsValid || trimmedUrl.length === 0) {
      return null;
    }

    if (previewQuery.error?.message) {
      return previewQuery.error.message;
    }

    if (
      debouncedUrl.length > 0 &&
      !previewQuery.isLoading &&
      !previewQuery.isFetching &&
      previewQuery.data === null
    ) {
      return 'We could not build a preview for this link yet.';
    }

    return null;
  }, [
    debouncedUrl,
    open,
    previewQuery.data,
    previewQuery.error?.message,
    previewQuery.isFetching,
    previewQuery.isLoading,
    trimmedUrl.length,
    urlIsValid,
  ]);

  const handleClose = useCallback(() => {
    saveMutation.reset();
    setSaveErrorMessage(null);
    onOpenChange(false);
  }, [onOpenChange, saveMutation]);

  const handlePaste = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      setSaveErrorMessage('Clipboard paste is not available in this browser.');
      return;
    }

    try {
      const clipboardText = (await navigator.clipboard.readText()).trim();

      if (!clipboardText) {
        setSaveErrorMessage('Your clipboard is empty.');
        return;
      }

      setSaveErrorMessage(null);
      setUrl(clipboardText);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Clipboard paste is not available right now.';
      setSaveErrorMessage(message);
    }
  }, []);

  const handleRetry = useCallback(() => {
    setSaveErrorMessage(null);
    saveMutation.reset();
    void previewQuery.refetch();
  }, [previewQuery, saveMutation]);

  const handleSave = useCallback(async () => {
    if (!resolvedPreview) {
      return;
    }

    setSaveErrorMessage(null);

    try {
      const result = await saveMutation.mutateAsync({
        url: trimmedUrl,
        provider: resolvedPreview.provider,
        contentType: resolvedPreview.contentType,
        providerId: resolvedPreview.providerId,
        title: resolvedPreview.title,
        creator: resolvedPreview.creator,
        creatorImageUrl: resolvedPreview.creatorImageUrl ?? null,
        thumbnailUrl: resolvedPreview.thumbnailUrl,
        duration: resolvedPreview.duration,
        canonicalUrl: resolvedPreview.canonicalUrl,
        description: resolvedPreview.description,
        siteName: resolvedPreview.siteName,
        wordCount: resolvedPreview.wordCount,
        readingTimeMinutes: resolvedPreview.readingTimeMinutes,
        hasArticleContent: resolvedPreview.hasArticleContent,
        publishedAt: resolvedPreview.publishedAt,
        rawMetadata: resolvedPreview.rawMetadata,
      });

      setSaveErrorMessage(getSaveStatusMessage(result.status));
      onSaved(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save bookmark.';
      setSaveErrorMessage(message);
    }
  }, [onSaved, resolvedPreview, saveMutation, trimmedUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <DialogContent
          className="manual-bookmark-dialog__content"
          aria-describedby="manual-bookmark-dialog-description"
          aria-labelledby="manual-bookmark-dialog-title"
        >
          <ManualBookmarkDialogView
            url={url}
            isUrlValid={urlIsValid}
            preview={resolvedPreview}
            isLoadingPreview={previewQuery.isLoading || (urlIsValid && trimmedUrl !== debouncedUrl)}
            isFetchingPreview={previewQuery.isFetching}
            previewErrorMessage={previewErrorMessage}
            saveErrorMessage={saveErrorMessage}
            isSaving={saveMutation.isPending}
            onClose={handleClose}
            onUrlChange={(value) => {
              setSaveErrorMessage(null);
              setUrl(value);
            }}
            onPaste={handlePaste}
            onClear={() => {
              setSaveErrorMessage(null);
              saveMutation.reset();
              setUrl('');
              setDebouncedUrl('');
            }}
            onRetry={handleRetry}
            onSave={handleSave}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
