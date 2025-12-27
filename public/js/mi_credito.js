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
    
    const modalPagoCredito = document.getElementById("modalPagoCredito");
    const btnCerrarModalPago = document.getElementById("btnCerrarModalPago");
    const btnCancelarPago = document.getElementById("btnCancelarPago");
    const btnConfirmarPago = document.getElementById("btnConfirmarPago");
    const paymentCards = document.querySelectorAll("#paymentOptionsPagoCredito .payment-option-card");
    const debtsTableBody = document.getElementById("debtsTableBody");
    const selectAllDebts = document.getElementById("selectAllDebts");
    const montoAPagarInput = document.getElementById("montoAPagar");
    
    let metodoPagoSeleccionado = "mercadopago";
    let debtItems = [];
    let fileUploadManager = null;

    async function cargarDeudaPendiente() {
      try {
        const response = await API.apiCall("/cliente/credito?page=1&limit=100", {
          method: "GET",
        });

        if (response.ok && response.data?.success) {
          const movimientos = response.data.data?.movimientos || [];
          // Filtrar solo cargos (deuda pendiente)
          debtItems = movimientos
            .filter(mov => {
              const tipo = (mov.tipo_movimiento || mov.tipo || "").toString().toLowerCase();
              return ["cargo", "credito", "compra"].includes(tipo);
            })
            .map(mov => ({
              id: mov.movimientoId || mov.movimiento_id,
              concepto: mov.descripcion || mov.concepto || "Cargo",
              fecha: mov.fecha || mov.fecha_movimiento,
              monto: Math.abs(parseFloat(mov.monto || 0)),
              selected: false
            }));

          renderDebtsTable();
        } else {
          debtItems = [];
          renderDebtsTable();
        }
      } catch (error) {
        console.error("Error cargando deuda pendiente:", error);
        debtItems = [];
        renderDebtsTable();
      }
    }

    function renderDebtsTable() {
      if (!debtsTableBody) return;

      if (debtItems.length === 0) {
        debtsTableBody.innerHTML = `
          <tr>
            <td colspan="4" class="text-center text-muted">
              No hay deuda pendiente
            </td>
          </tr>
        `;
        return;
      }

      const html = debtItems.map((item, index) => {
        const fecha = item.fecha
          ? new Date(item.fecha).toLocaleDateString("es-MX", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : "—";

        return `
          <tr>
            <td>
              <input 
                type="checkbox" 
                class="debt-checkbox" 
                data-index="${index}"
                ${item.selected ? "checked" : ""}
                style="cursor: pointer;"
              />
            </td>
            <td>${item.concepto}</td>
            <td>${fecha}</td>
            <td class="text-end fw-bold">${formatCurrency(item.monto)}</td>
          </tr>
        `;
      }).join("");

      debtsTableBody.innerHTML = html;

      // Agregar event listeners a los checkboxes
      debtsTableBody.querySelectorAll(".debt-checkbox").forEach(checkbox => {
        checkbox.addEventListener("change", handleDebtCheckboxChange);
      });

      updateSelectAllCheckbox();
      calculateTotalAmount();
    }

    function handleDebtCheckboxChange(event) {
      const index = parseInt(event.target.getAttribute("data-index"), 10);
      if (debtItems[index]) {
        debtItems[index].selected = event.target.checked;
        updateSelectAllCheckbox();
        calculateTotalAmount();
      }
    }

    function updateSelectAllCheckbox() {
      if (!selectAllDebts || debtItems.length === 0) return;

      const allSelected = debtItems.every(item => item.selected);
      const someSelected = debtItems.some(item => item.selected);

      selectAllDebts.checked = allSelected;
      selectAllDebts.indeterminate = someSelected && !allSelected;
    }

    function calculateTotalAmount() {
      if (!montoAPagarInput) return;

      const total = debtItems
        .filter(item => item.selected)
        .reduce((sum, item) => sum + item.monto, 0);

      montoAPagarInput.value = total.toFixed(2);
    }

    // Event listener para "Seleccionar todo"
    selectAllDebts?.addEventListener("change", (event) => {
      const checked = event.target.checked;
      debtItems.forEach(item => {
        item.selected = checked;
      });
      renderDebtsTable();
    });

    // Permitir edición manual del monto
    montoAPagarInput?.addEventListener("input", () => {
      // El usuario puede editar manualmente para abonos parciales
      // No hacemos nada especial aquí, solo permitimos la edición
    });

    async function abrirModalPago() {
      if (modalPagoCredito) {
        modalPagoCredito.style.display = "flex";
        modalPagoCredito.classList.add("show");
        document.body.style.overflow = "hidden";
        
        // Cargar deuda pendiente al abrir el modal
        await cargarDeudaPendiente();
        
        // Inicializar file upload manager si no existe
        if (!fileUploadManager) {
          try {
            fileUploadManager = new FileUploadManager("comprobanteTransferencia", {
              maxFiles: 5,
              maxSizeMB: 8,
              acceptedTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"],
              showPreviews: true,
              previewContainerId: "comprobantesPreviews",
              allowMultiple: true,
              onFilesChange: (files) => {
                console.log(`📎 ${files.length} archivo(s) seleccionado(s)`);
              }
            });
          } catch (error) {
            console.warn("FileUploadManager no disponible:", error);
          }
        }
      }
    }

    function cerrarModalPago() {
      if (modalPagoCredito) {
        modalPagoCredito.style.display = "none";
        modalPagoCredito.classList.remove("show");
        document.body.style.overflow = "";
      }
    }

    // Manejar selección de método de pago
    function handlePaymentMethodSelection() {
      paymentCards.forEach((card) => {
        card.addEventListener("click", () => {
          // Remover selección de todas las tarjetas
          paymentCards.forEach((c) => c.classList.remove("selected"));
          
          // Seleccionar la tarjeta clickeada
          card.classList.add("selected");
          
          // Marcar el radio button
          const radio = card.querySelector('input[type="radio"]');
          if (radio) {
            radio.checked = true;
            metodoPagoSeleccionado = radio.value;
          }

          // Mostrar/ocultar paneles de información
          const infoMercadoPago = document.getElementById("info-mercadopago-pago");
          const infoTransferencia = document.getElementById("info-transferencia-pago");

          if (metodoPagoSeleccionado === "mercadopago") {
            if (infoMercadoPago) infoMercadoPago.style.display = "block";
            if (infoTransferencia) infoTransferencia.style.display = "none";
          } else if (metodoPagoSeleccionado === "transferencia") {
            if (infoMercadoPago) infoMercadoPago.style.display = "none";
            if (infoTransferencia) infoTransferencia.style.display = "block";
          }
        });
      });
    }

    // Procesar el pago
    async function procesarPagoCredito() {
      // Validar que haya un monto a pagar
      const montoPagar = parseFloat(montoAPagarInput?.value || 0);
      if (!montoPagar || montoPagar <= 0) {
        await Swal.fire({
          icon: "warning",
          title: "Monto inválido",
          text: "Selecciona al menos una deuda o ingresa un monto válido.",
          confirmButtonColor: "#F97316",
        });
        return;
      }

      console.log(`✅ Procesando pago de ${formatCurrency(montoPagar)} con método: ${metodoPagoSeleccionado}`);
      
      if (metodoPagoSeleccionado === "mercadopago") {
        console.log("💳 Procesando pago con Mercado Pago...");
        // TODO: Integrar con API de Mercado Pago
        await Swal.fire({
          icon: "info",
          title: "Función en desarrollo",
          text: "La integración con Mercado Pago estará disponible próximamente.",
          confirmButtonColor: "#F97316",
        });
      } else if (metodoPagoSeleccionado === "transferencia") {
        console.log("🏦 Procesando pago con transferencia bancaria...");
        
        // Validar que haya comprobantes
        if (fileUploadManager && !fileUploadManager.hasFiles()) {
          await Swal.fire({
            icon: "warning",
            title: "Comprobante requerido",
            text: "Por favor adjunta al menos un comprobante de transferencia.",
            confirmButtonColor: "#F97316",
          });
          return;
        }

        // Obtener items seleccionados
        const selectedDebts = debtItems.filter(item => item.selected);
        const debtIds = selectedDebts.map(item => item.id);

        console.log("📋 Deudas seleccionadas:", debtIds);
        console.log("💰 Monto a pagar:", montoPagar);
        console.log("📎 Archivos adjuntos:", fileUploadManager?.getFileCount() || 0);

        // TODO: Enviar comprobante y datos al backend
        // const formData = new FormData();
        // formData.append('monto', montoPagar);
        // formData.append('debtIds', JSON.stringify(debtIds));
        // if (fileUploadManager) {
        //   const files = fileUploadManager.getFiles();
        //   files.forEach((file, index) => {
        //     formData.append(`comprobante_${index}`, file);
        //   });
        // }

        await Swal.fire({
          icon: "success",
          title: "Comprobante recibido",
          html: `
            <p>Tu pago de <strong>${formatCurrency(montoPagar)}</strong> será verificado en las próximas 24 horas.</p>
            <p style="margin-top: 1rem; color: #6b7280; font-size: 0.9rem;">
              ${selectedDebts.length > 0 ? `Aplicado a ${selectedDebts.length} concepto(s)` : "Abono a cuenta"}
            </p>
          `,
          confirmButtonColor: "#F97316",
        });
        
        // Limpiar y cerrar
        if (fileUploadManager) {
          fileUploadManager.clear();
        }
        debtItems.forEach(item => item.selected = false);
        cerrarModalPago();
        
        // Recargar datos
        loadCredito();
      }
    }

    // Event listeners
    payButton?.addEventListener("click", () => {
      abrirModalPago();
    });

    btnCerrarModalPago?.addEventListener("click", cerrarModalPago);
    btnCancelarPago?.addEventListener("click", cerrarModalPago);
    btnConfirmarPago?.addEventListener("click", procesarPagoCredito);

    // Cerrar modal al hacer click fuera
    modalPagoCredito?.addEventListener("click", (event) => {
      if (event.target === modalPagoCredito) {
        cerrarModalPago();
      }
    });

    // Inicializar selección de métodos de pago
    handlePaymentMethodSelection();

    // ========================================
    // FIN FUNCIONES MODAL DE PAGO
    // ========================================

    loadCredito();
  });
})();
