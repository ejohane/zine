import { describe, expect, it } from 'bun:test';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { ContentType, Provider } from '@zine/shared';

import {
  ManualBookmarkDialogView,
  type ManualBookmarkDialogViewProps,
} from '../src/components/manual-bookmark-dialog-view';

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function collectText(
  node: TestRenderer.ReactTestRendererJSON | TestRenderer.ReactTestRendererJSON[] | null
) {
  if (!node) {
    return '';
  }

  if (Array.isArray(node)) {
    return node.map((child) => collectText(child)).join(' ');
  }

  const children = node.children ?? [];

  return children
    .map((child) => (typeof child === 'string' ? child : collectText(child)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const preview = {
  provider: Provider.WEB,
  contentType: ContentType.ARTICLE,
  providerId: 'preview-1',
  title: 'A calm web modal for saving bookmarks',
  creator: 'Zine Editorial',
  creatorImageUrl: null,
  thumbnailUrl: 'https://example.com/thumbnail.png',
  duration: null,
  canonicalUrl: 'https://example.com/story',
  source: 'article_extractor',
  description: 'A preview card should feel like the same product as mobile.',
  siteName: 'Example',
  wordCount: 850,
  readingTimeMinutes: 4,
  hasArticleContent: true,
  publishedAt: '2026-04-10T12:00:00.000Z',
  rawMetadata: undefined,
} satisfies ManualBookmarkDialogViewProps['preview'];

function createProps(
  overrides: Partial<ManualBookmarkDialogViewProps> = {}
): ManualBookmarkDialogViewProps {
  return {
    url: '',
    isUrlValid: false,
    preview: null,
    isLoadingPreview: false,
    isFetchingPreview: false,
    previewErrorMessage: null,
    isSaving: false,
    onClose: () => {},
    onUrlChange: () => {},
    onPaste: () => {},
    onClear: () => {},
    onRetry: () => {},
    onSave: () => {},
    ...overrides,
  };
}

describe('ManualBookmarkDialogView', () => {
  it('renders the empty state and disables save before a URL is entered', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<ManualBookmarkDialogView {...createProps()} />);
    });

    expect(
      renderer.root.findByProps({ 'data-testid': 'manual-bookmark-empty-state' })
    ).toBeTruthy();
    expect(
      renderer.root.findByProps({ 'data-testid': 'manual-bookmark-save-button' }).props.disabled
    ).toBe(true);
  });

  it('shows the invalid URL hint before previewing', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <ManualBookmarkDialogView {...createProps({ url: 'not a url', isUrlValid: false })} />
      );
    });

    expect(collectText(renderer.toJSON())).toContain(
      'Please enter a valid URL (http:// or https://)'
    );
  });

  it('renders the preview card and enables save when preview data is ready', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <ManualBookmarkDialogView
          {...createProps({
            url: preview.canonicalUrl,
            isUrlValid: true,
            preview,
          })}
        />
      );
    });

    expect(
      renderer.root.findByProps({ 'data-testid': 'manual-bookmark-preview-card' })
    ).toBeTruthy();
    expect(collectText(renderer.toJSON())).toContain(preview.title);
    expect(collectText(renderer.toJSON())).toContain(preview.creator);
    expect(
      renderer.root.findByProps({ 'data-testid': 'manual-bookmark-save-button' }).props.disabled
    ).toBe(false);
  });

  it('shows an inline error state with retry affordance when preview fails', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <ManualBookmarkDialogView
          {...createProps({
            url: 'https://example.com/story',
            isUrlValid: true,
            previewErrorMessage: 'Preview fetch failed.',
          })}
        />
      );
    });

    expect(
      renderer.root.findByProps({ 'data-testid': 'manual-bookmark-error-state' })
    ).toBeTruthy();
    expect(collectText(renderer.toJSON())).toContain('Preview fetch failed.');
    expect(collectText(renderer.toJSON())).toContain('Try again');
  });

  it('shows saving feedback while a bookmark is being created', () => {
    let renderer!: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <ManualBookmarkDialogView
          {...createProps({
            url: preview.canonicalUrl,
            isUrlValid: true,
            preview,
            isSaving: true,
          })}
        />
      );
    });

    expect(
      renderer.root.findByProps({ 'data-testid': 'manual-bookmark-save-button' }).props.disabled
    ).toBe(true);
    expect(collectText(renderer.toJSON())).toContain('Saving...');
  });
});
