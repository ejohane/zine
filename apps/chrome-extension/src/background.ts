import { getSuccessMessage, saveBookmarkUrl, type SaveBookmarkResult } from './api.js';
import { extensionApi } from './extension-api.js';
import { loadSettings } from './settings.js';

const CONTEXT_MENU_ID = 'save-page-to-zine';

function setBadge(tabId: number | undefined, result: SaveBookmarkResult): void {
  if (!tabId) {
    return;
  }

  if (result.ok) {
    void extensionApi.action.setBadgeText({ tabId, text: 'OK' });
    void extensionApi.action.setBadgeBackgroundColor({ color: '#2da85f' });
    void extensionApi.action.setTitle({ tabId, title: getSuccessMessage(result) });
    return;
  }

  void extensionApi.action.setBadgeText({ tabId, text: '!' });
  void extensionApi.action.setBadgeBackgroundColor({ color: '#d64545' });
  void extensionApi.action.setTitle({ tabId, title: result.message });
}

async function saveFromTab(tab?: { id?: number; url?: string }): Promise<void> {
  if (!tab?.url) {
    return;
  }

  const settings = await loadSettings();
  const result = await saveBookmarkUrl(settings, tab.url);
  setBadge(tab.id, result);

  if (!result.ok && result.code === 'missing_token') {
    extensionApi.runtime.openOptionsPage();
  }
}

extensionApi.runtime.onInstalled.addListener(() => {
  extensionApi.contextMenus.removeAll(() => {
    extensionApi.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Save page to Zine',
      contexts: ['page'],
    });
  });
});

extensionApi.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) {
    return;
  }

  void saveFromTab(tab);
});
