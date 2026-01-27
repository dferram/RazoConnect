const API_BASE = "/api";
let cuponesData = [];
let modalCupon;
let editandoCuponId = null;

document.addEventListener("DOMContentLoaded", () => {
  // Verificar autenticación de admin
  if (!requireAdminAuth()) {
    return;
  }

  // Esperar a que Bootstrap esté disponible
  const initModal = () => {
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      const modalEl = document.getElementById("modalCupon");
      if (modalEl) {
        modalCupon = new bootstrap.Modal(modalEl);
      }
    }
  };

  // Intentar inicializar el modal
  if (typeof bootstrap !== 'undefined') {
    initModal();
  } else {
    // Si Bootstrap no está listo, esperar un poco
    setTimeout(initModal, 100);
  }

  const btnNuevoCupon = document.getElementById("btn-nuevo-cupon");
  const formCupon = document.getElementById("form-cupon");
  const cuponTipo = document.getElementById("cupon-tipo");

  if (btnNuevoCupon) btnNuevoCupon.addEventListener("click", abrirModalNuevo);
  if (formCupon) formCupon.addEventListener("submit", guardarCupon);
  if (cuponTipo) cuponTipo.addEventListener("change", actualizarHintValor);

  cargarCupones();
});

function actualizarHintValor() {
  const tipo = document.getElementById("cupon-tipo").value;
  const hint = document.getElementById("valor-hint");
  const valorInput = document.getElementById("cupon-valor");

  if (tipo === "PORCENTAJE") {
    hint.textContent = "Ingresa el porcentaje (0-100)";
    valorInput.max = "100";
  } else {
    hint.textContent = "Ingresa el monto fijo en pesos";
    valorInput.removeAttribute("max");
  }
}

async function cargarCupones() {
  const loadingEl = document.getElementById("loadingCupones");
  const tabla = document.getElementById("tabla-cupones");
  
  try {
    if (loadingEl) loadingEl.style.display = "flex";
    if (tabla) tabla.style.display = "none";
    
    const token = localStorage.getItem("razoconnect_admin_token");
    const response = await fetch(`${API_BASE}/admin/cupones`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error("Error al cargar cupones");
    }

    const data = await response.json();
    cuponesData = data.data || [];
    renderizarTablaCupones();
  } catch (error) {
    console.error("Error:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudieron cargar los cupones",
    });
  } finally {
    if (loadingEl) loadingEl.style.display = "none";
  }
}

function renderizarTablaCupones() {
  const tbody = document.getElementById("cupones-tbody");
  const tabla = document.getElementById("tabla-cupones");
  const emptyState = document.getElementById("emptyCupones");

  if (cuponesData.length === 0) {
    if (tabla) tabla.style.display = "none";
    if (emptyState) emptyState.style.display = "block";
    return;
  }

  if (tabla) tabla.style.display = "table";
  if (emptyState) emptyState.style.display = "none";

  tbody.innerHTML = cuponesData
    .map((cupon) => {
      const tipo = cupon.tipo_descuento === "PORCENTAJE" ? "%" : "$";
      const valor =
        cupon.tipo_descuento === "PORCENTAJE"
          ? `${parseFloat(cupon.valor)}%`
          : `$${parseFloat(cupon.valor).toFixed(2)}`;

      const usosTexto = cupon.uso_maximo
        ? `${cupon.usos_actuales || 0} / ${cupon.uso_maximo}`
        : `${cupon.usos_actuales || 0} / ∞`;

      const fechaInicio = cupon.fecha_inicio
        ? new Date(cupon.fecha_inicio).toLocaleDateString("es-MX")
        : "Sin inicio";
      const fechaFin = cupon.fecha_fin
        ? new Date(cupon.fecha_fin).toLocaleDateString("es-MX")
        : "Sin fin";
      const vigencia = `${fechaInicio} - ${fechaFin}`;

      const estadoBadge = cupon.activo
        ? '<span class="badge bg-success">Activo</span>'
        : '<span class="badge bg-secondary">Inactivo</span>';

      const ahora = new Date();
      const vencido =
        cupon.fecha_fin && new Date(cupon.fecha_fin) < ahora
          ? '<span class="badge bg-danger ms-1">Expirado</span>'
          : "";

      const agotado =
        cupon.uso_maximo &&
        cupon.usos_actuales >= cupon.uso_maximo &&
        cupon.activo
          ? '<span class="badge bg-warning text-dark ms-1">Agotado</span>'
          : "";

      return `
        <tr>
          <td><strong>${cupon.codigo}</strong></td>
          <td>${cupon.descripcion || "-"}</td>
          <td>${cupon.tipo_descuento}</td>
          <td>${valor}</td>
          <td>${usosTexto}</td>
          <td>${vigencia}</td>
          <td>${estadoBadge}${vencido}${agotado}</td>
          <td>
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary" onclick="editarCupon(${
                cupon.cuponid
              })" title="Editar">
                <i class="bi bi-pencil"></i>
              </button>
              ${
                cupon.activo
                  ? `<button class="btn btn-outline-danger" onclick="desactivarCupon(${cupon.cuponid})" title="Desactivar">
                      <i class="bi bi-x-circle"></i>
                    </button>`
                  : `<button class="btn btn-outline-success" onclick="activarCupon(${cupon.cuponid})" title="Activar">
                      <i class="bi bi-check-circle"></i>
                    </button>`
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function abrirModalNuevo() {
  editandoCuponId = null;
  const labelEl = document.getElementById("modalCuponLabel");
  const formEl = document.getElementById("form-cupon");
  const idEl = document.getElementById("cupon-id");
  
  if (labelEl) labelEl.textContent = "Nuevo Cupón";
  if (formEl) formEl.reset();
  if (idEl) idEl.value = "";
  
  actualizarHintValor();
  
  if (modalCupon) {
    modalCupon.show();
  } else {
    // Fallback: intentar inicializar el modal si no existe
    const modalEl = document.getElementById("modalCupon");
    if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      modalCupon = new bootstrap.Modal(modalEl);
      modalCupon.show();
    }
  }
}

async function editarCupon(cuponId) {
  try {
    const token = localStorage.getItem("razoconnect_admin_token");
    const response = await fetch(
      `${API_BASE}/admin/cupones/${cuponId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Error al cargar cupón");
    }

    const data = await response.json();
    const cupon = data.data;

    editandoCuponId = cuponId;
    document.getElementById("modalCuponLabel").textContent = "Editar Cupón";
    document.getElementById("cupon-id").value = cupon.cuponid;
    document.getElementById("cupon-codigo").value = cupon.codigo;
    document.getElementById("cupon-descripcion").value =
      cupon.descripcion || "";
    document.getElementById("cupon-tipo").value = cupon.tipo_descuento;
    document.getElementById("cupon-valor").value = parseFloat(cupon.valor);
    document.getElementById("cupon-monto-minimo").value = parseFloat(
      cupon.monto_minimo_compra || 0
    );

    if (cupon.fecha_inicio) {
      const fechaInicio = new Date(cupon.fecha_inicio);
      document.getElementById("cupon-fecha-inicio").value = fechaInicio
        .toISOString()
        .slice(0, 16);
    } else {
      document.getElementById("cupon-fecha-inicio").value = "";
    }

    if (cupon.fecha_fin) {
      const fechaFin = new Date(cupon.fecha_fin);
      document.getElementById("cupon-fecha-fin").value = fechaFin
        .toISOString()
        .slice(0, 16);
    } else {
      document.getElementById("cupon-fecha-fin").value = "";
    }

    document.getElementById("cupon-uso-maximo").value = cupon.uso_maximo || "";

    actualizarHintValor();
    modalCupon.show();
  } catch (error) {
    console.error("Error:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar el cupón",
    });
  }
}

async function guardarCupon(e) {
  e.preventDefault();

  const codigo = document.getElementById("cupon-codigo").value.trim();
  const descripcion = document
    .getElementById("cupon-descripcion")
    .value.trim();
  const tipoDescuento = document.getElementById("cupon-tipo").value;
  const valor = parseFloat(document.getElementById("cupon-valor").value);
  const montoMinimoCompra = parseFloat(
    document.getElementById("cupon-monto-minimo").value || 0
  );
  const fechaInicio =
    document.getElementById("cupon-fecha-inicio").value || null;
  const fechaFin = document.getElementById("cupon-fecha-fin").value || null;
  const usoMaximo = document.getElementById("cupon-uso-maximo").value
    ? parseInt(document.getElementById("cupon-uso-maximo").value, 10)
    : null;

  if (!codigo) {
    Swal.fire({
      icon: "warning",
      title: "Campo requerido",
      text: "El código del cupón es obligatorio",
    });
    return;
  }

  if (!valor || valor <= 0) {
    Swal.fire({
      icon: "warning",
      title: "Valor inválido",
      text: "El valor del descuento debe ser mayor a 0",
    });
    return;
  }

  if (tipoDescuento === "PORCENTAJE" && valor > 100) {
    Swal.fire({
      icon: "warning",
      title: "Porcentaje inválido",
      text: "El porcentaje no puede ser mayor a 100",
    });
    return;
  }

  const payload = {
    codigo,
    descripcion: descripcion || null,
    tipoDescuento,
    valor,
    montoMinimoCompra,
    fechaInicio,
    fechaFin,
    usoMaximo,
  };

  try {
    const token = localStorage.getItem("razoconnect_admin_token");
    const url = editandoCuponId
      ? `${API_BASE}/admin/cupones/${editandoCuponId}`
      : `${API_BASE}/admin/cupones`;
    const method = editandoCuponId ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Error al guardar cupón");
    }

    Swal.fire({
      icon: "success",
      title: "Éxito",
      text: editandoCuponId
        ? "Cupón actualizado correctamente"
        : "Cupón creado correctamente",
      timer: 2000,
      showConfirmButton: false,
    });

    modalCupon.hide();
    cargarCupones();
  } catch (error) {
    console.error("Error:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: error.message || "No se pudo guardar el cupón",
    });
  }
}

async function desactivarCupon(cuponId) {
  const result = await Swal.fire({
    title: "¿Desactivar cupón?",
    text: "El cupón ya no podrá ser utilizado por los clientes",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#6c757d",
    confirmButtonText: "Sí, desactivar",
    cancelButtonText: "Cancelar",
  });

  if (!result.isConfirmed) return;

  try {
    const token = localStorage.getItem("razoconnect_admin_token");
    const response = await fetch(
      `${API_BASE}/admin/cupones/${cuponId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Error al desactivar cupón");
    }

    Swal.fire({
      icon: "success",
      title: "Cupón desactivado",
      text: "El cupón ha sido desactivado correctamente",
      timer: 2000,
      showConfirmButton: false,
    });

    cargarCupones();
  } catch (error) {
    console.error("Error:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo desactivar el cupón",
    });
  }
}

async function activarCupon(cuponId) {
  try {
    const token = localStorage.getItem("razoconnect_admin_token");
    const response = await fetch(
      `${API_BASE}/admin/cupones/${cuponId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ activo: true }),
      }
    );

    if (!response.ok) {
      throw new Error("Error al activar cupón");
    }

    Swal.fire({
      icon: "success",
      title: "Cupón activado",
      text: "El cupón ha sido activado correctamente",
      timer: 2000,
      showConfirmButton: false,
    });

    cargarCupones();
  } catch (error) {
    console.error("Error:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo activar el cupón",
    });
  }
}
