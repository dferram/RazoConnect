/**
 * ADMIN AUTH GUARD
 * Protege las páginas de administrador
 * Este script debe cargarse al inicio de cada página de admin
 */

(function() {
  'use strict';

  const adminToken = localStorage.getItem('razoconnect_admin_token');

  // Si no hay token, redirigir sin mostrar alerta (usuario no ha iniciado sesión)
  if (!adminToken) {
    console.warn('No admin token found. Redirecting to login...');
    window.location.replace('/admin-login.html');
    return;
  }

  // Verificar token con el servidor de forma asíncrona
  fetch('http://localhost:3000/api/admin/verify', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${adminToken}`,
      'Content-Type': 'application/json'
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    if (!data.success) {
      throw new Error('Invalid token');
    }

    // Token válido - guardar info del admin si viene en la respuesta
    if (data.data && data.data.admin) {
      localStorage.setItem('razoconnect_admin', JSON.stringify(data.data.admin));
    }

    // Permitir que la página continúe cargando
    console.log('✅ Admin authenticated successfully');
  })
  .catch(error => {
    console.error('❌ Admin authentication failed:', error);
    
    // Limpiar tokens inválidos
    localStorage.removeItem('razoconnect_admin_token');
    localStorage.removeItem('razoconnect_admin');
    
    // Solo mostrar alerta si había un token que resultó ser inválido
    alert('Tu sesión ha expirado o es inválida. Por favor, inicia sesión nuevamente.');
    window.location.replace('/admin-login.html');
  });
})();
