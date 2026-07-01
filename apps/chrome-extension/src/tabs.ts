import { extensionApi } from './extension-api.js';

export interface ActivePage {
  title: string;
  url: string;
}

export async function getActivePage(): Promise<ActivePage | null> {
  const [tab] = await extensionApi.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    return null;
  }

  return {
    title: tab.title?.trim() || 'Untitled page',
    url: tab.url,
  };
}

export function getDisplayDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Current page';
  }
}
