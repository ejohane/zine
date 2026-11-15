export type Identity = { owner: string; offline: boolean };
type Clerk = {
  isSignedIn: boolean;
  user?: { id: string };
  session?: { getToken: () => Promise<string | null> };
  load: (options: unknown) => Promise<void>;
  mountSignIn: (element: HTMLElement, options: unknown) => void;
  signOut: () => Promise<void>;
  addListener: (listener: (state: { user: { id: string } | null }) => void) => () => void;
};
declare global {
  interface Window {
    Clerk?: Clerk;
    __internal_ClerkUICtor?: unknown;
  }
}
function script(src: string, key?: string) {
  return new Promise<void>((resolve, reject) => {
    const element = document.createElement('script');
    element.src = src;
    element.crossOrigin = 'anonymous';
    if (key) element.dataset.clerkPublishableKey = key;
    element.onload = () => resolve();
    element.onerror = () => reject(Error('Sign-in could not load. Check your connection.'));
    document.head.append(element);
  });
}
let loading: Promise<Clerk> | undefined;
/**
 * Local development: the dev server signs every /v1 request in with the local API token, so the
 * browser needs no sign-in. The account is whatever that token belongs to. Never in a build.
 */
async function localAuth(): Promise<Clerk> {
  const response = await fetch('/v1/me', { headers: { accept: 'application/json' } });
  if (!response.ok)
    throw Error(
      'Local API unavailable. Run `bun run local:pull` and `bun run local:dev` in apps/api.'
    );
  const { id } = (await response.json()) as { id: string };
  return {
    isSignedIn: true,
    user: { id },
    session: { getToken: async () => 'local-development' },
    load: async () => {},
    mountSignIn: () => {},
    signOut: async () => {},
    addListener: () => () => {},
  };
}
export function loadAuth() {
  if (import.meta.env?.DEV) return (loading ??= localAuth());
  return (loading ??= (async () => {
    await script('https://clerk.myzine.app/npm/@clerk/ui@1/dist/ui.browser.js');
    await script(
      'https://clerk.myzine.app/npm/@clerk/clerk-js@6/dist/clerk.browser.js',
      'pk_live_Y2xlcmsubXl6aW5lLmFwcCQ'
    );
    if (!window.Clerk) throw Error('Sign-in could not load.');
    await window.Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor } });
    return window.Clerk;
  })());
}
export async function token() {
  const auth = await loadAuth();
  const value = await auth.session?.getToken();
  if (!value) throw Error('Your session has ended. Sign in again.');
  return value;
}
