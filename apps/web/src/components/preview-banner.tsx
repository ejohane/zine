import { ExternalLink } from 'lucide-react';

import { DEPLOYMENT_ENVIRONMENT, GIT_SHA, IS_PREVIEW_DEPLOYMENT, PREVIEW_ID } from '@/lib/env';

type PreviewBannerProps = {
  isPreview?: boolean;
  previewId?: string;
  gitSha?: string;
};

function getCommitUrl(gitSha: string): string | null {
  if (!/^[0-9a-f]{7,40}$/i.test(gitSha)) {
    return null;
  }

  return `https://github.com/ejohane/zine/commit/${gitSha}`;
}

export function PreviewBanner({
  isPreview = IS_PREVIEW_DEPLOYMENT,
  previewId = PREVIEW_ID,
  gitSha = GIT_SHA,
}: PreviewBannerProps) {
  if (!isPreview) {
    return null;
  }

  const commitUrl = getCommitUrl(gitSha);
  const shortSha = commitUrl ? gitSha.slice(0, 7) : null;

  return (
    <aside className="preview-banner" aria-label="Preview deployment">
      <span className="preview-banner__status" aria-hidden="true" />
      <strong>Preview</strong>
      <span>{previewId || DEPLOYMENT_ENVIRONMENT}</span>
      <span className="preview-banner__warning">Connected to live Zine data</span>
      {commitUrl ? (
        <a href={commitUrl} target="_blank" rel="noreferrer">
          {shortSha}
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      ) : null}
    </aside>
  );
}
