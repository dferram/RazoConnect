/**
 * CLIENT AUTH GUARD
 * Protege las páginas de cliente (dashboard, perfil, etc.)
 * Este script debe cargarse al inicio de cada página que requiere autenticación de cliente
 */

(function() {
  'use strict';

  const clientToken = localStorage.getItem('razoconnect_token');

  // Si no hay token, redirigir sin mostrar alerta (usuario no ha iniciado sesión)
  if (!clientToken) {
    console.warn('No client token found. Redirecting to login...');
    window.location.replace('/login.html');
    return;
  }

  // Verificar token con el servidor de forma asíncrona
  fetch('http://localhost:3000/api/clientes/verify', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${clientToken}`,
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

    // Token válido - guardar info del cliente si viene en la respuesta
    if (data.data && data.data.cliente) {
      localStorage.setItem('razoconnect_user', JSON.stringify(data.data.cliente));
    }

    // Permitir que la página continúe cargando
    console.log('✅ Client authenticated successfully');
  })
  .catch(error => {
    console.error('❌ Client authentication failed:', error);
    
    // Limpiar tokens inválidos
    localStorage.removeItem('razoconnect_token');
    localStorage.removeItem('razoconnect_user');
    
    // Solo mostrar alerta si había un token que resultó ser inválido
    alert('Tu sesión ha expirado o es inválida. Por favor, inicia sesión nuevamente.');
    window.location.replace('/login.html');
  });
})();
