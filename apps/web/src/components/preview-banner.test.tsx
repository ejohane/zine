import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { PreviewBanner } from './preview-banner';

describe('PreviewBanner', () => {
  test('stays out of production rendering', () => {
    const { container } = render(<PreviewBanner isPreview={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  test('identifies the preview and links to its exact commit', () => {
    render(
      <PreviewBanner
        isPreview
        previewId="codex-library-workbench-web-1234abcd"
        gitSha="06ecc71dddc313e47a90c376b611d130658cd7cc"
      />
    );

    expect(screen.getByRole('complementary', { name: 'Preview deployment' })).toBeVisible();
    expect(screen.getByText('Connected to live Zine data')).toBeVisible();
    expect(screen.getByText('codex-library-workbench-web-1234abcd')).toBeVisible();
    expect(screen.getByRole('link', { name: /06ecc71/i })).toHaveAttribute(
      'href',
      'https://github.com/ejohane/zine/commit/06ecc71dddc313e47a90c376b611d130658cd7cc'
    );
  });
});
