export type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export async function registerOffline(
  onReady: () => void,
  onUpdate: (registration: ServiceWorkerRegistration) => void,
  onError: () => void
) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(
      import.meta.env.BASE_URL + 'sw.js',
      { scope: import.meta.env.BASE_URL, updateViaCache: 'none' }
    );
    if (registration.waiting) onUpdate(registration);
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', () => {
        if (registration.waiting && navigator.serviceWorker.controller) onUpdate(registration);
      });
    });
    await navigator.serviceWorker.ready;
    onReady();
  } catch {
    onError();
  }
}
