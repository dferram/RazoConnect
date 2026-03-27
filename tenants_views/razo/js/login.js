/**
 * LOGIN PAGE - LÓGICA DE AUTENTICACIÓN
 * 
 * Migrado desde script inline para compatibilidad con CSP sin 'unsafe-inline'
 * 
 * FUNCIONALIDADES:
 * - Autenticación con email/teléfono + contraseña
 * - Autenticación con Google (popup)
 * - Toggle de visibilidad de contraseña
 * - Validación de formulario en tiempo real
 * - Redirección basada en rol (admin/agente/cliente)
 */

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

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

function showAlert(message, type = "error") {
  const alertDiv = document.getElementById("alert");
  alertDiv.className = `alert alert-${type}`;
  alertDiv.textContent = message;
  alertDiv.style.display = "block";

  setTimeout(() => {
    alertDiv.style.display = "none";
  }, 5000);
}

function validateIdentifier(identifier) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{10}$/;
  return emailRegex.test(identifier) || phoneRegex.test(identifier);
}

// ============================================================================
// GOOGLE AUTHENTICATION
// ============================================================================

const GOOGLE_POPUP_MESSAGE_TYPE = "GOOGLE_SUCCESS";

function iniciarGooglePopup(event) {
  if (event && event.preventDefault) {
    event.preventDefault();
  }

  const width = 500;
  const height = 600;

  const dualScreenLeft =
    window.screenLeft !== undefined ? window.screenLeft : window.screenX;
  const dualScreenTop =
    window.screenTop !== undefined ? window.screenTop : window.screenY;

  const screenWidth =
    window.innerWidth ||
    document.documentElement.clientWidth ||
    window.screen.width;
  const screenHeight =
    window.innerHeight ||
    document.documentElement.clientHeight ||
    window.screen.height;

  const left = dualScreenLeft + (screenWidth - width) / 2;
  const top = dualScreenTop + (screenHeight - height) / 2;

  const features = `scrollbars=yes,resizable=yes,width=${width},height=${height},top=${top},left=${left}`;

  const popup = window.open(
    "/api/auth/google",
    "google_login_popup",
    features
  );

  if (!popup) {
    showAlert(
      "No se pudo abrir la ventana de Google. Verifica el bloqueador de ventanas emergentes.",
      "error"
    );
    return;
  }

  popup.focus();
}

// Listener para mensajes del popup de Google
window.addEventListener(
  "message",
  (event) => {
    try {
      if (!event.data || event.data.type !== GOOGLE_POPUP_MESSAGE_TYPE) {
        return;
      }

      const expectedOrigin = window.location.origin;
      if (event.origin && event.origin !== expectedOrigin) {
        return;
      }

      const { token, user } = event.data;

      if (token) {
        localStorage.setItem("razoconnect_token", token);
        
        if (event.data.accessToken && event.data.refreshToken) {
          AuthManager.saveTokens(
            event.data.accessToken,
            event.data.refreshToken,
            user,
            'cliente'
          );
        }
      }

      if (user) {
        localStorage.setItem("razoconnect_user", JSON.stringify(user));
      }

      if (typeof showToast === "function") {
        showToast("Inicio de sesión con Google exitoso", "success");
      }

      setTimeout(() => {
        sessionStorage.setItem("_navigating", "true");
        window.location.href = "/inicio.html";
      }, 500);
    } catch (err) {
      console.error("Error al procesar mensaje de Google:", err);
    }
  },
  false
);

// ============================================================================
// URL PARAMS HANDLER (Google OAuth callback)
// ============================================================================

function handleGoogleCallback() {
  const params = new URLSearchParams(window.location.search);
  const googleToken = params.get("googleToken");

  if (googleToken) {
    const nombre = params.get("nombre") || "";
    const apellido = params.get("apellido") || "";
    const emailFromQuery = params.get("email") || "";
    const avatarUrl = params.get("avatarUrl") || null;

    const usuario = {
      nombre,
      apellido,
      email: emailFromQuery,
      rol: "cliente",
      avatarUrl,
    };

    localStorage.setItem("razoconnect_token", googleToken);
    localStorage.setItem("razoconnect_user", JSON.stringify(usuario));

    showToast("Inicio de sesión con Google exitoso", "success");

    setTimeout(() => {
      sessionStorage.setItem("_navigating", "true");
      window.location.href = "/inicio.html";
    }, 500);
  }
}

// ============================================================================
// AUTH STATE CHECKS
// ============================================================================

function checkExistingAuth() {
  // Check if user is already logged in
  if (typeof AuthManager !== 'undefined' && AuthManager.isAuthenticated()) {
    window.location.href = "/inicio.html";
    return;
  }

  // Check if admin is already logged in
  const adminToken = localStorage.getItem("razoconnect_admin_token");
  if (adminToken) {
    fetch("/api/admin/verify", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          sessionStorage.setItem("_navigating", "true");
          window.location.href = "/admin-dashboard.html";
        } else {
          localStorage.removeItem("razoconnect_admin_token");
          localStorage.removeItem("razoconnect_admin");
        }
      })
      .catch(() => {
        localStorage.removeItem("razoconnect_admin_token");
        localStorage.removeItem("razoconnect_admin");
      });
  }
}

// ============================================================================
// FORM SUBMISSION HANDLER
// ============================================================================

async function handleLoginSubmit(e) {
  e.preventDefault();

  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");

  // Clear previous errors
  document
    .querySelectorAll(".form-error")
    .forEach((el) => el.classList.remove("show"));
  document
    .querySelectorAll(".form-input")
    .forEach((el) => el.classList.remove("error"));

  const identifier = emailInput.value.trim();
  const password = passwordInput.value.trim();

  // Validation
  let hasError = false;

  if (!identifier) {
    document.getElementById("emailError").textContent =
      "El correo o teléfono es requerido";
    document.getElementById("emailError").classList.add("show");
    emailInput.classList.add("error");
    hasError = true;
  } else if (!validateIdentifier(identifier)) {
    document.getElementById("emailError").textContent =
      "Formato inválido. Ingresa un correo válido o 10 dígitos";
    document.getElementById("emailError").classList.add("show");
    emailInput.classList.add("error");
    hasError = true;
  }

  if (!password) {
    document.getElementById("passwordError").textContent =
      "La contraseña es requerida";
    document.getElementById("passwordError").classList.add("show");
    passwordInput.classList.add("error");
    hasError = true;
  }

  if (hasError) return;

  // Show loading state
  submitBtn.disabled = true;
  btnText.style.display = "none";
  btnSpinner.style.display = "block";

  try {
    let loginSuccessful = false;

    // Intentar primero como administrador
    try {
      const adminResponse = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, password: password }),
      });

      const adminData = await adminResponse.json();

      if (adminResponse.ok && adminData.success) {
        const { accessToken, refreshToken, usuario } = adminData.data;
        
        if (accessToken && refreshToken && usuario) {
          AuthManager.saveTokens(accessToken, refreshToken, usuario, 'admin');
        } else {
          console.error('Respuesta de login incompleta:', adminData.data);
          throw new Error('Respuesta de login incompleta');
        }

        const adminInfo = usuario || {};
        const adminRol = adminInfo.rol;
        const origen = adminInfo.origen;
        const esAgente =
          adminRol === "agente" ||
          origen === "agent" ||
          adminInfo.esAgente === true ||
          adminInfo.codigoAgente;

        console.log("🔍 Admin login info:", {
          adminRol,
          origen,
          esAgente,
          adminInfo,
        });

        if (esAgente) {
          showToast("¡Bienvenido Agente!", "success");
          setTimeout(() => {
            sessionStorage.setItem("_navigating", "true");
            window.location.href = "/agente-dashboard.html";
          }, 500);
        } else {
          showToast("¡Bienvenido Administrador!", "success");
          setTimeout(() => {
            sessionStorage.setItem("_navigating", "true");
            window.location.href = "/admin-dashboard.html";
          }, 500);
        }
        loginSuccessful = true;
      }
    } catch (adminError) {
      console.error("Admin login error:", adminError);
    }

    // Si no es admin, intenta como cliente/agente
    if (!loginSuccessful) {
      try {
        const clientResponse = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: identifier, password: password }),
        });

        const clientData = await clientResponse.json();

        if (clientResponse.ok && clientData.success) {
          const rol =
            clientData.data.rol || clientData.data.usuario?.rol || null;
          const usuario = {
            ...clientData.data.usuario,
            rol,
          };

          if (rol === "agente") {
            const { accessToken, refreshToken, token } = clientData.data;
            const agenteData = {
              ...usuario,
              rol: "agente",
              esAgente: true,
            };
            
            if (accessToken && refreshToken) {
              AuthManager.saveTokens(accessToken, refreshToken, agenteData, 'agente');
            } else {
              localStorage.setItem("razoconnect_agent_token", token);
              localStorage.setItem("razoconnect_agent", JSON.stringify(agenteData));
            }

            showToast("¡Bienvenido Agente!", "success");
            setTimeout(() => {
              window.location.href = "/agente-dashboard.html";
            }, 500);
          } else {
            const { accessToken, refreshToken, token } = clientData.data;
            
            if (accessToken && refreshToken) {
              AuthManager.saveTokens(accessToken, refreshToken, usuario, 'cliente');
            } else {
              localStorage.setItem("razoconnect_token", token);
              localStorage.setItem("razoconnect_user", JSON.stringify(usuario));
            }

            showToast("¡Bienvenido!", "success");
            setTimeout(() => {
              sessionStorage.setItem("_navigating", "true");
              window.location.href = "/inicio.html";
            }, 500);
          }
          loginSuccessful = true;
        }
      } catch (clientError) {
        console.log("No es cliente/agente:", clientError);
      }
    }

    if (!loginSuccessful) {
      showAlert(
        "Credenciales inválidas. Verifica tu correo/teléfono y contraseña.",
        "error"
      );
    }
  } catch (error) {
    console.error("Login error:", error);
    showAlert(
      "Error al conectar con el servidor. Intenta nuevamente.",
      "error"
    );
  } finally {
    submitBtn.disabled = false;
    btnText.style.display = "inline";
    btnSpinner.style.display = "none";
  }
}

// ============================================================================
// PASSWORD VISIBILITY TOGGLE
// ============================================================================

function setupPasswordToggle() {
  const togglePasswordBtn = document.getElementById("togglePassword");
  const passwordInput = document.getElementById("password");

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener("click", function() {
      const type = passwordInput.getAttribute("type") === "password" ? "text" : "password";
      passwordInput.setAttribute("type", type);
      
      if (type === "password") {
        this.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
      } else {
        this.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
      }
    });
  }
}

// ============================================================================
// REAL-TIME VALIDATION
// ============================================================================

function setupRealtimeValidation() {
  const emailInput = document.getElementById("email");

  if (emailInput) {
    emailInput.addEventListener("blur", () => {
      const identifier = emailInput.value.trim();
      if (identifier && !validateIdentifier(identifier)) {
        document.getElementById("emailError").textContent =
          "Formato inválido. Ingresa un correo válido o 10 dígitos";
        document.getElementById("emailError").classList.add("show");
        emailInput.classList.add("error");
      } else {
        document.getElementById("emailError").classList.remove("show");
        emailInput.classList.remove("error");
      }
    });
  }
}

// ============================================================================
// GOOGLE BUTTON EVENT LISTENER
// ============================================================================

function setupGoogleButton() {
  const googleLoginBtn = document.getElementById("googleLoginBtn");
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener("click", iniciarGooglePopup);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
  // Setup form submission
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }

  // Setup password toggle
  setupPasswordToggle();

  // Setup real-time validation
  setupRealtimeValidation();

  // Setup Google button
  setupGoogleButton();

  // Handle Google OAuth callback
  handleGoogleCallback();

  // Check existing authentication
  checkExistingAuth();
});
