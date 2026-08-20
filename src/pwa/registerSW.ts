import { registerSW } from 'virtual:pwa-register';

export function registerServiceWorker() {
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Automatically activate new service worker when autoUpdate is triggered
        updateSW(true);
      },
      onOfflineReady() {
        console.info('[SOOCHI PWA] App ready to work offline');
      },
      onRegisteredSW(_swUrl, registration) {
        if (registration) {
          // Check for service worker updates periodically every 30 minutes
          setInterval(() => {
            registration.update().catch(() => {});
          }, 30 * 60 * 1000);
        }
      },
    });
  }
}
