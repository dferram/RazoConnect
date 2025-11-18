(function () {
  "use strict";

  if (!requireAuth()) {
    return;
  }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const logoutBtn = document.getElementById("logoutBtn");
    const refrescarBtn = document.getElementById("btnRecargarClientes");
    const clientesBody = document.getElementById("clientesTablaBody");
    const searchInput = document.getElementById("clientesSearchInput");
    const searchForm = document.getElementById("clientesSearchForm");
    const clearSearchBtn = document.getElementById("btnLimpiarBusqueda");
    const userNameEl = document.getElementById("userName");
    const userRoleEl = document.getElementById("userRole");
    const userAvatarEl = document.getElementById("userAvatar");
    const emptyRowId = "clientesEmptyRow";

    let currentSearch = "";

    const debounce = (fn, delay = 350) => {
      let timer;
      return (...args) => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fn(...args), delay);
      };
    };

    const debouncedSearch = debounce((term) => {
      currentSearch = term.trim();
      loadClientes();
    }, 350);

    function getDisplayName(user) {
      const nombre = user?.Nombre || user?.nombre || user?.firstName;
      const apellido = user?.Apellido || user?.apellido || user?.lastName;

      const combined = [nombre, apellido].filter(Boolean).join(" ");
      if (combined.trim().length) {
        return combined.trim();
      }

      return user?.displayName || user?.email || "Agente";
    }

    function computeInitials(name) {
      if (!name) {
        return "A";
      }
      const words = name.trim().split(/\s+/);
      if (!words.length) {
        return "A";
      }
      const initials = words
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join("");
      return initials || "A";
    }

    function updateUserHeader() {
      if (!userNameEl || !userRoleEl || !userAvatarEl) {
        return;
      }

      const user = getUserData();
      let displayName = getDisplayName(user);
      let role = "Agente";

      if (!user) {
        const admin =
          typeof getAdminData === "function" ? getAdminData() : null;
        if (admin) {
          displayName = getDisplayName(admin);
          role = admin?.rol || "Agente";
        }
      } else if (user?.Rol || user?.rol) {
        role = user.Rol || user.rol;
      }

      userNameEl.textContent = displayName;
      userRoleEl.textContent = role;
      userAvatarEl.textContent = computeInitials(displayName);
    }

    function setLoading(message = "Cargando cartera...") {
      clientesBody.innerHTML = `
        <tr id="${emptyRowId}">
          <td colspan="5" class="table-empty-state">${message}</td>
        </tr>
      `;
    }

    function formatDate(value) {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "—";
      }

      return date.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    }

    function renderClientes(clientes) {
      if (!clientes.length) {
        setLoading("No encontramos clientes con ese criterio.");
        return;
      }

      const rows = clientes
        .map((cliente) => {
          const nombreCompleto =
            [cliente.nombre, cliente.apellido].filter(Boolean).join(" ") ||
            "Sin nombre";

          return `
            <tr>
              <td>${nombreCompleto}</td>
              <td>${cliente.email || "—"}</td>
              <td>${cliente.telefono || "—"}</td>
              <td>${formatDate(cliente.fechaRegistro)}</td>
              <td>
                <button
                  type="button"
                  class="btn btn-secondary btn-historial"
                  data-cliente-id="${cliente.clienteId}"
                  data-cliente-nombre="${nombreCompleto}"
                >
                  Ver Historial
                </button>
              </td>
            </tr>
          `;
        })
        .join("");

      clientesBody.innerHTML = rows;
    }

    async function loadClientes() {
      setLoading();

      try {
        const response = await API.obtenerClientesAgente(currentSearch);

        if (!response.ok || !response.data.success) {
          throw new Error(
            response.data?.message || "No fue posible obtener la cartera"
          );
        }

        const clientes = response.data.data?.clientes || [];
        renderClientes(clientes);
      } catch (error) {
        console.error("Error al cargar clientes del agente:", error);
        setLoading("Error al cargar la cartera. Intenta nuevamente.");
        showToast(error.message || "Error al cargar la cartera", "error");
      }
    }

    function handleSearchInput(event) {
      const term = event.target.value;
      debouncedSearch(term);
    }

    function handleSearchSubmit(event) {
      event.preventDefault();
      currentSearch = searchInput.value.trim();
      loadClientes();
    }

    function handleClearSearch() {
      searchInput.value = "";
      currentSearch = "";
      loadClientes();
      searchInput.focus();
    }

    function handleTableClick(event) {
      const button = event.target.closest(".btn-historial");
      if (!button) {
        return;
      }

      const nombre = button.dataset.clienteNombre || "el cliente";
      showToast(`Historial de ${nombre} disponible próximamente.`, "info");
    }

    function handleLogout(event) {
      event.preventDefault();
      clearAuthData();
      showToast("Sesión cerrada", "info");
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 400);
    }

    refrescarBtn?.addEventListener("click", () => loadClientes());
    clientesBody?.addEventListener("click", handleTableClick);
    searchInput?.addEventListener("input", handleSearchInput);
    searchForm?.addEventListener("submit", handleSearchSubmit);
    clearSearchBtn?.addEventListener("click", handleClearSearch);
    logoutBtn?.addEventListener("click", handleLogout);

    updateUserHeader();
    loadClientes();
  }
})();
