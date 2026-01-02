/**
 * SIDEBAR TOGGLE - OFF-CANVAS NAVIGATION FOR TABLETS
 * Maneja el comportamiento retráctil del sidebar en dispositivos iPad/Tablet
 */

(function () {
  'use strict';

  const SIDEBAR_SELECTOR = '.admin-sidebar';
  const TOGGLE_BTN_ID = 'sidebarToggle';
  const ACTIVE_CLASS = 'sidebar-open';
  const OVERLAY_CLASS = 'sidebar-overlay';

  let sidebar = null;
  let toggleBtn = null;
  let overlay = null;

  function init() {
    sidebar = document.querySelector(SIDEBAR_SELECTOR);
    
    if (!sidebar) {
      console.warn('Sidebar no encontrado. El toggle no se inicializará.');
      return;
    }

    createToggleButton();
    createOverlay();
    attachEventListeners();
  }

  function createToggleButton() {
    const existingBtn = document.getElementById(TOGGLE_BTN_ID);
    if (existingBtn) {
      toggleBtn = existingBtn;
      return;
    }

    toggleBtn = document.createElement('button');
    toggleBtn.id = TOGGLE_BTN_ID;
    toggleBtn.className = 'sidebar-toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Abrir menú de navegación');
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.innerHTML = '<i class="bi bi-list"></i>';

    const mainContent = document.querySelector('.admin-main');
    if (mainContent) {
      mainContent.insertBefore(toggleBtn, mainContent.firstChild);
    } else {
      document.body.insertBefore(toggleBtn, document.body.firstChild);
    }
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);
  }

  function attachEventListeners() {
    if (toggleBtn) {
      toggleBtn.addEventListener('click', toggleSidebar);
    }

    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
    }

    document.addEventListener('keydown', handleEscapeKey);

    const sidebarLinks = sidebar.querySelectorAll('.admin-nav-link');
    sidebarLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (window.innerWidth <= 1024) {
          closeSidebar();
        }
      });
    });
  }

  function toggleSidebar() {
    const isOpen = document.body.classList.contains(ACTIVE_CLASS);
    
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  function openSidebar() {
    document.body.classList.add(ACTIVE_CLASS);
    sidebar.classList.add('show');
    overlay.classList.add('show');
    
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.setAttribute('aria-label', 'Cerrar menú de navegación');
    }

    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    document.body.classList.remove(ACTIVE_CLASS);
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
    
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.setAttribute('aria-label', 'Abrir menú de navegación');
    }

    document.body.style.overflow = '';
  }

  function handleEscapeKey(e) {
    if (e.key === 'Escape' && document.body.classList.contains(ACTIVE_CLASS)) {
      closeSidebar();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.sidebarToggle = {
    open: openSidebar,
    close: closeSidebar,
    toggle: toggleSidebar
  };
})();
