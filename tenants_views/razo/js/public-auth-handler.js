/**
 * PUBLIC AUTH HANDLER
 * Maneja la autenticación en páginas públicas (inicio, catalogo, carrito)
 * Muestra modal de login en lugar de redirigir
 */

(function() {
  'use strict';

  // Check if user is authenticated
  const isAuthenticated = () => {
    return !!localStorage.getItem('razoconnect_token');
  };

  // Get user data
  const getUserData = () => {
    try {
      const userData = localStorage.getItem('razoconnect_user');
      return userData ? JSON.parse(userData) : null;
    } catch {
      return null;
    }
  };

  // Update UI based on authentication state
  function updateAuthUI() {
    const authenticated = isAuthenticated();
    const user = getUserData();

    // Update header links
    const loginLinks = document.querySelectorAll('[data-auth="login"]');
    const logoutLinks = document.querySelectorAll('[data-auth="logout"]');
    const dashboardLinks = document.querySelectorAll('[data-auth="dashboard"]');
    const creditLinks = document.querySelectorAll('[data-auth="credit"]');

    if (authenticated) {
      // Hide login, show logout and protected links
      loginLinks.forEach(el => el.style.display = 'none');
      logoutLinks.forEach(el => el.style.display = 'block');
      dashboardLinks.forEach(el => el.style.display = 'block');
      creditLinks.forEach(el => el.style.display = 'block');

      // Update welcome message if exists
      const userName = document.getElementById('userName');
      if (userName && user) {
        userName.textContent = user.nombre || user.Nombre || 'Usuario';
      }
    } else {
      // Show login, hide logout and protected links
      loginLinks.forEach(el => el.style.display = 'block');
      logoutLinks.forEach(el => el.style.display = 'none');
      dashboardLinks.forEach(el => el.style.display = 'none');
      creditLinks.forEach(el => el.style.display = 'none');

      // Update welcome message for guest
      const userName = document.getElementById('userName');
      if (userName) {
        userName.textContent = 'Invitado';
      }
    }
  }

  // Open authentication modal (if exists on page)
  function openAuthModal() {
    const modalAuth = document.getElementById('modalAuth');
    if (modalAuth) {
      modalAuth.classList.add('show');
    } else {
      // Fallback: redirect to login page
      window.location.href = '/login.html';
    }
  }

  // Handle clicks on protected links
  function handleProtectedLinkClick(event) {
    if (!isAuthenticated()) {
      event.preventDefault();
      openAuthModal();
      return false;
    }
    return true;
  }

  // Initialize on page load
  document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();

    // Add click handlers to protected links
    const protectedLinks = document.querySelectorAll('[data-auth="dashboard"], [data-auth="credit"]');
    protectedLinks.forEach(link => {
      link.addEventListener('click', handleProtectedLinkClick);
    });

    // Add click handler to login links to open modal instead of redirect
    const loginLinks = document.querySelectorAll('[data-auth="login"]');
    loginLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal();
      });
    });

    // Listen for auth state changes
    window.addEventListener('razoconnect:auth-changed', () => {
      updateAuthUI();
    });
  });

  // Export functions for use in other scripts
  window.PublicAuthHandler = {
    isAuthenticated,
    getUserData,
    updateAuthUI,
    openAuthModal,
    handleProtectedLinkClick
  };
})();
