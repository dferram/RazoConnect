(function () {
  "use strict";

  if (!requireAgentAuth()) {
    return;
  }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const tabGroup = document.querySelector(".admin-filter-tabs");
    const tabButtons = Array.from(
      document.querySelectorAll(".admin-filter-btn")
    );
    const pedidosBody = document.getElementById("tablaPedidosBody");
    const refrescarBtn = document.getElementById("btnRefrescarPedidos");
    const logoutBtn = document.getElementById("logoutBtn");
    const emptyRowId = "tablaPedidosEmpty";

    let currentStatusFilter = "";

    function getPedidoStatusBadgeClass(estatus) {
      const value = (estatus || "").toString().toLowerCase();

      if (value === "pendiente") return "pedido-estatus-badge pendiente";
      if (value === "confirmado") return "pedido-estatus-badge confirmado";
      if (
        value === "enviado" ||
        value === "en ruta" ||
        value === "en_ruta" ||
        value === "en-ruta"
      ) {
        return "pedido-estatus-badge enviado";
      }
      if (value === "entregado") return "pedido-estatus-badge entregado";
      if (value === "cancelado") return "pedido-estatus-badge cancelado";
      if (value === "completado") return "pedido-estatus-badge completado";

      return "pedido-estatus-badge pendiente";
    }

    function setLoading(message = "Cargando pedidos...") {
      pedidosBody.innerHTML = `
        <tr id="${emptyRowId}">
          <td colspan="6" class="table-empty-state">${message}</td>
        </tr>
      `;
    }

    function formatCurrency(value) {
      if (value === null || value === undefined) {
        return "$0.00";
      }

      const amount = Number.parseFloat(value);
      if (Number.isNaN(amount)) {
        return "$0.00";
      }

      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2,
      }).format(amount);
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
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    function renderPedidos(pedidos) {
      if (!pedidos.length) {
        setLoading("Aún no hay pedidos con este filtro.");
        return;
      }

      const rows = pedidos
        .map((pedido) => {
          const clienteNombre =
            [pedido.clienteNombre, pedido.clienteApellido]
              .filter(Boolean)
              .join(" ") || "Cliente sin nombre";

          const badgeClass = getPedidoStatusBadgeClass(pedido.estatus);

          return `
            <tr>
              <td>${pedido.numeroPedido || `#${pedido.pedidoId}`}</td>
              <td>${clienteNombre}</td>
              <td>${formatDate(pedido.fechaPedido)}</td>
              <td>${formatCurrency(pedido.montoTotal)}</td>
              <td>
                <span class="${badgeClass}">
                  ${pedido.estatus || "Desconocido"}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-primary btn-sm btn-detalle"
                  data-pedido-id="${pedido.pedidoId}"
                >
                  Ver detalle
                </button>
              </td>
            </tr>
          `;
        })
        .join("");

      pedidosBody.innerHTML = rows;
    }

    async function loadPedidos() {
      setLoading();

      try {
        const response = await API.obtenerPedidosAgente(currentStatusFilter);

        if (!response.ok || !response.data.success) {
          throw new Error(
            response.data?.message || "No fue posible obtener los pedidos"
          );
        }

        const pedidos = response.data.data?.pedidos || [];
        renderPedidos(pedidos);
      } catch (error) {
        console.error("Error al cargar pedidos del agente:", error);
        setLoading("Error al cargar los pedidos. Intenta nuevamente.");
        showToast(error.message || "Error al cargar los pedidos", "error");
      }
    }

    function handleTabClick(event) {
      const button = event.target.closest(".admin-filter-btn");
      if (!button) {
        return;
      }

      tabButtons.forEach((btn) => {
        const isActive = btn === button;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      currentStatusFilter = button.dataset.estatus || "";
      loadPedidos();
    }

    function handleTableClick(event) {
      const btn = event.target.closest(".btn-detalle");
      if (!btn) {
        return;
      }

      const pedidoId = btn.dataset.pedidoId;
      // Marcar que es navegación interna para evitar limpieza de tokens
      sessionStorage.setItem("_navigating", "true");
      localStorage.setItem("_nav_timestamp", Date.now().toString());
      window.location.href = `/agente-pedido-detalle.html?id=${pedidoId}`;
    }

    function handleLogout(event) {
      event.preventDefault();
      clearAuthData();
      showToast("Sesión cerrada", "info");
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 400);
    }

    tabGroup?.addEventListener("click", handleTabClick);
    pedidosBody?.addEventListener("click", handleTableClick);
    refrescarBtn?.addEventListener("click", loadPedidos);
    logoutBtn?.addEventListener("click", handleLogout);

    loadPedidos();
  }
})();
