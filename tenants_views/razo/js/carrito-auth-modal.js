/**
 * CARRITO AUTH MODAL HANDLER
 * Maneja la autenticación modal en la página de carrito
 * Permite a invitados ver productos y requiere login solo al checkout
 */

(function() {
  'use strict';

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    const modalAuth = document.getElementById('modalAuth');
    const btnCerrarAuth = document.getElementById('btnCerrarAuth');
    const tabLogin = document.getElementById('tabLogin');
    const tabRegistro = document.getElementById('tabRegistro');
    const formLogin = document.getElementById('formLogin');
    const formRegistro = document.getElementById('formRegistro');
    const btnGoogleAuth = document.getElementById('btnGoogleAuth');

    if (!modalAuth || !formLogin || !formRegistro) {
      console.warn('Modal auth elements not found');
      return;
    }

    // Tab switching
    function switchToLogin() {
      tabLogin.classList.add('active');
      tabLogin.style.borderBottomColor = 'var(--razo-orange)';
      tabLogin.style.color = 'var(--razo-orange)';
      tabRegistro.classList.remove('active');
      tabRegistro.style.borderBottomColor = 'transparent';
      tabRegistro.style.color = '#6b7280';
      formRegistro.style.display = 'none';
      formLogin.style.display = 'block';
    }

    function switchToRegistro() {
      tabRegistro.classList.add('active');
      tabRegistro.style.borderBottomColor = 'var(--razo-orange)';
      tabRegistro.style.color = 'var(--razo-orange)';
      tabLogin.classList.remove('active');
      tabLogin.style.borderBottomColor = 'transparent';
      tabLogin.style.color = '#6b7280';
      formLogin.style.display = 'none';
      formRegistro.style.display = 'block';
    }

    tabLogin.addEventListener('click', switchToLogin);
    tabRegistro.addEventListener('click', switchToRegistro);

    // Initialize Bootstrap modal instance
    const bsModal = new bootstrap.Modal(modalAuth, {
      backdrop: 'static', // Don't close on backdrop click during checkout
      keyboard: true
    });

    // Modal control functions
    window.openAuthModal = function() {
      switchToLogin();
      bsModal.show();
    };

    window.closeAuthModal = function() {
      bsModal.hide();
      formLogin.reset();
      formRegistro.reset();
    };

    btnCerrarAuth.addEventListener('click', window.closeAuthModal);

    // Guest cart synchronization
    async function syncGuestCartToServer() {
      if (typeof CarritoService === 'undefined') {
        console.warn('CarritoService not available');
        return;
      }

      const guestCart = CarritoService.getGuestCart();
      
      if (!guestCart || guestCart.length === 0) {
        console.log('No guest cart to sync');
        return;
      }

      console.log('Syncing guest cart:', guestCart);
      
      let syncedCount = 0;
      let failedCount = 0;

      for (const item of guestCart) {
        try {
          await API.agregarAlCarrito(item.varianteId, item.cantidad, item.tamanoId);
          syncedCount++;
        } catch (error) {
          console.error('Error syncing cart item:', error);
          failedCount++;
        }
      }

      // Clear guest cart after sync
      CarritoService.clearGuestCart();

      if (syncedCount > 0) {
        showToast(`${syncedCount} producto(s) sincronizado(s) a tu carrito`, 'success');
      }

      if (failedCount > 0) {
        showToast(`${failedCount} producto(s) no pudieron sincronizarse`, 'warning');
      }

      // Reload cart to show synced items
      if (typeof window.loadCarrito === 'function') {
        await window.loadCarrito();
      }
    }

    // Login form handler
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const btnLoginText = document.getElementById('btnLoginText');
      const btnLoginSpinner = document.getElementById('btnLoginSpinner');
      const btnLoginSubmit = document.getElementById('btnLoginSubmit');

      if (!email || !password) {
        showToast('Por favor completa todos los campos', 'warning');
        return;
      }

      btnLoginSubmit.disabled = true;
      btnLoginText.style.display = 'none';
      btnLoginSpinner.style.display = 'inline-block';

      try {
        const response = await API.login(email, password);

        if (response.ok && response.data.success) {
          // Save auth data
          localStorage.setItem('razoconnect_token', response.data.token);
          localStorage.setItem('razoconnect_user', JSON.stringify(response.data.cliente));
          
          showToast('Sesión iniciada correctamente', 'success');
          
          // Sync guest cart
          await syncGuestCartToServer();
          
          window.closeAuthModal();
          
          // Dispatch auth changed event
          window.dispatchEvent(new CustomEvent('razoconnect:auth-changed'));
          
          // Continue with checkout if it was triggered
          if (window.isConfirmingPedido && typeof window.continuarCheckout === 'function') {
            window.continuarCheckout();
          }
        } else {
          showToast(response.data.message || 'Credenciales incorrectas', 'error');
        }
      } catch (error) {
        console.error('Login error:', error);
        showToast('Error al iniciar sesión. Por favor intenta nuevamente.', 'error');
      } finally {
        btnLoginSubmit.disabled = false;
        btnLoginText.style.display = 'inline';
        btnLoginSpinner.style.display = 'none';
      }
    });

    // Register form handler
    formRegistro.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const nombre = document.getElementById('regNombre').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const telefono = document.getElementById('regTelefono').value.trim();
      const password = document.getElementById('regPassword').value;
      const btnRegistroText = document.getElementById('btnRegistroText');
      const btnRegistroSpinner = document.getElementById('btnRegistroSpinner');
      const btnRegistroSubmit = document.getElementById('btnRegistroSubmit');

      if (!nombre || !email || !telefono || !password) {
        showToast('Por favor completa todos los campos', 'warning');
        return;
      }

      btnRegistroSubmit.disabled = true;
      btnRegistroText.style.display = 'none';
      btnRegistroSpinner.style.display = 'inline-block';

      try {
        const response = await API.registroCliente({
          Nombre: nombre,
          Email: email,
          Telefono: telefono,
          Password: password
        });

        if (response.ok && response.data.success) {
          showToast('Cuenta creada exitosamente', 'success');
          
          // Auto-login after registration
          const loginResponse = await API.login(email, password);
          if (loginResponse.ok && loginResponse.data.success) {
            // Save auth data
            localStorage.setItem('razoconnect_token', loginResponse.data.token);
            localStorage.setItem('razoconnect_user', JSON.stringify(loginResponse.data.cliente));
            
            // Sync guest cart
            await syncGuestCartToServer();
            
            window.closeAuthModal();
            
            // Dispatch auth changed event
            window.dispatchEvent(new CustomEvent('razoconnect:auth-changed'));
            
            // Continue with checkout if it was triggered
            if (window.isConfirmingPedido && typeof window.continuarCheckout === 'function') {
              window.continuarCheckout();
            }
          }
        } else {
          showToast(response.data.message || 'Error al crear cuenta', 'error');
        }
      } catch (error) {
        console.error('Registration error:', error);
        showToast('Error al registrar usuario. Por favor intenta nuevamente.', 'error');
      } finally {
        btnRegistroSubmit.disabled = false;
        btnRegistroText.style.display = 'inline';
        btnRegistroSpinner.style.display = 'none';
      }
    });

    // Google Auth handler
    if (btnGoogleAuth) {
      btnGoogleAuth.addEventListener('click', () => {
        // Store current page for redirect after auth
        sessionStorage.setItem('auth_redirect', window.location.pathname);
        window.location.href = '/auth/google';
      });
    }

    console.log('Carrito auth modal initialized');
  }
})();
