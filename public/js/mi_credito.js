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

    let currentPage = 1;
    let totalPages = 1;
    let isLoadingMovimientos = false;

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
          const fecha = mov.fecha
            ? new Date(mov.fecha).toLocaleDateString("es-MX", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })
            : "—";
          const monto = formatCurrency(Math.abs(mov.monto || 0));

          return `
            <tr>
              <td>${fecha}</td>
              <td>${concepto}</td>
              <td>
                <span class="badge ${tipo === "cargo" ? "bg-danger" : "bg-success"}">
                  ${tipo === "cargo" ? "Cargo" : "Abono"}
                </span>
              </td>
              <td class="text-end fw-bold ${tipo === "cargo" ? "text-danger" : "text-success"}">
                ${tipo === "cargo" ? "-" : "+"}${monto}
              </td>
            </tr>
          `;
        })
        .join("");

      movimientosBody.innerHTML = rows;
    }

    function renderPagination(pagination) {
      const paginationContainer = document.getElementById("movimientosPagination");
      if (!paginationContainer || !pagination) return;

      currentPage = pagination.page;
      totalPages = pagination.totalPages;

      if (totalPages <= 1) {
        paginationContainer.style.display = "none";
        return;
      }

      paginationContainer.style.display = "flex";

      const prevDisabled = !pagination.hasPrevPage ? "disabled" : "";
      const nextDisabled = !pagination.hasNextPage ? "disabled" : "";

      let paginationHTML = `
        <nav aria-label="Paginación de movimientos">
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item ${prevDisabled}">
              <button class="page-link" onclick="window.cambiarPaginaMovimientos(${currentPage - 1})" ${prevDisabled}>
                Anterior
              </button>
            </li>
      `;

      // Mostrar páginas
      const maxPagesToShow = 5;
      let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
      let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

      if (endPage - startPage < maxPagesToShow - 1) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
      }

      for (let i = startPage; i <= endPage; i++) {
        const active = i === currentPage ? "active" : "";
        paginationHTML += `
          <li class="page-item ${active}">
            <button class="page-link" onclick="window.cambiarPaginaMovimientos(${i})">${i}</button>
          </li>
        `;
      }

      paginationHTML += `
            <li class="page-item ${nextDisabled}">
              <button class="page-link" onclick="window.cambiarPaginaMovimientos(${currentPage + 1})" ${nextDisabled}>
                Siguiente
              </button>
            </li>
          </ul>
        </nav>
        <div class="ms-3 text-muted small">
          Página ${currentPage} de ${totalPages} (${pagination.total} movimientos)
        </div>
      `;

      paginationContainer.innerHTML = paginationHTML;
    }

    async function cargarMovimientos(page = 1) {
      if (isLoadingMovimientos) return;
      isLoadingMovimientos = true;

      try {
        const response = await API.apiCall(`/cliente/credito?page=${page}&limit=10`, {
          method: "GET",
        });

        if (response.ok && response.data?.success) {
          const movimientos = response.data.data?.movimientos || [];
          const pagination = response.data.data?.pagination;

          renderMovimientos(movimientos);
          renderPagination(pagination);
        } else {
          renderMovimientos([]);
        }
      } catch (error) {
        console.error("Error cargando movimientos:", error);
        renderMovimientos([]);
      } finally {
        isLoadingMovimientos = false;
      }
    }

    // Exponer función globalmente para los botones de paginación
    window.cambiarPaginaMovimientos = (page) => {
      if (page >= 1 && page <= totalPages && page !== currentPage) {
        cargarMovimientos(page);
      }
    };

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
        // Primero verificar si el cliente tiene crédito activo
        const checkResponse = await API.apiCall("/cliente/check-auth-credit", {
          method: "GET",
        });

        if (checkResponse?.status === 403) {
          window.location.href = "/inicio.html";
          return;
        }

        if (!checkResponse.ok || checkResponse.data?.success === false) {
          throw new Error(
            checkResponse.data?.message || "No fue posible verificar tu crédito."
          );
        }

        const checkData = checkResponse.data || {};
        
        // SI el cliente tiene crédito activo → Mostrar Dashboard
        if (checkData.hasCredit && checkData.creditSummary) {
          mostrarResumenCredito();
          renderStats(checkData.creditSummary);
          
          // Cargar movimientos con paginación
          await cargarMovimientos(1);
        } else if (checkData.hasPendingRequest && checkData.pendingRequest) {
          // SI tiene una solicitud pendiente → Mostrar mensaje informativo
          mostrarFormularioSolicitud();
          Swal.fire({
            icon: "info",
            title: "Solicitud en Proceso",
            html: `
              <p>Tu solicitud de crédito por <strong>${formatCurrency(checkData.pendingRequest.monto_solicitado)}</strong> está siendo evaluada por nuestro equipo.</p>
              <p style="margin-top: 1rem; color: #6b5d57;">Te notificaremos cuando sea aprobada.</p>
            `,
            confirmButtonText: "Entendido",
            confirmButtonColor: "#F97316",
            allowOutsideClick: false,
          });
          // Deshabilitar el formulario si ya hay una solicitud pendiente
          if (submitBtn) submitBtn.disabled = true;
          if (montoInput) montoInput.disabled = true;
          if (ingresosInput) ingresosInput.disabled = true;
          if (motivoInput) motivoInput.disabled = true;
          if (plazoSelect) plazoSelect.disabled = true;
        } else {
          // SINO → Mostrar Formulario de Solicitud
          mostrarFormularioSolicitud();
        }
      } catch (error) {
        console.error("Error cargando crédito:", error);
        if (error?.message && error?.message.includes("Acceso denegado")) {
          window.location.href = "/inicio.html";
          return;
        }

        // En caso de error, mostrar formulario por defecto
        mostrarFormularioSolicitud();

        if (errorAlert) {
          errorAlert.textContent =
            error.message || "Error al obtener información de crédito.";
          errorAlert.style.display = "block";
        }
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

    solicitudForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      enviarSolicitud();
    });

    // ========================================
    // FUNCIONES PARA EL MODAL DE PAGO
    // ========================================
    
    function abrirModalPago() {
      const modal = document.getElementById("modalPagoCredito");
      if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden"; // Prevenir scroll del body
      }
    }

    function cerrarModalPago() {
      const modal = document.getElementById("modalPagoCredito");
      if (modal) {
        modal.style.display = "none";
        document.body.style.overflow = ""; // Restaurar scroll
      }
    }

    function seleccionarMetodoPago(metodo) {
      console.log(`✅ Método de pago seleccionado: ${metodo}`);
      
      // Aquí puedes agregar la lógica específica para cada método
      if (metodo === "transferencia") {
        console.log("📋 Mostrando información de transferencia bancaria...");
        console.log("Datos bancarios:");
        console.log("- Banco: BBVA");
        console.log("- Cuenta: 0123456789");
        console.log("- CLABE: 012345678901234567");
        // TODO: Mostrar modal con datos bancarios
      } else if (metodo === "mercadopago") {
        console.log("💳 Redirigiendo a Mercado Pago...");
        console.log("Preparando integración con API de Mercado Pago...");
        // TODO: Integrar con API de Mercado Pago
      }

      cerrarModalPago();
    }

    // Event listener para abrir el modal al hacer click en "Pagar saldo"
    payButton?.addEventListener("click", () => {
      abrirModalPago();
    });

    // Cerrar modal con botón X
    const btnCerrarModal = document.getElementById("btnCerrarModalPago");
    btnCerrarModal?.addEventListener("click", cerrarModalPago);

    // Cerrar modal al hacer click fuera del contenedor
    const modalOverlay = document.getElementById("modalPagoCredito");
    modalOverlay?.addEventListener("click", (event) => {
      if (event.target === modalOverlay) {
        cerrarModalPago();
      }
    });

    // Manejar selección de métodos de pago
    const metodoCards = document.querySelectorAll(".metodo-pago-card");
    metodoCards.forEach((card) => {
      card.addEventListener("click", () => {
        const metodo = card.getAttribute("data-metodo");
        seleccionarMetodoPago(metodo);
      });
    });

    // ========================================
    // FIN FUNCIONES MODAL DE PAGO
    // ========================================

    loadCredito();
  });
})();
