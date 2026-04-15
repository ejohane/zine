import { AlertCircle, Clipboard, Link2, LoaderCircle, Plus, RefreshCcw, X } from 'lucide-react';

import type { BookmarkPreview } from '../lib/router-types';
import { cn } from '../lib/utils';
import {
  formatDuration,
  formatPlainText,
  isValidUrl,
  mapContentType,
  mapProvider,
} from '../lib/format';

function getPreviewLengthLabel(preview: NonNullable<BookmarkPreview>) {
  if (preview.duration) {
    return formatDuration(preview.duration) ?? null;
  }

  if (preview.readingTimeMinutes) {
    return `${preview.readingTimeMinutes} min read`;
  }

  return null;
}

function getPreviewSourceLabel(preview: NonNullable<BookmarkPreview>) {
  if (preview.siteName) {
    return preview.siteName;
  }

  if (isValidUrl(preview.canonicalUrl)) {
    try {
      return new URL(preview.canonicalUrl).hostname.replace(/^www\./, '');
    } catch {
      return mapProvider(preview.provider);
    }
  }

  return mapProvider(preview.provider);
}

function BadgePill({
  children,
  tone,
}: {
  children: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  return <span className={cn('badge', tone && `badge--${tone}`)}>{children}</span>;
}

function ManualBookmarkPreviewCard({ preview }: { preview: NonNullable<BookmarkPreview> }) {
  const previewSummary = formatPlainText(preview.description);
  const previewLength = getPreviewLengthLabel(preview);
  const previewSource = getPreviewSourceLabel(preview);

  return (
    <section className="manual-bookmark-preview-card" data-testid="manual-bookmark-preview-card">
      <div className="manual-bookmark-preview-card__media">
        {preview.thumbnailUrl ? (
          <img src={preview.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <div className="manual-bookmark-preview-card__placeholder" aria-hidden="true">
            <Link2 size={28} strokeWidth={1.9} />
          </div>
        )}
        <div className="manual-bookmark-preview-card__media-badges">
          <BadgePill>{mapContentType(preview.contentType)}</BadgePill>
          <BadgePill>{mapProvider(preview.provider)}</BadgePill>
          {preview.source === 'provider_api' ? (
            <BadgePill tone="success">Connected</BadgePill>
          ) : null}
        </div>
        {previewLength ? (
          <div className="manual-bookmark-preview-card__length">{previewLength}</div>
        ) : null}
      </div>

      <div className="manual-bookmark-preview-card__body">
        <div className="manual-bookmark-preview-card__creator">
          {preview.creatorImageUrl ? (
            <img
              className="manual-bookmark-preview-card__avatar"
              src={preview.creatorImageUrl}
              alt=""
            />
          ) : (
            <div className="manual-bookmark-preview-card__avatar manual-bookmark-preview-card__avatar--fallback">
              {(preview.creator || 'Z').slice(0, 1).toUpperCase()}
            </div>
          )}

          <div className="manual-bookmark-preview-card__creator-copy">
            <strong>{preview.creator}</strong>
            <span>{previewSource}</span>
          </div>
        </div>

        <div className="manual-bookmark-preview-card__copy">
          <h3>{preview.title}</h3>
          {previewSummary ? <p>{previewSummary}</p> : null}
        </div>
      </div>
    </section>
  );
}

export type ManualBookmarkDialogViewProps = {
  url: string;
  isUrlValid: boolean;
  preview: BookmarkPreview | null;
  isLoadingPreview: boolean;
  isFetchingPreview: boolean;
  previewErrorMessage: string | null;
  saveErrorMessage?: string | null;
  isSaving: boolean;
  onClose: () => void;
  onUrlChange: (value: string) => void;
  onPaste: () => void;
  onClear: () => void;
  onRetry: () => void;
  onSave: () => void;
};

export function ManualBookmarkDialogView({
  url,
  isUrlValid,
  preview,
  isLoadingPreview,
  isFetchingPreview,
  previewErrorMessage,
  saveErrorMessage = null,
  isSaving,
  onClose,
  onUrlChange,
  onPaste,
  onClear,
  onRetry,
  onSave,
}: ManualBookmarkDialogViewProps) {
  const hasInput = url.trim().length > 0;
  const resolvedPreview = preview ?? null;
  const resolvedErrorMessage = saveErrorMessage ?? previewErrorMessage;
  const showEmptyState = !hasInput || !isUrlValid;
  const showLoadingState = hasInput && isUrlValid && isLoadingPreview && !resolvedPreview;
  const showErrorState =
    hasInput &&
    isUrlValid &&
    Boolean(resolvedErrorMessage) &&
    !showLoadingState &&
    !resolvedPreview;
  const showPreviewState =
    hasInput && isUrlValid && (Boolean(resolvedPreview) || isFetchingPreview) && !showLoadingState;
  const canSave = Boolean(resolvedPreview) && !isFetchingPreview && !isSaving;

  return (
    <div className="manual-bookmark-dialog" data-testid="manual-bookmark-dialog">
      <div className="manual-bookmark-dialog__header">
        <div className="manual-bookmark-dialog__header-copy">
          <h2 id="manual-bookmark-dialog-title" className="manual-bookmark-dialog__title">
            Add bookmark
          </h2>
          <p
            id="manual-bookmark-dialog-description"
            className="manual-bookmark-dialog__description"
          >
            Paste a link, review the preview, and save it straight into your library.
          </p>
        </div>

        <button
          type="button"
          className="button button--ghost manual-bookmark-dialog__icon-button manual-bookmark-dialog__close"
          aria-label="Close add bookmark dialog"
          onClick={onClose}
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>

      <div className="manual-bookmark-dialog__body">
        <label className="field manual-bookmark-dialog__field">
          <span className="field__label">Link</span>
          <span className="field__hint">Paste a full http:// or https:// URL.</span>
          <div
            className="manual-bookmark-dialog__input-row"
            data-invalid={hasInput && !isUrlValid ? 'true' : undefined}
          >
            <input
              autoFocus
              type="url"
              value={url}
              placeholder="https://example.com/story"
              aria-label="Bookmark URL"
              onChange={(event) => onUrlChange(event.currentTarget.value)}
            />

            {hasInput ? (
              <button
                type="button"
                className="button button--ghost manual-bookmark-dialog__icon-button"
                aria-label="Clear URL"
                onClick={onClear}
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            ) : (
              <button type="button" className="button button--ghost" onClick={onPaste}>
                <Clipboard size={16} strokeWidth={2.1} />
                Paste
              </button>
            )}
          </div>
        </label>

        {hasInput && !isUrlValid ? (
          <p className="manual-bookmark-dialog__hint manual-bookmark-dialog__hint--error">
            Please enter a valid URL (http:// or https://)
          </p>
        ) : null}

        <div className="manual-bookmark-dialog__preview">
          {showEmptyState ? (
            <section
              className="manual-bookmark-dialog__state manual-bookmark-dialog__state--empty"
              data-testid="manual-bookmark-empty-state"
            >
              <Link2 size={28} strokeWidth={1.8} />
              <div>
                <h3>Paste a link to get started</h3>
                <p>We&apos;ll fetch a preview and you can save it to your library.</p>
              </div>
            </section>
          ) : null}

          {showLoadingState ? (
            <section
              className="manual-bookmark-dialog__state"
              data-testid="manual-bookmark-loading-state"
            >
              <LoaderCircle
                className="manual-bookmark-dialog__spinner"
                size={26}
                strokeWidth={1.9}
              />
              <div>
                <h3>Fetching preview…</h3>
                <p>Pulling in enough metadata to make the save feel trustworthy.</p>
              </div>
            </section>
          ) : null}

          {showErrorState ? (
            <section
              className="manual-bookmark-dialog__state manual-bookmark-dialog__state--error"
              data-testid="manual-bookmark-error-state"
            >
              <AlertCircle size={28} strokeWidth={1.9} />
              <div>
                <h3>Couldn&apos;t load preview</h3>
                <p>{resolvedErrorMessage}</p>
              </div>
              <button type="button" className="button button--ghost" onClick={onRetry}>
                <RefreshCcw size={16} strokeWidth={2.1} />
                Try again
              </button>
            </section>
          ) : null}

          {showPreviewState && resolvedPreview ? (
            <div className="manual-bookmark-dialog__preview-stack">
              <ManualBookmarkPreviewCard preview={resolvedPreview} />
              {isFetchingPreview ? (
                <p className="manual-bookmark-dialog__hint">Refreshing preview…</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="manual-bookmark-dialog__footer">
        {saveErrorMessage ? (
          <p className="manual-bookmark-dialog__footer-note manual-bookmark-dialog__footer-note--error">
            {saveErrorMessage}
          </p>
        ) : null}

        <button
          type="button"
          className="button manual-bookmark-dialog__save"
          data-testid="manual-bookmark-save-button"
          disabled={!canSave}
          onClick={onSave}
        >
          {isSaving ? (
            <>
              <LoaderCircle
                className="manual-bookmark-dialog__spinner"
                size={16}
                strokeWidth={2.1}
              />
              Saving...
            </>
          ) : (
            <>
              <Plus size={16} strokeWidth={2.2} />
              Save to library
            </>
          )}
        </button>
      </div>
    </div>
  );
}
