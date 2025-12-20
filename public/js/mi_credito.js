(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    if (typeof requireAuth === "function" && !requireAuth()) {
      return;
    }

    const limiteEl = document.getElementById("limiteCredito");
    const saldoEl = document.getElementById("saldoDeudor");
    const disponibleEl = document.getElementById("creditoDisponible");
    const movimientosBody = document.getElementById("movimientosTableBody");
    const loadingRow = document.getElementById("movimientosLoadingRow");
    const emptyState = document.getElementById("movimientosEmpty");
    const errorAlert = document.getElementById("creditError");
    const payButton = document.getElementById("btnPagarSaldo");

    function formatCurrency(value) {
      const amount = Number.parseFloat(value ?? 0) || 0;
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        minimumFractionDigits: 2,
      }).format(amount);
    }

    function formatDate(value) {
      if (!value) {
        return "—";
      }
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

    function normalizeConcept(movimiento) {
      return (
        movimiento?.concepto ||
        movimiento?.descripcion ||
        movimiento?.detalle ||
        movimiento?.referencia ||
        "Movimiento"
      );
    }

    function normalizeTipo(movimiento) {
      const value = (movimiento?.tipo || "").toString().toLowerCase();
      if (["cargo", "credito", "compra"].includes(value)) {
        return "cargo";
      }
      if (["abono", "pago"].includes(value)) {
        return "abono";
      }
      return "otro";
    }

    function badgeClassForType(tipo) {
      if (tipo === "abono") {
        return "admin-badge success";
      }
      if (tipo === "cargo") {
        return "admin-badge danger";
      }
      return "admin-badge info";
    }

    function labelForType(tipo) {
      if (tipo === "abono") {
        return "Abono";
      }
      if (tipo === "cargo") {
        return "Cargo";
      }
      return "Movimiento";
    }

    function renderStats(data) {
      const limite = data?.limiteCredito ?? data?.limite ?? 0;
      const saldo = data?.saldoDeudor ?? data?.saldo ?? 0;
      const disponible =
        data?.creditoDisponible ?? data?.disponible ?? Math.max(limite - saldo, 0);

      if (limiteEl) {
        limiteEl.textContent = formatCurrency(limite);
      }
      if (saldoEl) {
        saldoEl.textContent = formatCurrency(saldo);
      }
      if (disponibleEl) {
        const safeDisponible =
          typeof disponible === "number" && !Number.isNaN(disponible)
            ? disponible
            : Math.max(limite - saldo, 0);
        disponibleEl.textContent = formatCurrency(safeDisponible);
      }
    }

    function renderMovimientos(movimientos) {
      if (!movimientosBody) {
        return;
      }

      movimientosBody.innerHTML = "";
      emptyState.style.display = "none";

      if (!Array.isArray(movimientos) || movimientos.length === 0) {
        emptyState.style.display = "flex";
        return;
      }

      const rows = movimientos
        .map((mov) => {
          const tipo = normalizeTipo(mov);
          const concepto = normalizeConcept(mov);
          const badgeClass = badgeClassForType(tipo);
          const tipoLabel = labelForType(tipo);
          const fecha = formatDate(mov.fecha || mov.fechaMovimiento);

          const montoRaw = Number.parseFloat(mov.monto ?? mov.importe ?? 0) || 0;
          const montoFormatted =
            tipo === "abono"
              ? `-${formatCurrency(Math.abs(montoRaw))}`
              : formatCurrency(montoRaw);

          return `
            <tr>
              <td>${fecha}</td>
              <td>${concepto}</td>
              <td>
                <span class="${badgeClass}">${tipoLabel}</span>
              </td>
              <td class="text-end" style="font-weight:600;">${montoFormatted}</td>
            </tr>
          `;
        })
        .join("");

      movimientosBody.innerHTML = rows;
    }

    async function loadCredito() {
      if (loadingRow) {
        loadingRow.style.display = "";
      }
      if (errorAlert) {
        errorAlert.style.display = "none";
      }
      emptyState.style.display = "none";

      try {
        const response = await API.apiCall("/cliente/credito", {
          method: "GET",
        });

        if (response?.status === 403) {
          window.location.href = "/inicio.html";
          return;
        }

        if (!response.ok || response.data?.success === false) {
          throw new Error(
            response.data?.message || "No fue posible recuperar tu crédito."
          );
        }

        const payload = response.data?.data || {};
        renderStats(payload);
        renderMovimientos(payload.movimientos || payload.detalle || []);
      } catch (error) {
        console.error("Error cargando crédito:", error);
        if (error?.message && error?.message.includes("Acceso denegado")) {
          window.location.href = "/inicio.html";
          return;
        }

        if (errorAlert) {
          errorAlert.textContent =
            error.message || "Error al obtener información de crédito.";
          errorAlert.style.display = "block";
        }
        emptyState.style.display = "flex";
      } finally {
        if (loadingRow) {
          loadingRow.style.display = "none";
        }
      }
    }

    payButton?.addEventListener("click", async () => {
      if (typeof Swal !== "undefined" && Swal?.fire) {
        await Swal.fire({
          icon: "info",
          title: "Pagar saldo",
          text: "Un ejecutivo se pondrá en contacto para liquidar tu saldo. Mientras tanto puedes transferir a tu referencia habitual.",
          confirmButtonColor: "#F97316",
        });
        return;
      }

      alert("Un ejecutivo se pondrá en contacto para liquidar tu saldo.");
    });

    loadCredito();
  });
})();
