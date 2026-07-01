import {
  DEFAULT_API_BASE_URL,
  DEFAULT_WEB_BASE_URL,
  loadSettings,
  saveSettings,
} from './settings.js';

const form = document.querySelector<HTMLFormElement>('#settingsForm');
const tokenInput = document.querySelector<HTMLInputElement>('#tokenInput');
const apiBaseUrlInput = document.querySelector<HTMLInputElement>('#apiBaseUrlInput');
const webBaseUrlInput = document.querySelector<HTMLInputElement>('#webBaseUrlInput');
const clearTokenButton = document.querySelector<HTMLButtonElement>('#clearTokenButton');
const optionsStatus = document.querySelector<HTMLElement>('#optionsStatus');

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) {
    throw new Error(`Missing ${name}`);
  }

  return element;
}

const ui = {
  form: requireElement(form, 'settingsForm'),
  tokenInput: requireElement(tokenInput, 'tokenInput'),
  apiBaseUrlInput: requireElement(apiBaseUrlInput, 'apiBaseUrlInput'),
  webBaseUrlInput: requireElement(webBaseUrlInput, 'webBaseUrlInput'),
  clearTokenButton: requireElement(clearTokenButton, 'clearTokenButton'),
  optionsStatus: requireElement(optionsStatus, 'optionsStatus'),
};

function setStatus(kind: 'neutral' | 'success' | 'warning' | 'danger', message: string): void {
  ui.optionsStatus.className = `status-panel ${kind}`;
  const text = ui.optionsStatus.querySelector('p');

  if (text) {
    text.textContent = message;
  }
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function load(): Promise<void> {
  const settings = await loadSettings();
  ui.tokenInput.value = settings.token;
  ui.apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_API_BASE_URL;
  ui.webBaseUrlInput.value = settings.webBaseUrl || DEFAULT_WEB_BASE_URL;
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  const token = ui.tokenInput.value.trim();
  const apiBaseUrl = ui.apiBaseUrlInput.value.trim();
  const webBaseUrl = ui.webBaseUrlInput.value.trim();

  if (token && !token.startsWith('zine_pat_')) {
    setStatus('warning', 'This does not look like a Zine API token.');
    return;
  }

  if (!isValidUrl(apiBaseUrl) || !isValidUrl(webBaseUrl)) {
    setStatus('danger', 'Use valid http or https URLs.');
    return;
  }

  await saveSettings({ apiBaseUrl, token, webBaseUrl });
  setStatus(
    token ? 'success' : 'warning',
    token ? 'Settings saved.' : 'Settings saved without a token.'
  );
}

async function clearToken(): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({
    ...settings,
    token: '',
  });
  ui.tokenInput.value = '';
  setStatus('warning', 'Token cleared.');
}

ui.form.addEventListener('submit', (event) => {
  void handleSubmit(event);
});
ui.clearTokenButton.addEventListener('click', () => {
  void clearToken();
});

void load();
