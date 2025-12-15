(function () {
  const filtroUsuarioEl = document.getElementById("filtroUsuario");
  const filtroAccionEl = document.getElementById("filtroAccion");
  const filtroEntidadEl = document.getElementById("filtroEntidad");
  const filtroFechaInicioEl = document.getElementById("filtroFechaInicio");
  const filtroFechaFinEl = document.getElementById("filtroFechaFin");
  const btnRefrescarEl = document.getElementById("btnRefrescarHistorial");

  const loadingEl = document.getElementById("historialLoading");
  const tableContainerEl = document.getElementById("historialTableContainer");
  const emptyEl = document.getElementById("historialEmpty");
  const tbodyEl = document.getElementById("tablaHistorialBody");

  let historial = [];

  function safeParseJson(value) {
    if (!value) return null;
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch (e) {
      return null;
    }
  }

  function humanizeKey(key) {
    if (!key) return "Dato";
    const str = String(key).replace(/_/g, " ");
    const withSpaces = str.replace(/([a-z])([A-Z])/g, "$1 $2");
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
  }

  function formatSimpleValue(value) {
    if (value === null || value === undefined) return "—";
    if (value === true) return "Sí";
    if (value === false) return "No";
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed : "—";
    }
    if (typeof value === "number") return String(value);
    if (Array.isArray(value) || typeof value === "object") {
      try {
        const json = JSON.stringify(value);
        if (json.length <= 140) return json;
        return json.slice(0, 140) + "…";
      } catch (e) {
        return "[Objeto]";
      }
    }
    return String(value);
  }

  function buildDetalleResumen(datosNuevos) {
    const obj = safeParseJson(datosNuevos);
    if (!obj || typeof obj !== "object") return "—";

    const keys = Object.keys(obj);
    if (!keys.length) return "—";

    const priority = [
      "NombreProducto",
      "nombreproducto",
      "Nombre",
      "nombre",
      "Email",
      "email",
      "Estatus",
      "estatus",
      "CodigoModelo",
      "codigomodelo",
    ];

    let selectedKey = null;
    for (const k of priority) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) {
        const v = obj[k];
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          selectedKey = k;
          break;
        }
      }
    }

    if (!selectedKey) {
      selectedKey = keys[0];
    }

    return `${humanizeKey(selectedKey)}: ${formatSimpleValue(obj[selectedKey])}`;
  }

  function accionToBadge(accionRaw) {
    const accion = (accionRaw || "").toString().toUpperCase();
    const cls =
      accion === "INSERT"
        ? "crear"
        : accion === "UPDATE"
          ? "editar"
          : accion === "DELETE"
            ? "eliminar"
            : "";

    const label =
      accion === "INSERT"
        ? "Crear"
        : accion === "UPDATE"
          ? "Editar"
          : accion === "DELETE"
            ? "Eliminar"
            : "N/D";

    return `<span class="action-badge ${cls}">${label}</span>`;
  }

  function humanizarEntidad(entidadRaw) {
    const entidad = (entidadRaw || "").toString().trim().toLowerCase();
    if (!entidad) return "—";

    const map = {
      categorias: "Categoría",
      productos: "Producto",
      producto_variantes: "Variante",
      proveedores: "Proveedor",
      clientes: "Cliente",
      pedidos: "Pedido",
      agentes: "Agente",
      admins: "Administrador",
      administradores: "Administrador",
      comisiones: "Comisión",
      ordenesdecompra: "Orden de Compra",
    };

    return map[entidad] || humanizeKey(entidad);
  }

  function formatFecha(value) {
    if (typeof formatDateTime === "function") {
      return formatDateTime(value);
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-MX");
  }

  function setLoadingState(isLoading) {
    if (loadingEl) loadingEl.style.display = isLoading ? "flex" : "none";
    if (tableContainerEl) tableContainerEl.style.display = "none";
    if (emptyEl) emptyEl.style.display = "none";
  }

  function renderHistorial(rows) {
    if (!tbodyEl || !tableContainerEl || !emptyEl) return;

    if (!rows.length) {
      tbodyEl.innerHTML = "";
      emptyEl.style.display = "flex";
      tableContainerEl.style.display = "none";
      return;
    }

    tbodyEl.innerHTML = rows
      .map((row) => {
        const usuarioNombre = row.solicitanteNombre || row.solicitanteEmail || "Sistema";
        const usuarioEmail = row.solicitanteEmail || "";
        const entidadTextoBase = humanizarEntidad(row.entidad);
        const entidadTexto = row.entidadId ? `${entidadTextoBase} #${row.entidadId}` : entidadTextoBase;
        const detalle = buildDetalleResumen(row.datosNuevos);

        return `
          <tr>
            <td>${formatFecha(row.fechaSolicitud)}</td>
            <td>
              <div class="fw-bold text-dark">${usuarioNombre}</div>
              <div class="text-muted small" style="font-size: 0.75rem;">${usuarioEmail}</div>
            </td>
            <td>${accionToBadge(row.tipoCambio)}</td>
            <td><strong>${entidadTexto || "—"}</strong></td>
            <td>${detalle}</td>
          </tr>
        `;
      })
      .join("");

    tableContainerEl.style.display = "block";
  }

  async function cargarUsuariosFiltro() {
    if (!filtroUsuarioEl) return;
    try {
      const response = await API.apiCall("/admin/bitacora/actividad/usuarios");
      if (!response.ok || !response.data?.success) {
        return;
      }

      const usuarios = response.data.data?.usuarios || [];

      filtroUsuarioEl.innerHTML = '<option value="">Todos los usuarios</option>';
      usuarios.forEach((u) => {
        const option = document.createElement("option");
        option.value = u.usuarioId;
        option.textContent = u.nombre || u.email || `Usuario #${u.usuarioId}`;
        filtroUsuarioEl.appendChild(option);
      });
    } catch (e) {
      console.error("Error cargando usuarios de historial:", e);
    }
  }

  async function cargarEntidadesFiltro() {
    if (!filtroEntidadEl) return;
    try {
      const response = await API.apiCall("/admin/bitacora/actividad/entidades");
      if (!response.ok || !response.data?.success) {
        return;
      }

      const entidades = response.data.data?.entidades || [];

      filtroEntidadEl.innerHTML = '<option value="">Todas las entidades</option>';
      entidades.forEach((ent) => {
        const option = document.createElement("option");
        option.value = ent;
        option.textContent = ent;
        filtroEntidadEl.appendChild(option);
      });
    } catch (e) {
      console.error("Error cargando entidades de historial:", e);
    }
  }

  function construirParametros() {
    const params = new URLSearchParams();

    const usuarioId = filtroUsuarioEl ? filtroUsuarioEl.value : "";
    const accion = filtroAccionEl ? filtroAccionEl.value : "";
    const entidad = filtroEntidadEl ? filtroEntidadEl.value : "";
    const fechaInicio = filtroFechaInicioEl ? filtroFechaInicioEl.value : "";
    const fechaFin = filtroFechaFinEl ? filtroFechaFinEl.value : "";

    if (usuarioId) params.append("usuarioId", usuarioId);
    if (accion) params.append("accion", accion);
    if (entidad) params.append("entidad", entidad);
    if (fechaInicio) params.append("fechaInicio", fechaInicio);
    if (fechaFin) params.append("fechaFin", fechaFin);

    return params.toString();
  }

  async function loadAdminProfile() {
    const userNameEl = document.getElementById("userName");
    const userRoleEl = document.getElementById("userRole");
    const userAvatarEl = document.getElementById("userAvatar");

    try {
      const response = await API.apiCall("/admin/verify");
      if (!response.ok || !response.data?.success) {
        return;
      }

      const admin = response.data.data?.admin;
      if (!admin) return;

      if (userNameEl) userNameEl.textContent = admin.nombre || "Administrador";
      if (userRoleEl) {
        userRoleEl.textContent = admin.rol === "superadmin" ? "Super Admin" : "Admin";
      }

      if (userAvatarEl) {
        const initials = String(admin.nombre || "A")
          .split(" ")
          .map((p) => p.charAt(0).toUpperCase())
          .join("")
          .slice(0, 2);
        userAvatarEl.textContent = initials || "A";
      }
    } catch (e) {
      console.error("Error al cargar perfil admin:", e);
    }
  }

  async function cargarHistorial() {
    setLoadingState(true);

    try {
      const params = construirParametros();
      const response = await API.apiCall(`/admin/bitacora/actividad${params ? `?${params}` : ""}`);

      if (!response.ok || !response.data?.success) {
        if (response.status === 403) {
          throw new Error(
            response.data?.message ||
              "Acceso denegado. Se requieren permisos de super-administrador"
          );
        }
        throw new Error(response.data?.message || "No se pudo cargar el historial");
      }

      historial = response.data.data?.historial || [];

      if (loadingEl) loadingEl.style.display = "none";
      renderHistorial(historial);
    } catch (error) {
      console.error("Error cargando historial:", error);
      if (loadingEl) loadingEl.style.display = "none";
      if (tableContainerEl) tableContainerEl.style.display = "none";
      if (emptyEl) emptyEl.style.display = "flex";
      if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: error.message || "No se pudo cargar el historial",
          confirmButtonColor: "#F97316",
        }).then(() => {
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("acceso denegado") || msg.includes("super")) {
            window.location.href = "/admin-dashboard.html";
          }
        });
      }
    }
  }

  window.aplicarFiltros = function aplicarFiltros() {
    cargarHistorial();
  };

  window.limpiarFiltros = function limpiarFiltros() {
    if (filtroUsuarioEl) filtroUsuarioEl.value = "";
    if (filtroAccionEl) filtroAccionEl.value = "";
    if (filtroEntidadEl) filtroEntidadEl.value = "";
    if (filtroFechaInicioEl) filtroFechaInicioEl.value = "";
    if (filtroFechaFinEl) filtroFechaFinEl.value = "";
    cargarHistorial();
  };

  async function init() {
    await Promise.all([loadAdminProfile(), cargarUsuariosFiltro(), cargarEntidadesFiltro()]);
    await cargarHistorial();

    if (btnRefrescarEl) {
      btnRefrescarEl.addEventListener("click", () => {
        cargarHistorial();
      });
    }
  }

  init();
})();
