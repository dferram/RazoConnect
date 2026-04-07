/**
 * Admin Gestionar Estados
 * Gestión de asignación de estados a administradores
 */

(function () {
  "use strict";

  const API_BASE_URL = window.API_BASE_URL || `${window.location.origin}/api`;
  const ADMIN_TOKEN_KEY = "razoconnect_admin_token";

  // Estado de la aplicación
  let currentAdmins = [];
  let currentEstados = [];
  let currentClientes = [];
  let selectedAdminId = null;

  // DOM Elements
  const tabAdmins = document.getElementById("tabAdmins");
  const tabEstados = document.getElementById("tabEstados");
  const tabClientes = document.getElementById("tabClientes");
  const adminTab = document.getElementById("adminTab");
  const estadosTab = document.getElementById("estadosTab");
  const clientesTab = document.getElementById("clientesTab");
  const editModal = document.getElementById("editModal");
  const adminTableBody = document.getElementById("adminTableBody");
  const estadosTableBody = document.getElementById("estadosTableBody");
  const clientesTableBody = document.getElementById("clientesTableBody");

  // Obtener token
  function getAdminToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  }

  // Cambiar tabs
  function switchTab(tabName) {
    adminTab.style.display = "none";
    estadosTab.style.display = "none";
    clientesTab.style.display = "none";

    tabAdmins.classList.remove("btn-primary");
    tabAdmins.classList.add("btn-secondary");
    tabEstados.classList.remove("btn-primary");
    tabEstados.classList.add("btn-secondary");
    tabClientes.classList.remove("btn-primary");
    tabClientes.classList.add("btn-secondary");

    if (tabName === "admins") {
      adminTab.style.display = "block";
      tabAdmins.classList.remove("btn-secondary");
      tabAdmins.classList.add("btn-primary");
      loadAdmins();
    } else if (tabName === "estados") {
      estadosTab.style.display = "block";
      tabEstados.classList.remove("btn-secondary");
      tabEstados.classList.add("btn-primary");
      loadEstados();
    } else if (tabName === "clientes") {
      clientesTab.style.display = "block";
      tabClientes.classList.remove("btn-secondary");
      tabClientes.classList.add("btn-primary");
      loadClientes();
    }
  }

  // Cargar administradores con sus estados
  async function loadAdmins() {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_BASE_URL}/admin/gestionar-estados/admins`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Error al cargar administradores");

      const data = await response.json();
      currentAdmins = data.data || [];

      let html = "";
      if (currentAdmins.length === 0) {
        html = '<tr><td colspan="5" style="text-align: center; color: #9ca3af;">No hay administradores registrados</td></tr>';
      } else {
        html = currentAdmins.map(admin => `
          <tr>
            <td><strong>${admin.nombre} ${admin.apellido || ""}</strong></td>
            <td>${admin.email}</td>
            <td>${admin.estados_asignados || "Sin asignar"}</td>
            <td><span class="badge" style="background: #3b82f6; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px;">${admin.cantidad_estados || 0}</span></td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="abrirEditModal(${admin.adminid})">Editar</button>
            </td>
          </tr>
        `).join("");
      }

      adminTableBody.innerHTML = html;
    } catch (error) {
      console.error("Error cargando administradores:", error);
      adminTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444;">Error al cargar los datos</td></tr>`;
    }
  }

  // Cargar estados con sus administradores responsables
  async function loadEstados() {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_BASE_URL}/admin/gestionar-estados/estados`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Error al cargar estados");

      const data = await response.json();
      currentEstados = data.data || [];

      let html = "";
      if (currentEstados.length === 0) {
        html = '<tr><td colspan="4" style="text-align: center; color: #9ca3af;">No hay estados registrados</td></tr>';
      } else {
        html = currentEstados.map(estado => `
          <tr>
            <td><strong>${estado.nombre}</strong> <small style="color: #6b7280;">(${estado.abreviatura})</small></td>
            <td>${estado.region || "—"}</td>
            <td>${estado.admins_responsables || "Sin asignar"}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="abrirEditModal(null, ${estado.estadoid})">Editar</button>
            </td>
          </tr>
        `).join("");
      }

      estadosTableBody.innerHTML = html;
    } catch (error) {
      console.error("Error cargando estados:", error);
      estadosTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #ef4444;">Error al cargar los datos</td></tr>`;
    }
  }

  // Cargar clientes con sus estados y admins asignados
  async function loadClientes() {
    try {
      const token = getAdminToken();
      const response = await fetch(`${API_BASE_URL}/admin/gestionar-estados/clientes`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error("Error al cargar clientes");

      const data = await response.json();
      currentClientes = data.data || [];

      let html = "";
      if (currentClientes.length === 0) {
        html = '<tr><td colspan="5" style="text-align: center; color: #9ca3af;">No hay clientes registrados</td></tr>';
      } else {
        html = currentClientes.map(cliente => `
          <tr>
            <td><strong>${cliente.nombre} ${cliente.apellido || ""}</strong></td>
            <td>${cliente.estado_nombre || "Sin asignar"}</td>
            <td>${cliente.email || "—"}</td>
            <td>${cliente.telefono || "—"}</td>
            <td>${cliente.admin_responsable || "Sin asignar"}</td>
          </tr>
        `).join("");
      }

      clientesTableBody.innerHTML = html;
    } catch (error) {
      console.error("Error cargando clientes:", error);
      clientesTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444;">Error al cargar los datos</td></tr>`;
    }
  }

  // Abrir modal para editar
  async function abrirEditModal(adminId, estadoId) {
    selectedAdminId = adminId;

    if (adminId) {
      // Editar estados de un admin
      const admin = currentAdmins.find(a => a.adminid === adminId);
      if (!admin) return;

      const modalContent = document.getElementById("modalContent");
      let html = `<h4 style="margin-bottom: 1rem;">Asignar estados a: ${admin.nombre}</h4>
      <div style="max-height: 300px; overflow-y: auto;">`;

      if (currentEstados.length === 0) {
        await loadAllEstados();
      }

      html += currentEstados.map(estado => `
        <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; cursor: pointer;">
          <input type="checkbox" class="estado-checkbox" value="${estado.estadoid}"
            ${(admin.estado_ids || []).includes(estado.estadoid) ? 'checked' : ''}>
          <span>${estado.nombre}</span>
        </label>
      `).join("");

      html += '</div>';
      modalContent.innerHTML = html;
      editModal.style.display = "block";
    }
  }

  // Cargar todos los estados si no los tenemos
  async function loadAllEstados() {
    try {
      const response = await fetch(`${API_BASE_URL}/public/estados-all`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        currentEstados = data.data || [];
      }
    } catch (error) {
      console.error("Error al cargar todos los estados:", error);
    }
  }

  // Guardar estados asignados
  async function saveEstados() {
    if (!selectedAdminId) return;

    const checkboxes = document.querySelectorAll(".estado-checkbox");
    const estadoIds = Array.from(checkboxes)
      .filter(cb => cb.checked)
      .map(cb => parseInt(cb.value, 10));

    if (estadoIds.length === 0) {
      Swal.fire({
        title: "Error",
        text: "Debes seleccionar al menos un estado",
        icon: "error",
        confirmButtonColor: "#ef4444",
      });
      return;
    }

    try {
      const token = getAdminToken();
      const response = await fetch(`${API_BASE_URL}/admin/gestionar-estados/asignar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          adminId: selectedAdminId,
          estadoIds: estadoIds,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        Swal.fire({
          title: "Éxito",
          text: "Estados asignados correctamente",
          icon: "success",
          confirmButtonColor: "#10b981",
        }).then(() => {
          closeModal();
          loadAdmins();
        });
      } else {
        Swal.fire({
          title: "Error",
          text: data.message || "Error al asignar estados",
          icon: "error",
          confirmButtonColor: "#ef4444",
        });
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      Swal.fire({
        title: "Error de conexión",
        text: "No se pudo conectar con el servidor",
        icon: "error",
        confirmButtonColor: "#ef4444",
      });
    }
  }

  // Cerrar modal
  function closeModal() {
    editModal.style.display = "none";
    selectedAdminId = null;
  }

  // Event listeners
  function init() {
    tabAdmins.addEventListener("click", () => switchTab("admins"));
    tabEstados.addEventListener("click", () => switchTab("estados"));
    tabClientes.addEventListener("click", () => switchTab("clientes"));

    // Cerrar modal al hacer click fuera
    editModal.addEventListener("click", (e) => {
      if (e.target === editModal) closeModal();
    });

    // Cargar inicialmente tab de admins
    switchTab("admins");
  }

  // Exponer funciones globales
  window.abrirEditModal = abrirEditModal;
  window.saveEstados = saveEstados;
  window.closeModal = closeModal;

  // Inicializar cuando DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
