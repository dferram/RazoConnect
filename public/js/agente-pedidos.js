(function () {
  "use strict";

  if (!requireAuth()) {
    return;
  }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const tabGroup = document.querySelector(".tab-group");
    const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
    const pedidosBody = document.getElementById("tablaPedidosBody");
    const refrescarBtn = document.getElementById("btnRefrescarPedidos");
    const logoutBtn = document.getElementById("logoutBtn");
    const emptyRowId = "tablaPedidosEmpty";

    let currentStatusFilter = "";

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

          const statusSlug = (pedido.estatus || "desconocido")
            .toLowerCase()
            .replace(/\s+/g, "_");

          return `
            <tr>
              <td>${pedido.numeroPedido || `#${pedido.pedidoId}`}</td>
              <td>${clienteNombre}</td>
              <td>${formatDate(pedido.fechaPedido)}</td>
              <td>${formatCurrency(pedido.montoTotal)}</td>
              <td>
                <span class="estatus-pill estatus-${statusSlug}">
                  ${pedido.estatus || "Desconocido"}
                </span>
              </td>
              <td>
                <button
                  type="button"
                  class="btn btn-secondary btn-detalle"
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
      const button = event.target.closest(".tab-button");
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
      showToast(
        `Detalle del pedido #${pedidoId} disponible próximamente.`,
        "info"
      );
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
