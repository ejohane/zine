import {
  getSuccessMessage,
  saveBookmarkUrl,
  type SaveBookmarkResult,
  type SaveState,
} from './api.js';
import { extensionApi } from './extension-api.js';
import { loadSettings } from './settings.js';
import { getActivePage, getDisplayDomain, type ActivePage } from './tabs.js';

const pageTitle = document.querySelector<HTMLHeadingElement>('#pageTitle');
const pageUrl = document.querySelector<HTMLParagraphElement>('#pageUrl');
const pageDomain = document.querySelector<HTMLParagraphElement>('#pageDomain');
const saveButton = document.querySelector<HTMLButtonElement>('#saveButton');
const openOptions = document.querySelector<HTMLButtonElement>('#openOptions');
const setupButton = document.querySelector<HTMLButtonElement>('#setupButton');
const setupPanel = document.querySelector<HTMLElement>('#setupPanel');
const statusPanel = document.querySelector<HTMLElement>('#statusPanel');
const statusText = document.querySelector<HTMLParagraphElement>('#statusText');
const openZine = document.querySelector<HTMLAnchorElement>('#openZine');
const tagsInput = document.querySelector<HTMLInputElement>('#tagsInput');

let activePage: ActivePage | null = null;

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`Missing ${name}`);
  }

  return element;
}

const ui = {
  pageTitle: requireElement(pageTitle, 'pageTitle'),
  pageUrl: requireElement(pageUrl, 'pageUrl'),
  pageDomain: requireElement(pageDomain, 'pageDomain'),
  saveButton: requireElement(saveButton, 'saveButton'),
  openOptions: requireElement(openOptions, 'openOptions'),
  setupButton: requireElement(setupButton, 'setupButton'),
  setupPanel: requireElement(setupPanel, 'setupPanel'),
  statusPanel: requireElement(statusPanel, 'statusPanel'),
  statusText: requireElement(statusText, 'statusText'),
  openZine: requireElement(openZine, 'openZine'),
  tagsInput: requireElement(tagsInput, 'tagsInput'),
};

function setStatus(state: SaveState, message: string): void {
  ui.statusPanel.className = `status-panel ${state === 'idle' || state === 'saving' ? 'neutral' : state}`;
  ui.statusText.textContent = message;
}

function setPage(page: ActivePage | null): void {
  activePage = page;

  if (!page) {
    ui.pageTitle.textContent = 'No active page found';
    ui.pageUrl.textContent = '';
    ui.pageDomain.textContent = 'Current page';
    ui.saveButton.disabled = true;
    setStatus('danger', 'Open a tab with a web page and try again.');
    return;
  }

  ui.pageTitle.textContent = page.title;
  ui.pageUrl.textContent = page.url;
  ui.pageDomain.textContent = getDisplayDomain(page.url);
}

function setResult(result: SaveBookmarkResult): void {
  if (result.ok) {
    setStatus('success', getSuccessMessage(result));
    ui.saveButton.textContent = 'Saved';
    return;
  }

  const state =
    result.code === 'missing_token' || result.code === 'invalid_url' ? 'warning' : 'danger';
  setStatus(state, result.message);

  if (result.code === 'missing_token') {
    ui.setupPanel.classList.remove('hidden');
  }
}

export function parseBookmarkTags(input: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const tag of input.split(',')) {
    const trimmed = tag.trim();
    const key = trimmed.toLowerCase();

    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    tags.push(trimmed);
  }

  return tags;
}

async function openOptionsPage(): Promise<void> {
  await new Promise<void>((resolve) => {
    extensionApi.runtime.openOptionsPage(resolve);
  });
}

async function handleSave(): Promise<void> {
  if (!activePage) {
    return;
  }

  ui.saveButton.disabled = true;
  ui.saveButton.textContent = 'Saving...';
  setStatus('saving', 'Saving this page...');

  const settings = await loadSettings();
  const tags = parseBookmarkTags(ui.tagsInput.value);
  const result = await saveBookmarkUrl(settings, activePage.url, { tags });
  setResult(result);
  ui.saveButton.disabled = false;

  if (!result.ok) {
    ui.saveButton.textContent = 'Try again';
  }
}

async function init(): Promise<void> {
  const [settings, page] = await Promise.all([loadSettings(), getActivePage()]);

  ui.openZine.href = `${settings.webBaseUrl}/library/bookmarks`;
  ui.setupPanel.classList.toggle('hidden', settings.token.length > 0);
  setPage(page);

  if (page && settings.token.length > 0) {
    ui.saveButton.disabled = false;
    setStatus('idle', 'Ready when you are.');
  } else if (page) {
    setStatus('warning', 'Add an API token before saving.');
  }
}

ui.saveButton.addEventListener('click', () => {
  void handleSave();
});
ui.openOptions.addEventListener('click', () => {
  void openOptionsPage();
});
ui.setupButton.addEventListener('click', () => {
  void openOptionsPage();
});

void init();
