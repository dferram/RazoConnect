/**
 * network-status.js
 * Detecta y notifica al usuario cuando pierde/recupera conexión a internet.
 * Debe cargarse en el <head> o al inicio del <body> de todas las páginas del admin.
 */

(() => {
  const BANNER_ID = 'network-status-banner';

  const createBanner = () => {
    if (document.getElementById(BANNER_ID)) return;

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.setAttribute('role', 'alert');
    banner.setAttribute('aria-live', 'assertive');
    banner.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      background: #ef4444;
      color: white;
      text-align: center;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;
    banner.textContent = 'Sin conexión a internet. Algunas funciones no estarán disponibles.';
    document.body.prepend(banner);
  };

  const showOfflineBanner = () => {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.style.display = 'block';
  };

  const hideOfflineBanner = () => {
    const banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.style.background = '#22c55e';
      banner.textContent = 'Conexión restaurada.';
      setTimeout(() => {
        banner.style.display = 'none';
        banner.style.background = '#ef4444';
        banner.textContent = 'Sin conexión a internet. Algunas funciones no estarán disponibles.';
      }, 2500);
    }
  };

  // Inicializar cuando el DOM esté listo
  const init = () => {
    createBanner();

    if (!navigator.onLine) showOfflineBanner();

    window.addEventListener('offline', showOfflineBanner);
    window.addEventListener('online', hideOfflineBanner);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
