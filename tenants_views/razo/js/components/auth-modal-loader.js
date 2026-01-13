/**
 * AUTH MODAL LOADER
 * Carga el modal de autenticación en páginas públicas
 * Maneja login, registro y toggle de contraseñas
 */

(function() {
  'use strict';

  // Utility function to show toast notifications
  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      z-index: 10000;
      font-weight: 500;
      opacity: 0;
      transform: translateY(1rem);
      transition: all 0.3s ease;
    `;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 100);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(1rem)';
      setTimeout(() => {
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // Make showToast available globally
  window.showToast = showToast;

  // Load the modal HTML
  async function loadAuthModal() {
    try {
      const response = await fetch('/components/auth-modal.html');
      if (!response.ok) throw new Error('Failed to load auth modal');
      
      const html = await response.text();
      const container = document.createElement('div');
      container.innerHTML = html;
      document.body.appendChild(container.firstElementChild);

      // Initialize modal after loading
      initAuthModal();
    } catch (error) {
      console.error('Error loading auth modal:', error);
    }
  }

  // Initialize modal functionality
  function initAuthModal() {
    const modalAuth = document.getElementById('modalAuth');
    const btnCerrar = document.getElementById('btnCerrarAuthModal');
    const tabLogin = document.getElementById('tabLoginModal');
    const tabRegistro = document.getElementById('tabRegistroModal');
    const formLogin = document.getElementById('formLoginModal');
    const formRegistro = document.getElementById('formRegistroModal');

    if (!modalAuth || !formLogin || !formRegistro) {
      console.warn('Auth modal elements not found');
      return;
    }

    // Tab switching functions
    function switchToLogin() {
      tabLogin.style.borderBottomColor = 'var(--razo-orange)';
      tabLogin.style.color = 'var(--razo-orange)';
      tabRegistro.style.borderBottomColor = 'transparent';
      tabRegistro.style.color = '#6b7280';
      formLogin.style.display = 'block';
      formRegistro.style.display = 'none';
    }

    function switchToRegistro() {
      tabRegistro.style.borderBottomColor = 'var(--razo-orange)';
      tabRegistro.style.color = 'var(--razo-orange)';
      tabLogin.style.borderBottomColor = 'transparent';
      tabLogin.style.color = '#6b7280';
      formRegistro.style.display = 'block';
      formLogin.style.display = 'none';
    }

    // Event listeners for tabs
    tabLogin.addEventListener('click', switchToLogin);
    tabRegistro.addEventListener('click', switchToRegistro);

    // Toggle password visibility - Login
    const toggleLoginPassword = document.getElementById('toggleLoginPasswordModal');
    const loginPasswordInput = document.getElementById('loginPasswordModal');
    if (toggleLoginPassword && loginPasswordInput) {
      toggleLoginPassword.addEventListener('click', () => {
        const type = loginPasswordInput.type === 'password' ? 'text' : 'password';
        loginPasswordInput.type = type;
        toggleLoginPassword.querySelector('i').className = type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
      });
    }

    // Toggle password visibility - Registro
    const toggleRegPassword = document.getElementById('toggleRegPasswordModal');
    const regPasswordInput = document.getElementById('regPasswordModal');
    if (toggleRegPassword && regPasswordInput) {
      toggleRegPassword.addEventListener('click', () => {
        const type = regPasswordInput.type === 'password' ? 'text' : 'password';
        regPasswordInput.type = type;
        toggleRegPassword.querySelector('i').className = type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
      });
    }

    // Toggle password visibility - Confirmar Registro
    const toggleRegPasswordConfirm = document.getElementById('toggleRegPasswordConfirmModal');
    const regPasswordConfirmInput = document.getElementById('regPasswordConfirmModal');
    if (toggleRegPasswordConfirm && regPasswordConfirmInput) {
      toggleRegPasswordConfirm.addEventListener('click', () => {
        const type = regPasswordConfirmInput.type === 'password' ? 'text' : 'password';
        regPasswordConfirmInput.type = type;
        toggleRegPasswordConfirm.querySelector('i').className = type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
      });
    }

    // Global functions to open/close modal
    window.openAuthModal = function() {
      modalAuth.style.display = 'flex';
      switchToLogin();
    };

    window.closeAuthModal = function() {
      modalAuth.style.display = 'none';
      formLogin.reset();
      formRegistro.reset();
    };

    // Close button
    btnCerrar.addEventListener('click', window.closeAuthModal);

    // Close when clicking outside
    window.addEventListener('click', (e) => {
      if (e.target === modalAuth) {
        window.closeAuthModal();
      }
    });

    // Login form handler
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('loginEmailModal').value.trim();
      const password = document.getElementById('loginPasswordModal').value;

      if (!email || !password) {
        showToast('Por favor completa todos los campos', 'error');
        return;
      }

      try {
        const response = await API.login(email, password);

        if (response.ok && response.data.success) {
          localStorage.setItem('razoconnect_token', response.data.token);
          localStorage.setItem('razoconnect_user', JSON.stringify(response.data.cliente));
          
          showToast('Sesión iniciada correctamente', 'success');
          
          // Dispatch event for UI updates
          window.dispatchEvent(new CustomEvent('razoconnect:auth-changed'));
          
          // Close modal and reload after a short delay to ensure token is saved
          setTimeout(() => {
            window.closeAuthModal();
            location.reload();
          }, 800);
        } else {
          showToast(response.data.message || 'Credenciales incorrectas', 'error');
        }
      } catch (error) {
        console.error('Login error:', error);
        showToast('Error al iniciar sesión. Por favor intenta nuevamente.', 'error');
      }
    });

    // Registration form handler
    formRegistro.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const nombre = document.getElementById('regNombreModal').value.trim();
      const email = document.getElementById('regEmailModal').value.trim();
      const telefono = document.getElementById('regTelefonoModal').value.trim();
      const password = document.getElementById('regPasswordModal').value;
      const passwordConfirm = document.getElementById('regPasswordConfirmModal').value;

      // Validate password match
      if (password !== passwordConfirm) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
      }

      // Validate minimum length
      if (password.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres', 'error');
        return;
      }

      if (!nombre || !email || !telefono) {
        showToast('Por favor completa todos los campos', 'error');
        return;
      }

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
            localStorage.setItem('razoconnect_token', loginResponse.data.token);
            localStorage.setItem('razoconnect_user', JSON.stringify(loginResponse.data.cliente));
            
            showToast('Bienvenido a RazoConnect', 'success');
            
            // Dispatch event for UI updates
            window.dispatchEvent(new CustomEvent('razoconnect:auth-changed'));
            
            // Close modal and reload after a short delay to ensure token is saved
            setTimeout(() => {
              window.closeAuthModal();
              location.reload();
            }, 800);
          }
        } else {
          showToast(response.data.message || 'Error al crear cuenta', 'error');
        }
      } catch (error) {
        console.error('Registration error:', error);
        showToast('Error al registrar usuario. Por favor intenta nuevamente.', 'error');
      }
    });

    console.log('✅ Auth modal initialized');
  }

  // Load modal when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAuthModal);
  } else {
    loadAuthModal();
  }
})();
