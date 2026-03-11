(function () {
  "use strict";

  // Validación crítica: Verificar que API esté disponible
  if (typeof API === 'undefined') {
    console.error('❌ [AGENTE-COMISIONES] Error crítico: api.js no se cargó correctamente');
    return;
  }

  if (!requireAgentAuth()) {
    return;
  }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const totalPagadoEl = document.getElementById("totalPagado");
    const totalPagadoCountEl = document.getElementById("totalPagadoCount");
    const totalPendienteEl = document.getElementById("totalPendiente");
    const totalPendienteCountEl = document.getElementById(
      "totalPendienteCount"
    );
    const tablaBody = document.getElementById("tablaComisionesBody");
    const refrescarBtn = document.getElementById("btnRefrescarComisiones");
    const logoutBtn = document.getElementById("logoutBtn");
    const emptyRowId = "tablaComisionesEmpty";

    function setLoading(message = "Cargando comisiones...") {
      tablaBody.innerHTML = `
        <tr id="${emptyRowId}">
          <td colspan="4" class="table-empty-state">${message}</td>
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
      });
    }

    function renderResumen(comisiones) {
      const totals = comisiones.reduce(
        (acc, comision) => {
          const monto = Number.parseFloat(comision.monto) || 0;
          const estatus = String(comision.estatus || "").toLowerCase();

          if (estatus === "pagada") {
            acc.pagado += monto;
            acc.pagadoCount += 1;
          } else if (estatus === "pendiente") {
            acc.pendiente += monto;
            acc.pendienteCount += 1;
          }

          return acc;
        },
        {
          pagado: 0,
          pendiente: 0,
          pagadoCount: 0,
          pendienteCount: 0,
        }
      );

      totalPagadoEl.textContent = formatCurrency(totals.pagado);
      totalPagadoCountEl.textContent = `${totals.pagadoCount} comisiones`;
      totalPendienteEl.textContent = formatCurrency(totals.pendiente);
      totalPendienteCountEl.textContent = `${totals.pendienteCount} comisiones`;
    }

    function renderTabla(comisiones) {
      if (!comisiones.length) {
        setLoading("Aún no tienes comisiones registradas.");
        return;
      }

      const rows = comisiones
        .map((comision) => {
          const estatusSlug = String(comision.estatus || "desconocido")
            .toLowerCase()
            .replace(/\s+/g, "-");

          return `
            <tr>
              <td>${formatDate(comision.fecha)}</td>
              <td>${comision.pedidoId || "—"}</td>
              <td>${formatCurrency(comision.monto)}</td>
              <td>
                <span class="estatus-pill estatus-${estatusSlug}">
                  ${comision.estatus || "Desconocido"}
                </span>
              </td>
            </tr>
          `;
        })
        .join("");

      tablaBody.innerHTML = rows;
    }

    async function loadComisiones() {
      setLoading();

      try {
        const response = await API.obtenerComisionesAgente();

        if (!response.ok || !response.data.success) {
          throw new Error(
            response.data?.message || "No fue posible obtener las comisiones"
          );
        }

        const comisiones = response.data.data?.comisiones || [];
        renderResumen(comisiones);
        renderTabla(comisiones);
      } catch (error) {
        console.error("Error al cargar comisiones del agente:", error);
        setLoading("Error al cargar las comisiones. Intenta nuevamente.");
        showToast(error.message || "Error al cargar las comisiones", "error");
      }
    }

    function handleLogout(event) {
      event.preventDefault();
      clearAuthData();
      showToast("Sesión cerrada", "info");
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 400);
    }

    refrescarBtn?.addEventListener("click", loadComisiones);
    logoutBtn?.addEventListener("click", handleLogout);

    loadComisiones();
  }
})();
