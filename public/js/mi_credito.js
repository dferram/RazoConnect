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
    const creditOverviewSection = document.getElementById("creditOverviewSection");
    const solicitudSection = document.getElementById("solicitudCreditoSection");
    const solicitudForm = document.getElementById("solicitudCreditoForm");
    const montoInput = document.getElementById("montoSolicitado");
    const ingresosInput = document.getElementById("ingresosMensuales");
    const motivoInput = document.getElementById("motivoCredito");
    const plazoSelect = document.getElementById("plazoPreferido");
    const submitBtn = document.getElementById("btnEnviarSolicitud");

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

    function mostrarResumenCredito() {
      if (creditOverviewSection) {
        creditOverviewSection.style.display = "";
      }
      if (solicitudSection) {
        solicitudSection.style.display = "none";
      }
    }

    function mostrarFormularioSolicitud() {
      if (creditOverviewSection) {
        creditOverviewSection.style.display = "none";
      }
      if (solicitudSection) {
        solicitudSection.style.display = "block";
      }
    }

    function tieneDatosCredito(payload) {
      if (!payload || typeof payload !== "object") return false;
      const hasKpi =
        payload.limiteCredito != null ||
        payload.limite != null ||
        payload.saldoDeudor != null ||
        payload.saldo != null;
      const hasMovimientos =
        Array.isArray(payload.movimientos) && payload.movimientos.length > 0;
      return hasKpi || hasMovimientos;
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

        if (response?.status === 404) {
          mostrarFormularioSolicitud();
          return;
        }

        if (!response.ok || response.data?.success === false) {
          throw new Error(
            response.data?.message || "No fue posible recuperar tu crédito."
          );
        }

        const payload = response.data?.data || {};
        if (!tieneDatosCredito(payload)) {
          mostrarFormularioSolicitud();
          return;
        }

        mostrarResumenCredito();
        renderStats(payload);
        renderMovimientos(payload.movimientos || payload.detalle || []);
      } catch (error) {
        console.error("Error cargando crédito:", error);
        if (error?.message && error?.message.includes("Acceso denegado")) {
          window.location.href = "/inicio.html";
          return;
        }

        if (error?.message && error.message.includes("No fue posible recuperar")) {
          mostrarFormularioSolicitud();
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

    async function enviarSolicitud() {
      if (!solicitudForm) return;

      const monto = Number.parseFloat(montoInput?.value || "0");
      const ingresos = Number.parseFloat(ingresosInput?.value || "0");
      const motivo = (motivoInput?.value || "").trim();
      const plazo = Number.parseInt(plazoSelect?.value || "", 10);

      if (!monto || monto <= 0 || !ingresos || ingresos <= 0 || !motivo || !plazo) {
        const msg = "Completa todos los campos antes de enviar tu solicitud.";
        if (typeof Swal !== "undefined" && Swal?.fire) {
          Swal.fire({
            icon: "warning",
            title: "Datos incompletos",
            text: msg,
            confirmButtonColor: "#F97316",
          });
        } else {
          alert(msg);
        }
        return;
      }

      try {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = "Enviando...";
        }

        const response = await API.apiCall("/cliente/solicitar-credito", {
          method: "POST",
          body: JSON.stringify({
            montoSolicitado: monto,
            ingresosMensuales: ingresos,
            motivoCredito: motivo,
            plazoPreferido: plazo,
          }),
        });

        if (!response.ok || response.data?.success === false) {
          throw new Error(
            response.data?.message || "No fue posible enviar la solicitud."
          );
        }

        if (typeof Swal !== "undefined" && Swal?.fire) {
          await Swal.fire({
            icon: "success",
            title: "¡Solicitud enviada!",
            text: "Nuestro equipo la revisará en breve.",
            confirmButtonColor: "#F97316",
          });
        } else {
          alert("¡Solicitud enviada! Nuestro equipo la revisará en breve.");
        }

        solicitudForm.reset();
      } catch (error) {
        console.error("Error enviando solicitud de crédito:", error);
        const message =
          error.message || "No pudimos registrar tu solicitud. Intenta más tarde.";
        if (typeof Swal !== "undefined" && Swal?.fire) {
          Swal.fire({
            icon: "error",
            title: "Error al enviar",
            text: message,
            confirmButtonColor: "#F97316",
          });
        } else {
          alert(message);
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Enviar solicitud";
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

    solicitudForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      enviarSolicitud();
    });

    loadCredito();
  });
})();
