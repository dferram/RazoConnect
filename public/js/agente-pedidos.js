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

    function getStatusSelectStyle(value) {
      const v = (value || "").toString().toLowerCase();

      if (v === "confirmado") {
        return {
          backgroundColor: "#dcfce7",
          color: "#16a34a",
          borderColor: "#bbf7d0",
        };
      }

      if (v === "cancelado") {
        return {
          backgroundColor: "#fef2f2",
          color: "#dc2626",
          borderColor: "#fecaca",
        };
      }

      return {
        backgroundColor: "#fff7ed",
        color: "#ff9966",
        borderColor: "#fed7aa",
      };
    }

    function applyStatusSelectStyle(selectEl) {
      if (!selectEl) return;
      const styles = getStatusSelectStyle(selectEl.value);
      selectEl.style.backgroundColor = styles.backgroundColor;
      selectEl.style.color = styles.color;
      selectEl.style.border = `1px solid ${styles.borderColor}`;
      selectEl.style.borderRadius = "999px";
      selectEl.style.padding = "0.25rem 0.75rem";
      selectEl.style.fontSize = "0.8rem";
      selectEl.style.fontWeight = "600";
      selectEl.style.textTransform = "capitalize";
      selectEl.style.cursor = "pointer";
      selectEl.style.minWidth = "140px";
    }

    function renderStatusSelector(pedido) {
      const estatus = pedido.estatus || "";
      const value = estatus.toString().toLowerCase();

      // Solo editable si está Pendiente
      if (value !== "pendiente") {
        const badgeClass = getPedidoStatusBadgeClass(estatus);
        return `<span class="${badgeClass}">${estatus || "Desconocido"}</span>`;
      }

      const currentValue = "Pendiente";

      return `
        <select 
          class="pedido-estatus-select"
          data-pedido-id="${pedido.pedidoId}"
          data-current-value="${currentValue}"
        >
          <option value="Pendiente" ${
            currentValue === "Pendiente" ? "selected" : ""
          }>Pendiente</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
      `;
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
                ${renderStatusSelector(pedido)}
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

      pedidosBody
        .querySelectorAll(".pedido-estatus-select")
        .forEach((select) => applyStatusSelectStyle(select));
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
      if (btn) {
        const pedidoId = btn.dataset.pedidoId;
        // Marcar que es navegación interna para evitar limpieza de tokens
        sessionStorage.setItem("_navigating", "true");
        localStorage.setItem("_nav_timestamp", Date.now().toString());
        window.location.href = `/agente-pedido-detalle.html?id=${pedidoId}`;
        return;
      }

      const select = event.target.closest(".pedido-estatus-select");
      if (!select) {
        return;
      }

      const pedidoId = select.dataset.pedidoId;
      const previousValue = select.dataset.currentValue || "Pendiente";
      const newValue = select.value;

      if (!pedidoId || !newValue || newValue === previousValue) {
        applyStatusSelectStyle(select);
        return;
      }

      // Feedback inmediato de color
      applyStatusSelectStyle(select);

      const swalAvailable =
        typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function";

      const confirmCambio = async () => {
        try {
          const response = await API.actualizarEstatusPedidoAgente(
            pedidoId,
            newValue
          );

          if (!response.ok || !response.data?.success) {
            throw new Error(
              response.data?.message || "No fue posible actualizar el estatus"
            );
          }

          showToast(
            response.data.message ||
              `Pedido #${pedidoId} actualizado a ${newValue}`,
            "success"
          );

          // Tras cambiar el estatus, recargar la lista para que se convierta en badge estático si ya no es Pendiente
          loadPedidos();
        } catch (error) {
          console.error("Error al actualizar estatus del pedido:", error);
          showToast(
            error.message || "Error al actualizar el estatus del pedido",
            "error"
          );
          // Revertir visualmente el valor y estilo
          select.value = previousValue;
          applyStatusSelectStyle(select);
        }
      };

      if (!swalAvailable) {
        if (
          window.confirm(
            `¿Confirmas cambiar el estatus del pedido #${pedidoId} a "${newValue}"?`
          )
        ) {
          confirmCambio();
        } else {
          select.value = previousValue;
          applyStatusSelectStyle(select);
        }
        return;
      }

      Swal.fire({
        icon: "question",
        title: "Cambiar estatus del pedido",
        text: `¿Confirmas cambiar el estatus del pedido #${pedidoId} a "${newValue}"?`,
        showCancelButton: true,
        confirmButtonText: "Sí, cambiar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "#F97316",
        cancelButtonColor: "#6b7280",
      }).then((result) => {
        if (result.isConfirmed) {
          confirmCambio();
        } else {
          select.value = previousValue;
          applyStatusSelectStyle(select);
        }
      });
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
    pedidosBody?.addEventListener("change", handleTableClick);
    refrescarBtn?.addEventListener("click", loadPedidos);
    logoutBtn?.addEventListener("click", handleLogout);

    loadPedidos();
  }
})();
