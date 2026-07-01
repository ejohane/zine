import type { ExtensionSettings } from './settings.js';

export type SaveState = 'idle' | 'saving' | 'success' | 'warning' | 'danger';

export interface SaveBookmarkSuccess {
  ok: true;
  status: 'created' | 'already_bookmarked' | 'rebookmarked';
  title: string | null;
  userItemId: string | null;
}

export interface SaveBookmarkFailure {
  ok: false;
  code: 'missing_token' | 'invalid_url' | 'unauthorized' | 'forbidden' | 'unsupported' | 'network';
  message: string;
}

export type SaveBookmarkResult = SaveBookmarkSuccess | SaveBookmarkFailure;

interface SaveBookmarkResponse {
  bookmark?: {
    status?: SaveBookmarkSuccess['status'];
    userItemId?: string;
  };
  item?: {
    title?: string;
  };
  error?: string;
  code?: string;
}

function canSaveUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getEndpoint(settings: ExtensionSettings): string {
  return `${settings.apiBaseUrl}/api/v1/bookmarks`;
}

export async function saveBookmarkUrl(
  settings: ExtensionSettings,
  url: string
): Promise<SaveBookmarkResult> {
  if (!settings.token) {
    return {
      ok: false,
      code: 'missing_token',
      message: 'Add a Zine API token before saving.',
    };
  }

  if (!canSaveUrl(url)) {
    return {
      ok: false,
      code: 'invalid_url',
      message: 'Chrome pages and local browser screens cannot be saved.',
    };
  }

  try {
    const response = await fetch(getEndpoint(settings), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    const body = (await response.json().catch(() => ({}))) as SaveBookmarkResponse;

    if (response.ok) {
      return {
        ok: true,
        status: body.bookmark?.status ?? 'created',
        title: body.item?.title ?? null,
        userItemId: body.bookmark?.userItemId ?? null,
      };
    }

    if (response.status === 401) {
      return {
        ok: false,
        code: 'unauthorized',
        message: 'That API token was not accepted.',
      };
    }

    if (response.status === 403) {
      return {
        ok: false,
        code: 'forbidden',
        message: 'This token needs Add bookmarks enabled.',
      };
    }

    if (response.status === 422) {
      return {
        ok: false,
        code: 'unsupported',
        message: body.error ?? 'Zine could not preview this URL.',
      };
    }

    return {
      ok: false,
      code: 'network',
      message: body.error ?? `Zine returned HTTP ${response.status}.`,
    };
  } catch {
    return {
      ok: false,
      code: 'network',
      message: 'Could not reach the Zine API.',
    };
  }
}

export function getSuccessMessage(result: SaveBookmarkSuccess): string {
  if (result.status === 'already_bookmarked') {
    return 'Already saved in Zine.';
  }

  if (result.status === 'rebookmarked') {
    return 'Restored to your bookmarks.';
  }

  return 'Saved to Zine.';
}
