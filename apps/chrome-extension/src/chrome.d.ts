export {};

interface ChromeTab {
  id?: number;
  title?: string;
  url?: string;
}

interface ChromeContextMenuInfo {
  menuItemId: string | number;
  pageUrl?: string;
  linkUrl?: string;
}

interface ChromeRuntime {
  getURL(path: string): string;
  openOptionsPage(callback?: () => void): void;
  lastError?: { message?: string };
  onInstalled: {
    addListener(listener: () => void): void;
  };
}

interface ChromeAction {
  setBadgeText(details: { tabId?: number; text: string }): Promise<void> | void;
  setBadgeBackgroundColor(details: { color: string }): Promise<void> | void;
  setTitle(details: { tabId?: number; title: string }): Promise<void> | void;
}

interface ChromeContextMenus {
  create(details: { id: string; title: string; contexts: string[] }): void;
  removeAll(callback?: () => void): void;
  onClicked: {
    addListener(listener: (info: ChromeContextMenuInfo, tab?: ChromeTab) => void): void;
  };
}

interface ChromeStorageArea {
  get<T>(keys: string | string[] | Record<string, unknown> | null): Promise<T>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromeTabs {
  query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<ChromeTab[]>;
}

interface ChromeNamespace {
  action: ChromeAction;
  contextMenus: ChromeContextMenus;
  runtime: ChromeRuntime;
  storage: {
    local: ChromeStorageArea;
  };
  tabs: ChromeTabs;
}

declare global {
  var chrome: ChromeNamespace;
  var browser: ChromeNamespace | undefined;
}
