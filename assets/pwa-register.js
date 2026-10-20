(() => {
  'use strict';
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const script = document.currentScript;
  if (!script?.src) return;
  const root = new URL('../', script.src);
  const register = () => {
    // A new worker takes over naturally. Never reload an ongoing lesson.
    void navigator.serviceWorker.register(new URL('service-worker.js', root).href, {
      scope: root.pathname,
      updateViaCache: 'none',
    }).catch(() => { /* Sign-in and lessons also work without installation. */ });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
})();
