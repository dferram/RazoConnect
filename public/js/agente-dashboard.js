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
              <td><span class="admin-badge info">${
                pedido.estatus || "Desconocido"
              }</span></td>
            </tr>
          `;
        })
        .join("");

      pedidosBody.innerHTML = rows;
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

    updateUserHeader();
    loadDashboard();
  });
})();
