let cuentasData = [];
let modalInstance = null;

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("formCuentaMaestra");
  const btnAgregarCuenta = document.getElementById("btnAgregarCuenta");
  const btnGuardarCuenta = document.getElementById("btnGuardarCuenta");
  const listaCuentas = document.getElementById("listaCuentas");
  const estadoVacio = document.getElementById("estadoVacio");
  const contadorCuentas = document.getElementById("contadorCuentas");

  const inputBanco = document.getElementById("inputBanco");
  const inputTitular = document.getElementById("inputTitular");
  const inputCuenta = document.getElementById("inputCuenta");
  const inputClabe = document.getElementById("inputClabe");
  const checkPrincipal = document.getElementById("checkPrincipal");

  const previewBanco = document.getElementById("previewBanco");
  const previewTitular = document.getElementById("previewTitular");
  const previewCuenta = document.getElementById("previewCuenta");
  const previewClabe = document.getElementById("previewClabe");

  // Inicializar modal de Bootstrap
  const modalElement = document.getElementById("modalCuenta");
  modalInstance = new bootstrap.Modal(modalElement);

  function actualizarPreview(cuenta) {
    if (cuenta) {
      previewBanco.textContent = cuenta.banco || "—";
      previewTitular.textContent = cuenta.titular || "—";
      previewCuenta.textContent = cuenta.numero_cuenta || "—";
      previewClabe.textContent = cuenta.clabe || "—";
    } else {
      previewBanco.textContent = "—";
      previewTitular.textContent = "—";
      previewCuenta.textContent = "—";
      previewClabe.textContent = "—";
    }
  }

  async function cargarCuentas() {
    try {
      const response = await API.apiCall("/admin/cuenta-maestra", {
        method: "GET",
      });
      
      if (response && response.ok && response.data) {
        cuentasData = response.data.cuentas || [];
        renderizarCuentas();
        
        const cuentaActiva = cuentasData.find(c => c.es_principal);
        actualizarPreview(cuentaActiva);
      }
    } catch (error) {
      console.error("Error al cargar cuentas:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudieron cargar las cuentas bancarias",
      });
    }
  }

  function renderizarCuentas() {
    if (cuentasData.length === 0) {
      listaCuentas.style.display = "none";
      estadoVacio.style.display = "block";
      contadorCuentas.textContent = "0 cuentas";
      return;
    }

    listaCuentas.style.display = "grid";
    estadoVacio.style.display = "none";
    contadorCuentas.textContent = `${cuentasData.length} cuenta${cuentasData.length !== 1 ? 's' : ''}`;

    listaCuentas.innerHTML = cuentasData.map(cuenta => crearTarjetaCuenta(cuenta)).join("");

    // Agregar event listeners
    cuentasData.forEach(cuenta => {
      const btnActivar = document.getElementById(`btn-activar-${cuenta.id}`);
      const btnEliminar = document.getElementById(`btn-eliminar-${cuenta.id}`);

      if (btnActivar && !cuenta.es_principal) {
        btnActivar.addEventListener("click", () => activarCuenta(cuenta.id));
      }

      if (btnEliminar) {
        btnEliminar.addEventListener("click", () => eliminarCuenta(cuenta.id));
      }
    });
  }

  function crearTarjetaCuenta(cuenta) {
    const ultimosCuatro = cuenta.numero_cuenta.slice(-4);
    const esActiva = cuenta.es_principal;

    return `
      <div class="cuenta-card ${esActiva ? 'activa' : ''}">
        ${esActiva ? '<div class="cuenta-badge">Activa</div>' : ''}
        <div class="cuenta-info">
          <div class="cuenta-info-item">
            <span class="cuenta-info-label">Banco</span>
            <span class="cuenta-info-value">${cuenta.banco}</span>
          </div>
          <div class="cuenta-info-item">
            <span class="cuenta-info-label">Titular</span>
            <span class="cuenta-info-value">${cuenta.titular}</span>
          </div>
          <div class="cuenta-info-item">
            <span class="cuenta-info-label">Cuenta</span>
            <span class="cuenta-info-value">****${ultimosCuatro}</span>
          </div>
        </div>
        <div class="cuenta-actions">
          <button 
            id="btn-activar-${cuenta.id}" 
            class="btn-activar ${esActiva ? 'activo' : ''}" 
            ${esActiva ? 'disabled' : ''}>
            ${esActiva ? '<i class="bi bi-check-circle-fill"></i> Cuenta activa' : '<i class="bi bi-circle"></i> Usar esta cuenta'}
          </button>
          <button id="btn-eliminar-${cuenta.id}" class="btn-eliminar">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
  }

  async function activarCuenta(id) {
    try {
      const result = await Swal.fire({
        title: "¿Activar esta cuenta?",
        text: "Esta cuenta será visible para los clientes en el checkout",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Sí, activar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#22c55e",
      });

      if (!result.isConfirmed) return;

      const response = await API.apiCall(`/admin/cuenta-maestra/${id}/activar`, {
        method: "PUT",
      });

      if (response && response.ok) {
        Swal.fire({
          icon: "success",
          title: "¡Cuenta activada!",
          text: "Esta cuenta ahora es visible para los clientes",
          timer: 2000,
          showConfirmButton: false,
        });

        await cargarCuentas();
      } else {
        throw new Error(response?.data?.error || "Error al activar cuenta");
      }
    } catch (error) {
      console.error("Error al activar cuenta:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo activar la cuenta",
      });
    }
  }

  async function eliminarCuenta(id) {
    try {
      const result = await Swal.fire({
        title: "¿Eliminar esta cuenta?",
        text: "Esta acción no se puede deshacer",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Sí, eliminar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#dc2626",
      });

      if (!result.isConfirmed) return;

      const response = await API.apiCall(`/admin/cuenta-maestra/${id}`, {
        method: "DELETE",
      });

      if (response && response.ok) {
        Swal.fire({
          icon: "success",
          title: "¡Cuenta eliminada!",
          timer: 2000,
          showConfirmButton: false,
        });

        await cargarCuentas();
      } else {
        throw new Error(response?.data?.error || "Error al eliminar cuenta");
      }
    } catch (error) {
      console.error("Error al eliminar cuenta:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo eliminar la cuenta",
      });
    }
  }

  async function guardarNuevaCuenta() {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const clabe = inputClabe.value.trim();
    if (clabe.length !== 18) {
      Swal.fire({
        icon: "warning",
        title: "CLABE inválida",
        text: "La CLABE debe tener exactamente 18 dígitos",
      });
      return;
    }

    const spinner = btnGuardarCuenta.querySelector(".spinner-border");
    const labelText = btnGuardarCuenta.querySelector(".label-text");

    try {
      btnGuardarCuenta.disabled = true;
      spinner.style.display = "inline-block";
      labelText.textContent = "Guardando...";

      const datos = {
        banco: inputBanco.value.trim(),
        titular: inputTitular.value.trim(),
        numero_cuenta: inputCuenta.value.trim(),
        clabe: clabe,
        es_principal: checkPrincipal.checked,
      };

      const response = await API.apiCall("/admin/cuenta-maestra", {
        method: "POST",
        body: JSON.stringify(datos),
      });

      if (response && response.ok) {
        Swal.fire({
          icon: "success",
          title: "¡Cuenta agregada!",
          text: "La cuenta bancaria se agregó correctamente",
          timer: 2000,
          showConfirmButton: false,
        });

        modalInstance.hide();
        form.reset();
        await cargarCuentas();
      } else {
        throw new Error(response?.data?.error || "Error al guardar");
      }
    } catch (error) {
      console.error("Error al guardar cuenta:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo guardar la cuenta",
      });
    } finally {
      btnGuardarCuenta.disabled = false;
      spinner.style.display = "none";
      labelText.textContent = "Guardar cuenta";
    }
  }

  // Event listeners
  btnAgregarCuenta.addEventListener("click", () => {
    form.reset();
    modalInstance.show();
  });

  btnGuardarCuenta.addEventListener("click", guardarNuevaCuenta);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    guardarNuevaCuenta();
  });

  // Cargar cuentas al iniciar
  await cargarCuentas();
});
