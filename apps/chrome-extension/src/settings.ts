import { extensionApi } from './extension-api.js';

export const DEFAULT_API_BASE_URL = 'https://api.myzine.app';
export const DEFAULT_WEB_BASE_URL = 'https://www.myzine.app';

const SETTINGS_KEY = 'zineExtensionSettings';

export interface ExtensionSettings {
  apiBaseUrl: string;
  token: string;
  webBaseUrl: string;
}

interface StoredSettings {
  zineExtensionSettings?: Partial<ExtensionSettings>;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function defaultSettings(): ExtensionSettings {
  return {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    token: '',
    webBaseUrl: DEFAULT_WEB_BASE_URL,
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await extensionApi.storage.local.get<StoredSettings>(SETTINGS_KEY);
  const settings = stored.zineExtensionSettings ?? {};

  return {
    ...defaultSettings(),
    ...settings,
    apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl ?? DEFAULT_API_BASE_URL),
    token: settings.token?.trim() ?? '',
    webBaseUrl: normalizeBaseUrl(settings.webBaseUrl ?? DEFAULT_WEB_BASE_URL),
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await extensionApi.storage.local.set({
    [SETTINGS_KEY]: {
      apiBaseUrl: normalizeBaseUrl(settings.apiBaseUrl),
      token: settings.token.trim(),
      webBaseUrl: normalizeBaseUrl(settings.webBaseUrl),
    },
  });
}
