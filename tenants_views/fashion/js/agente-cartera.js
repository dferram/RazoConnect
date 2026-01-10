(function () {
  "use strict";

  if (!requireAgentAuth()) {
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
    const modalVincular = document.getElementById("modal-vincular-cliente");
    const btnAbrirModalVincular = document.getElementById(
      "btnAbrirModalVincular"
    );
    const btnCerrarModalVincular = document.getElementById(
      "btnCerrarModalVincular"
    );
    const btnCancelarVincular = document.getElementById("btnCancelarVincular");
    const btnConfirmarVincular = document.getElementById(
      "btnConfirmarVincular"
    );
    const clientesDisponiblesBody = document.getElementById(
      "clientesDisponiblesBody"
    );
    const clientesDisponiblesEmpty = document.getElementById(
      "clientesDisponiblesEmpty"
    );
    const buscadorDisponiblesForm = document.getElementById(
      "formBuscarClienteDisponible"
    );
    const clientesDisponiblesSearchInput = document.getElementById(
      "clientesDisponiblesSearchInput"
    );
    const btnLimpiarBusquedaDisponibles = document.getElementById(
      "btnLimpiarBusquedaDisponibles"
    );
    const vincularForm = document.getElementById("formVincularCliente");
    const userNameEl = document.getElementById("userName");
    const userRoleEl = document.getElementById("userRole");
    const userAvatarEl = document.getElementById("userAvatar");
    const emptyRowId = "clientesEmptyRow";

    let currentSearch = "";
    let clientesDisponibles = [];
    let filtroDisponibles = "";
    let selectedClientId = null;

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

    function renderClientesDisponibles(lista, selectedId = null) {
      if (!clientesDisponiblesBody || !clientesDisponiblesEmpty) {
        return;
      }

      if (!lista.length) {
        clientesDisponiblesBody.innerHTML = `
          <tr class="table-empty-state-row">
            <td colspan="4">
              ${
                filtroDisponibles
                  ? "No encontramos clientes con ese criterio."
                  : "No hay clientes disponibles"
              }
            </td>
          </tr>
        `;
        return;
      }

      const rows = lista
        .map((cliente) => {
          const nombreCompleto =
            [cliente.nombre, cliente.apellido].filter(Boolean).join(" ") ||
            "Sin nombre";
          const telefono = cliente.telefono || "—";
          const isSelected = cliente.clienteId === selectedId;
          return `
            <tr data-cliente-id="${cliente.clienteId}" class="cliente-row ${isSelected ? 'selected-row' : ''}" style="cursor: pointer;">
              <td class="table-radio">
                <input
                  type="radio"
                  name="cliente-disponible"
                  value="${cliente.clienteId}"
                  ${isSelected ? "checked" : ""}
                  aria-label="Seleccionar ${nombreCompleto}"
                />
              </td>
              <td>${nombreCompleto}</td>
              <td>${cliente.email || "—"}</td>
              <td>${telefono}</td>
            </tr>
          `;
        })
        .join("");

      clientesDisponiblesBody.innerHTML = rows;
    }

    function filtrarClientesDisponibles(term) {
      filtroDisponibles = term.trim().toLowerCase();
      const filtrados = clientesDisponibles.filter((cliente) => {
        const nombre = `${cliente.nombre || ""} ${cliente.apellido || ""}`
          .toLowerCase()
          .trim();
        const email = (cliente.email || "").toLowerCase();
        if (!filtroDisponibles) {
          return true;
        }
        return (
          nombre.includes(filtroDisponibles) ||
          email.includes(filtroDisponibles)
        );
      });

      renderClientesDisponibles(filtrados, getClienteSeleccionado());
    }

    async function fetchClientesDisponibles() {
      try {
        clientesDisponiblesBody.innerHTML = `
          <tr class="table-empty-state-row">
            <td colspan="4">Cargando clientes disponibles...</td>
          </tr>
        `;

        const response = await API.obtenerClientesDisponibles();

        if (!response.ok || !response.data?.success) {
          throw new Error(
            response.data?.message ||
              "No fue posible obtener los clientes disponibles"
          );
        }

        clientesDisponibles = response.data?.data?.clientes || [];
        filtrarClientesDisponibles(filtroDisponibles);
      } catch (error) {
        console.error("Error al cargar clientes disponibles:", error);
        showToast(
          error.message || "Error al cargar clientes disponibles",
          "error"
        );

        clientesDisponiblesBody.innerHTML = `
          <tr class="table-empty-state-row">
            <td colspan="4">Error al cargar clientes</td>
          </tr>
        `;
      }
    }

    function getClienteSeleccionado() {
      return selectedClientId || null;
    }

    async function openModalVincular() {
      if (!modalVincular) return;
      modalVincular.classList.add("show");
      modalVincular.setAttribute("aria-hidden", "false");
      filtroDisponibles = "";
      clientesDisponiblesSearchInput.value = "";
      await fetchClientesDisponibles();
      clientesDisponiblesSearchInput?.focus();
    }

    function closeModalVincular() {
      if (!modalVincular) return;
      modalVincular.classList.remove("show");
      modalVincular.setAttribute("aria-hidden", "true");
      vincularForm?.reset();
      clientesDisponibles = [];
      filtroDisponibles = "";
      selectedClientId = null;
      if (clientesDisponiblesBody) {
        clientesDisponiblesBody.innerHTML = `
          <tr class="table-empty-state-row">
            <td colspan="4">Cargando clientes disponibles...</td>
          </tr>
        `;
      }
    }

    async function handleConfirmarVinculo() {
      if (!btnConfirmarVincular) {
        return;
      }

      const clienteId = getClienteSeleccionado();
      if (!clienteId) {
        showToast("Por favor selecciona un cliente primero", "warning");
        return;
      }

      try {
        btnConfirmarVincular.disabled = true;
        const response = await API.vincularClienteAgente(clienteId);

        if (!response.ok || !response.data?.success) {
          const errorMessage =
            response.data?.message || "No fue posible vincular al cliente";
          throw new Error(errorMessage);
        }

        showToast(
          response.data?.message || "Cliente vinculado correctamente",
          "success"
        );
        closeModalVincular();
        loadClientes();
      } catch (error) {
        console.error("Error al vincular cliente:", error);
        showToast(
          error.message || "Error al vincular el cliente. Intenta nuevamente",
          "error"
        );
      } finally {
        btnConfirmarVincular.disabled = false;
      }
    }

    refrescarBtn?.addEventListener("click", () => loadClientes());
    clientesBody?.addEventListener("click", handleTableClick);
    searchInput?.addEventListener("input", handleSearchInput);
    searchForm?.addEventListener("submit", handleSearchSubmit);
    clearSearchBtn?.addEventListener("click", handleClearSearch);
    logoutBtn?.addEventListener("click", handleLogout);
    btnAbrirModalVincular?.addEventListener("click", openModalVincular);
    btnCerrarModalVincular?.addEventListener("click", closeModalVincular);
    btnCancelarVincular?.addEventListener("click", closeModalVincular);
    btnConfirmarVincular?.addEventListener("click", handleConfirmarVinculo);
    buscadorDisponiblesForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      filtrarClientesDisponibles(clientesDisponiblesSearchInput.value || "");
    });
    btnLimpiarBusquedaDisponibles?.addEventListener("click", () => {
      clientesDisponiblesSearchInput.value = "";
      filtrarClientesDisponibles("");
      clientesDisponiblesSearchInput.focus();
    });
    clientesDisponiblesBody?.addEventListener("click", (event) => {
      const row = event.target.closest(".cliente-row");
      if (!row) return;

      const clienteId = row.dataset.clienteId;
      if (!clienteId) return;

      selectedClientId = parseInt(clienteId, 10);

      const radioInput = row.querySelector('input[type="radio"]');
      if (radioInput) {
        radioInput.checked = true;
      }

      document.querySelectorAll(".cliente-row").forEach((r) => {
        r.classList.remove("selected-row");
      });
      row.classList.add("selected-row");
    });
    vincularForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      handleConfirmarVinculo();
    });
    modalVincular?.addEventListener("click", (event) => {
      if (event.target === modalVincular) {
        closeModalVincular();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modalVincular?.classList.contains("show")) {
        closeModalVincular();
      }
    });

    updateUserHeader();
    loadClientes();
  }
})();
