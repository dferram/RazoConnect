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
   * Muestra una alerta usando SweetAlert2
   */
  function showAlert(message, type = "error") {
    const config = {
      title: type === "error" ? "Error" : "Éxito",
      html: message,
      icon: type,
      confirmButtonText: "Entendido",
      confirmButtonColor: type === "error" ? "#ef4444" : "#10b981",
    };

    Swal.fire(config);
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
      Swal.fire({
        title: "Errores de validación",
        html: "<ul style='text-align: left; padding-left: 1.5rem;'>" +
              errors.map(err => `<li>${err}</li>`).join("") +
              "</ul>",
        icon: "error",
        confirmButtonText: "Corregir",
        confirmButtonColor: "#ef4444",
      });
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
      Swal.fire({
        title: "No autenticado",
        text: "No estás autenticado. Por favor, inicia sesión.",
        icon: "error",
        confirmButtonText: "Ir a Login",
        confirmButtonColor: "#ef4444",
      }).then(() => {
        window.location.href = "/login.html";
      });
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
        Swal.fire({
          title: "Acceso denegado",
          text: "No tienes permisos para realizar esta acción. Solo los super-administradores pueden crear nuevos administradores.",
          icon: "error",
          confirmButtonText: "Entendido",
          confirmButtonColor: "#ef4444",
        });
        return;
      }

      // Manejo específico de error 400 (Email duplicado u otros errores de validación)
      if (response.status === 400) {
        const errorMessage = data.message || "Error de validación";
        
        // Detectar si es error de email duplicado o correo ya registrado
        if (errorMessage.toLowerCase().includes("correo") || 
            errorMessage.toLowerCase().includes("email")) {
          Swal.fire({
            title: "Correo no disponible",
            html: `<p>${errorMessage}</p>
                   <p style="margin-top: 1rem; color: #6b7280;">Por favor, utiliza un email diferente.</p>`,
            icon: "warning",
            confirmButtonText: "Entendido",
            confirmButtonColor: "#f97316",
          });
        } else {
          // Otros errores de validación
          const errors = data.errors ? data.errors.join("<br>") : "";
          Swal.fire({
            title: "Error de validación",
            html: `${errorMessage}${errors ? "<br><br>" + errors : ""}`,
            icon: "error",
            confirmButtonText: "Corregir",
            confirmButtonColor: "#ef4444",
          });
        }
        return;
      }

      // Manejo de otros errores HTTP
      if (!response.ok) {
        const errorMessage = data.message || "Error al crear el administrador";
        Swal.fire({
          title: "Error",
          text: errorMessage,
          icon: "error",
          confirmButtonText: "Entendido",
          confirmButtonColor: "#ef4444",
        });
        return;
      }

      // Éxito
      Swal.fire({
        title: "¡Administrador creado!",
        html: `<p>El administrador <strong>${data.data.admin.email}</strong> ha sido creado exitosamente.</p>
               <p style="margin-top: 1rem; color: #6b7280;">Rol asignado: <strong>${data.data.admin.rol}</strong></p>`,
        icon: "success",
        confirmButtonText: "Continuar",
        confirmButtonColor: "#10b981",
      }).then(() => {
        // Limpiar formulario
        adminForm.reset();
        // Redirigir al dashboard
        window.location.href = "/admin-dashboard.html";
      });
    } catch (error) {
      console.error("Error al crear administrador:", error);
      Swal.fire({
        title: "Error de conexión",
        text: "No se pudo conectar con el servidor. Por favor, verifica tu conexión a internet e intenta nuevamente.",
        icon: "error",
        confirmButtonText: "Entendido",
        confirmButtonColor: "#ef4444",
      });
    }
  }

  /**
   * Maneja el envío del formulario
   */
  async function handleSubmit(event) {
    event.preventDefault();

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
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
