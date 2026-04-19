import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const INSTALL_PROMPT_DISMISS_KEY = 'zine:web:pwa-install-dismissed-at';
const INSTALL_PROMPT_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InstallAvailability = 'unsupported' | 'prompt' | 'ios' | 'installed';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type PwaContextValue = {
  installAvailability: InstallAvailability;
  isInstallPromptDismissed: boolean;
  isOnline: boolean;
  isStandalone: boolean;
  isIos: boolean;
  promptInstall: () => Promise<boolean>;
  dismissInstallPrompt: () => void;
  clearInstallPromptDismissal: () => void;
};

const defaultPwaContext: PwaContextValue = {
  installAvailability: 'unsupported',
  isInstallPromptDismissed: false,
  isOnline: true,
  isStandalone: false,
  isIos: false,
  promptInstall: async () => false,
  dismissInstallPrompt: () => {},
  clearInstallPromptDismissal: () => {},
};

const PwaContext = createContext<PwaContextValue>(defaultPwaContext);

function isIosDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isAndroidDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }

  return /Android/i.test(navigator.userAgent);
}

function shouldShowIosInstallGuidance() {
  if (typeof navigator === 'undefined' || !isIosDevice()) {
    return false;
  }

  return true;
}

function getLocalStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  const storage = window.localStorage;
  return storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function'
    ? storage
    : null;
}

function getStandaloneDisplayMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const standaloneMediaQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;

  return standaloneMediaQuery?.matches === true || window.navigator.standalone === true;
}

function readInstallPromptDismissedAt() {
  const storage = getLocalStorage();
  const rawValue = storage?.getItem(INSTALL_PROMPT_DISMISS_KEY);
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [isStandalone, setIsStandalone] = useState(getStandaloneDisplayMode);
  const [dismissedAt, setDismissedAt] = useState<number | null>(readInstallPromptDismissedAt);
  const isIos = useMemo(() => isIosDevice(), []);
  const isAndroid = useMemo(() => isAndroidDevice(), []);
  const shouldShowIosInstallHelp = useMemo(() => shouldShowIosInstallGuidance(), [isIos]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncStandaloneState = () => {
      setIsStandalone(getStandaloneDisplayMode());
    };

    const standaloneMediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    syncStandaloneState();

    standaloneMediaQuery?.addEventListener?.('change', syncStandaloneState);
    standaloneMediaQuery?.addListener?.(syncStandaloneState);
    window.addEventListener('appinstalled', syncStandaloneState);

    return () => {
      standaloneMediaQuery?.removeEventListener?.('change', syncStandaloneState);
      standaloneMediaQuery?.removeListener?.(syncStandaloneState);
      window.removeEventListener('appinstalled', syncStandaloneState);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent;
      installEvent.preventDefault();
      setDeferredPrompt(installEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      getLocalStorage()?.removeItem(INSTALL_PROMPT_DISMISS_KEY);
      setDismissedAt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.pwaDisplayMode = isStandalone ? 'standalone' : 'browser';
    document.documentElement.dataset.pwaPlatform = isIos ? 'ios' : isAndroid ? 'android' : 'other';
  }, [isAndroid, isIos, isStandalone]);

  const installAvailability = useMemo<InstallAvailability>(() => {
    if (isStandalone) {
      return 'installed';
    }

    if (deferredPrompt) {
      return 'prompt';
    }

    if (shouldShowIosInstallHelp) {
      return 'ios';
    }

    return 'unsupported';
  }, [deferredPrompt, isStandalone, shouldShowIosInstallHelp]);

  const isInstallPromptDismissed = useMemo(() => {
    if (!dismissedAt) {
      return false;
    }

    return Date.now() - dismissedAt < INSTALL_PROMPT_DISMISS_TTL_MS;
  }, [dismissedAt]);

  const dismissInstallPrompt = useCallback(() => {
    const storage = getLocalStorage();

    const timestamp = Date.now();
    storage?.setItem(INSTALL_PROMPT_DISMISS_KEY, String(timestamp));
    setDismissedAt(timestamp);
  }, []);

  const clearInstallPromptDismissal = useCallback(() => {
    getLocalStorage()?.removeItem(INSTALL_PROMPT_DISMISS_KEY);
    setDismissedAt(null);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return false;
    }

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'accepted') {
      clearInstallPromptDismissal();
      setIsStandalone(getStandaloneDisplayMode());
      return true;
    }

    dismissInstallPrompt();
    return false;
  }, [clearInstallPromptDismissal, deferredPrompt, dismissInstallPrompt]);

  return (
    <PwaContext.Provider
      value={{
        installAvailability,
        isInstallPromptDismissed,
        isOnline,
        isStandalone,
        isIos,
        promptInstall,
        dismissInstallPrompt,
        clearInstallPromptDismissal,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwaState() {
  return useContext(PwaContext);
}
