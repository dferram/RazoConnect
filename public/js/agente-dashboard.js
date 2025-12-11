(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    if (!requireAgentAuth()) {
      return;
    }

    const ventasMesEl = document.getElementById("statVentasMes");
    const comisionesEl = document.getElementById("statComisiones");
    const clientesEl = document.getElementById("statClientes");
    const pedidosBody = document.getElementById("tablaUltimosPedidosBody");
    const refrescarBtn = document.getElementById("btnRefrescarDashboard");
    const userNameEl = document.getElementById("userName");
    const userRoleEl = document.getElementById("userRole");
    const userAvatarEl = document.getElementById("userAvatar");
    const emptyRowId = "tablaUltimosPedidosEmpty";

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
      });
    }

    function setPedidosLoading(message = "Cargando últimos pedidos...") {
      pedidosBody.innerHTML = `
        <tr id="${emptyRowId}">
          <td colspan="5" class="table-empty-state">${message}</td>
        </tr>
      `;
    }

    function renderStats(data) {
      ventasMesEl.textContent = formatCurrency(data.ventasDelMes);
      comisionesEl.textContent = formatCurrency(data.comisionesAcumuladas);
      clientesEl.textContent = data.clientesActivos ?? 0;
    }

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

    function renderPedidos(pedidos) {
      if (!pedidos.length) {
        setPedidosLoading("Aún no hay pedidos registrados");
        return;
      }

      const rows = pedidos
        .map((pedido) => {
          const clienteNombre =
            [pedido.clienteNombre, pedido.clienteApellido]
              .filter(Boolean)
              .join(" ") || "Cliente sin nombre";

          return `
            <tr>
              <td>${pedido.numeroPedido || `#${pedido.pedidoId}`}</td>
              <td>${clienteNombre}</td>
              <td>${formatDate(pedido.fechaPedido)}</td>
              <td>${formatCurrency(pedido.montoTotal)}</td>
              <td>${renderStatusSelector(pedido)}</td>
            </tr>
          `;
        })
        .join("");

      pedidosBody.innerHTML = rows;

      pedidosBody
        .querySelectorAll(".pedido-estatus-select")
        .forEach((select) => applyStatusSelectStyle(select));
    }

    function handleTablaPedidosEvent(event) {
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

          // Actualizar dashboard con datos frescos
          loadDashboard();
        } catch (error) {
          console.error("Error al actualizar estatus del pedido:", error);
          showToast(
            error.message || "Error al actualizar el estatus del pedido",
            "error"
          );
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

    async function loadDashboard() {
      try {
        ventasMesEl.textContent = "Cargando...";
        comisionesEl.textContent = "Cargando...";
        clientesEl.textContent = "-";
        setPedidosLoading();

        const response = await API.obtenerDashboardAgente();

        if (!response.ok || !response.data.success) {
          throw new Error(
            response.data?.message || "No fue posible obtener las estadísticas"
          );
        }

        const data = response.data.data || {};
        renderStats(data);
        renderPedidos(data.ultimosPedidos || []);
      } catch (error) {
        console.error("Error al cargar dashboard del agente:", error);
        showToast(error.message || "Error al cargar el dashboard", "error");
        ventasMesEl.textContent = "—";
        comisionesEl.textContent = "—";
        clientesEl.textContent = "—";
        setPedidosLoading("Error al cargar los pedidos");
      }
    }

    refrescarBtn?.addEventListener("click", loadDashboard);
    pedidosBody?.addEventListener("change", handleTablaPedidosEvent);

    updateUserHeader();
    loadDashboard();
  });
})();
