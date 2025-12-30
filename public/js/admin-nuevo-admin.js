/**
 * Admin Nuevo Administrador
 * Gestión de creación de nuevos usuarios administradores
 * Solo accesible por super-administradores
 */

(function () {
  "use strict";

  const API_BASE_URL = window.API_BASE_URL || `${window.location.origin}/api`;
  const ADMIN_TOKEN_KEY = "razoconnect_admin_token";

  // DOM Elements
  const adminForm = document.getElementById("adminForm");
  const nombreInput = document.getElementById("nombre");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const rolSelect = document.getElementById("rol");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = document.getElementById("btnText");
  const btnSpinner = document.getElementById("btnSpinner");
  const alertContainer = document.getElementById("alertContainer");

  /**
   * Muestra una alerta en la página
   */
  function showAlert(message, type = "error") {
    const alertClass = type === "error" ? "alert-error" : "alert-success";
    const icon = type === "error" ? "❌" : "✅";

    alertContainer.innerHTML = `
      <div class="alert ${alertClass}" style="padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
        ${icon} ${message}
      </div>
    `;

    // Auto-hide success messages after 5 seconds
    if (type === "success") {
      setTimeout(() => {
        alertContainer.innerHTML = "";
      }, 5000);
    }

    // Scroll to top to show alert
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Obtiene el token de administrador
   */
  function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  }

  /**
   * Valida el formulario antes de enviar
   */
  function validateForm() {
    const errors = [];

    if (!nombreInput.value.trim()) {
      errors.push("El nombre es requerido");
    }

    if (!emailInput.value.trim()) {
      errors.push("El email es requerido");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) {
      errors.push("El email no es válido");
    }

    if (!passwordInput.value) {
      errors.push("La contraseña es requerida");
    } else if (passwordInput.value.length < 6) {
      errors.push("La contraseña debe tener al menos 6 caracteres");
    }

    if (!rolSelect.value) {
      errors.push("Debes seleccionar un rol");
    }

    if (errors.length > 0) {
      showAlert(errors.join("<br>"), "error");
      return false;
    }

    return true;
  }

  /**
   * Deshabilita el botón durante el envío
   */
  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    if (isLoading) {
      btnText.style.display = "none";
      btnSpinner.style.display = "inline-block";
    } else {
      btnText.style.display = "inline";
      btnSpinner.style.display = "none";
    }
  }

  /**
   * Crea un nuevo administrador
   */
  async function crearAdministrador(formData) {
    const token = getAdminToken();

    if (!token) {
      showAlert("No estás autenticado. Por favor, inicia sesión.", "error");
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 2000);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/admin/crear-admin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      // Manejo específico de error 403 (Forbidden)
      if (response.status === 403) {
        showAlert(
          "❌ No tienes permisos para realizar esta acción. Solo los super-administradores pueden crear nuevos administradores.",
          "error"
        );
        return;
      }

      // Manejo de otros errores
      if (!response.ok) {
        const errorMessage = data.message || "Error al crear el administrador";
        const errors = data.errors ? data.errors.join("<br>") : "";
        showAlert(`${errorMessage}${errors ? "<br>" + errors : ""}`, "error");
        return;
      }

      // Éxito
      showAlert(
        `✅ Administrador creado exitosamente: ${data.data.admin.email}`,
        "success"
      );

      // Limpiar formulario
      adminForm.reset();

      // Opcional: Redirigir después de unos segundos
      setTimeout(() => {
        window.location.href = "/admin-dashboard.html";
      }, 2000);
    } catch (error) {
      console.error("Error al crear administrador:", error);
      showAlert(
        "Error de conexión. Por favor, verifica tu conexión a internet.",
        "error"
      );
    }
  }

  /**
   * Maneja el envío del formulario
   */
  async function handleSubmit(event) {
    event.preventDefault();

    // Limpiar alertas previas
    alertContainer.innerHTML = "";

    // Validar formulario
    if (!validateForm()) {
      return;
    }

    // Preparar datos
    const formData = {
      nombre: nombreInput.value.trim(),
      email: emailInput.value.trim().toLowerCase(),
      password: passwordInput.value,
      rol: rolSelect.value,
    };

    // Mostrar loading
    setLoading(true);

    // Enviar petición
    await crearAdministrador(formData);

    // Quitar loading
    setLoading(false);
  }

  /**
   * Inicialización
   */
  function init() {
    if (!adminForm) {
      console.error("Formulario no encontrado");
      return;
    }

    // Event listeners
    adminForm.addEventListener("submit", handleSubmit);

    // Validación en tiempo real (opcional)
    emailInput.addEventListener("blur", () => {
      if (
        emailInput.value &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)
      ) {
        emailInput.style.borderColor = "#ef4444";
      } else {
        emailInput.style.borderColor = "";
      }
    });

    passwordInput.addEventListener("input", () => {
      if (passwordInput.value.length > 0 && passwordInput.value.length < 6) {
        passwordInput.style.borderColor = "#ef4444";
      } else {
        passwordInput.style.borderColor = "";
      }
    });

    console.log("✅ Admin Nuevo Admin inicializado");
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
