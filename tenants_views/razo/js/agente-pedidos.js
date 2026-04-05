(function () {
  "use strict";

  // Validación crítica: Verificar que API esté disponible
  if (typeof API === 'undefined') {
    console.error('[AGENTE-PEDIDOS] Error crítico: api.js no se cargó correctamente');
    return;
  }

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
      const value = (estatus || "").toString().toLowerCase().trim();

      // NUEVOS ESTADOS NORMALIZADOS (Sistema de 6 estados)
      if (value === "pendiente") return "pedido-estatus-badge pendiente";
      if (value === "bajo pedido") return "pedido-estatus-badge danger";           // 🔴 Rojo
      if (value === "combinado") return "pedido-estatus-badge warning";           // 🟠 Naranja
      if (value === "completo") return "pedido-estatus-badge warning";            // 🟡 Amarillo
      if (value === "listo para remisionar") return "pedido-estatus-badge primary"; // 🔵 Azul
      if (value === "surtido parcial" || value === "parcialmente surtido" || value === "parcialmente_surtido") return "pedido-estatus-badge warning"; // 🟠 Naranja
      if (value === "surtido completo") return "pedido-estatus-badge success";    // 🟢 Verde
      // LEGACY
      if (value === "confirmado" || value === "surtido") return "pedido-estatus-badge confirmado";
      if (
        value === "enviado" ||
        value === "en ruta" ||
        value === "en_ruta" ||
        value === "en-ruta"
      ) {
        return "pedido-estatus-badge enviado";
      }
      if (value === "entregado" || value === "completado") return "pedido-estatus-badge entregado";
      if (value === "cancelado") return "pedido-estatus-badge cancelado";

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
      const badgeClass = getPedidoStatusBadgeClass(estatus);
      return `<span class="${badgeClass}">${estatus || "Desconocido"}</span>`;
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

          const estatusLower = (pedido.estatus || "").toString().toLowerCase();
          const puedeSolicitarCambio = [
            "pendiente",
            "confirmado",
            "validado",
          ].includes(estatusLower);

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
                <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
                  <button
                    type="button"
                    class="btn btn-primary btn-sm btn-detalle"
                    data-pedido-id="${pedido.pedidoId}"
                  >
                    Ver detalle
                  </button>
                  ${
                    (pedido.estatus === 'Surtido' || pedido.estatus === 'Enviado' || pedido.estatus === 'Entregado')
                      ? `
                      <button
                        class="btn"
                        style="padding: 0.5rem 1rem; font-size: 0.875rem; background: #dc2626; color: white; border: 2px solid #991b1b;"
                        onclick="descargarFacturaAgente(${pedido.pedidoId})"
                        title="Generar factura PDF">
                        🧾 Generar Factura
                      </button>
                      `
                      : ""
                  }
                  ${
                    puedeSolicitarCambio
                      ? `<button
                          type="button"
                          class="btn btn-outline-primary btn-sm"
                          data-pedido-id="${pedido.pedidoId}"
                          data-estatus="${pedido.estatus || ""}"
                          data-cliente="${clienteNombre.replace(/"/g, "&quot;")}"
                          onclick="abrirModalStatusDesdeBoton(this)"
                        >
                          Cambiar Estatus
                        </button>`
                      : ""
                  }
                </div>
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
      if (btn) {
        const pedidoId = btn.dataset.pedidoId;
        // Marcar que es navegación interna para evitar limpieza de tokens
        sessionStorage.setItem("_navigating", "true");
        localStorage.setItem("_nav_timestamp", Date.now().toString());
        window.location.href = `/agente-pedido-detalle.html?id=${pedidoId}`;
        return;
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

    tabGroup?.addEventListener("click", handleTabClick);
    pedidosBody?.addEventListener("click", handleTableClick);
    pedidosBody?.addEventListener("change", handleTableClick);
    refrescarBtn?.addEventListener("click", loadPedidos);
    logoutBtn?.addEventListener("click", handleLogout);

    // Lógica de modal de cambio de estatus (solicitud al admin)
    let selectedPedidoForStatus = null;

    function mostrarModalStatusAgente() {
      const modalEl = document.getElementById("modalStatusAgente");
      if (!modalEl) return;
      modalEl.style.display = "flex";
    }

    window.cerrarModalStatusAgente = function () {
      const modalEl = document.getElementById("modalStatusAgente");
      if (!modalEl) return;
      modalEl.style.display = "none";
    };

    (function initModalStatusAgenteInteractions() {
      const modalEl = document.getElementById("modalStatusAgente");
      if (!modalEl) return;

      modalEl.addEventListener("click", function (event) {
        if (event.target === modalEl) {
          cerrarModalStatusAgente();
        }
      });

      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" || event.key === "Esc") {
          if (modalEl.style.display === "flex") {
            cerrarModalStatusAgente();
          }
        }
      });
    })();

    window.abrirModalStatus = function (
      pedidoId,
      estatusActual,
      clienteNombre
    ) {
      const idNum = parseInt(pedidoId, 10);
      if (!idNum || Number.isNaN(idNum)) {
        showToast("No se pudo identificar el pedido seleccionado.", "error");
        return;
      }

      selectedPedidoForStatus = {
        id: idNum,
        estatusActual: estatusActual || "",
        cliente: clienteNombre || "Cliente",
      };

      const idEl = document.getElementById("modalPedidoId");
      if (idEl) {
        idEl.textContent = idNum;
      }

      const clienteEl = document.getElementById("modalClienteNombre");
      if (clienteEl) {
        clienteEl.textContent = selectedPedidoForStatus.cliente;
      }

      const selectEl = document.getElementById("selectNuevoEstatus");
      if (selectEl) {
        const opciones = Array.from(selectEl.options || []);
        const estatusLower = (estatusActual || "").toString().toLowerCase();

        const esPendiente = estatusLower === "pendiente";
        const esConfirmado = ["confirmado", "validado"].includes(
          estatusLower
        );

        opciones.forEach((opt) => {
          const valueLower = (opt.value || "").toString().toLowerCase();

          // Por defecto mostrar todas
          opt.disabled = false;
          opt.hidden = false;

          if (esPendiente) {
            // Pendiente: puede elegir Confirmado o Cancelado
            return;
          }

          if (esConfirmado) {
            // Confirmado/Validado: solo permitir Cancelado
            if (valueLower === "confirmado") {
              opt.disabled = true;
              opt.hidden = true;
            }
            if (valueLower === "cancelado") {
              opt.disabled = false;
              opt.hidden = false;
            }
          }
        });

        if (esPendiente) {
          selectEl.value = "Confirmado";
        } else if (esConfirmado) {
          selectEl.value = "Cancelado";
        } else {
          // Fallback: seleccionar primera opción visible
          const primeraVisible = opciones.find(
            (opt) => !opt.disabled && !opt.hidden
          );
          if (primeraVisible) {
            selectEl.value = primeraVisible.value;
          }
        }
      }

      mostrarModalStatusAgente();
    };

    window.abrirModalStatusDesdeBoton = function (button) {
      if (!button) return;
      const pedidoId = button.getAttribute("data-pedido-id");
      const estatus = button.getAttribute("data-estatus") || "";
      const cliente = button.getAttribute("data-cliente") || "Cliente";
      window.abrirModalStatus(pedidoId, estatus, cliente);
    };

    window.enviarSolicitudEstatus = async function () {
      if (!selectedPedidoForStatus || !selectedPedidoForStatus.id) {
        showToast("No hay un pedido seleccionado para actualizar.", "error");
        return;
      }

      const selectEl = document.getElementById("selectNuevoEstatus");
      if (!selectEl) {
        showToast("No se encontró el selector de estatus.", "error");
        return;
      }

      const nuevoEstatus = selectEl.value;
      if (!nuevoEstatus) {
        showToast("Selecciona un nuevo estatus.", "warning");
        return;
      }

      const nuevoLower = (nuevoEstatus || "").toString().toLowerCase();
      const estatusActual =
        (selectedPedidoForStatus.estatusActual || "").toString();
      const actualLower = estatusActual.toLowerCase();

      let swalConfig = null;
      let fallbackMessage =
        "¿Deseas enviar la solicitud de cambio de estatus al administrador?";

      if (
        typeof Swal !== "undefined" &&
        Swal &&
        typeof Swal.fire === "function"
      ) {
        if (nuevoLower === "cancelado") {
          swalConfig = {
            icon: "warning",
            title: "¿Solicitar cancelación?",
            text:
              "Se enviará una solicitud al administrador. Si se aprueba, se devolverán los productos al inventario y se notificará al cliente.",
            showCancelButton: true,
            confirmButtonText: "Sí, solicitar cancelación",
            cancelButtonText: "No, mantener pedido",
            confirmButtonColor: "#dc3545",
            cancelButtonColor: "#6b7280",
          };
          fallbackMessage = swalConfig.text;
        } else {
          swalConfig = {
            icon: "question",
            title: "¿Solicitar actualización?",
            text:
              "Se enviará una solicitud al administrador para actualizar el estatus y notificar al cliente.",
            showCancelButton: true,
            confirmButtonText: "Sí, enviar solicitud",
            cancelButtonText: "Cancelar",
            confirmButtonColor: "#F97316",
            cancelButtonColor: "#6b7280",
          };
          fallbackMessage = swalConfig.text;
        }

        const result = await Swal.fire(swalConfig);
        if (!result.isConfirmed) {
          return;
        }
      } else {
        const confirmed = window.confirm(fallbackMessage);
        if (!confirmed) {
          return;
        }
      }

      try {
        const response = await API.solicitarCambioEstatusPedidoAgente(
          selectedPedidoForStatus.id,
          nuevoEstatus
        );

        if (!response.ok || !response.data?.success) {
          throw new Error(
            response.data?.message ||
              "No fue posible registrar la solicitud de cambio de estatus"
          );
        }

        cerrarModalStatusAgente();
        selectedPedidoForStatus = null;

        const mensaje =
          response.data.message ||
          "Solicitud registrada. El administrador revisará el cambio.";

        if (
          typeof Swal !== "undefined" &&
          Swal &&
          typeof Swal.fire === "function"
        ) {
          await Swal.fire({
            icon: "success",
            title: "Solicitud enviada",
            text: mensaje,
            confirmButtonColor: "#F97316",
          });
        } else {
          showToast(mensaje, "success");
        }

        loadPedidos();
      } catch (error) {
        console.error(
          "Error al registrar solicitud de cambio de estatus del pedido:",
          error
        );

        if (
          typeof Swal !== "undefined" &&
          Swal &&
          typeof Swal.fire === "function"
        ) {
          Swal.fire({
            icon: "error",
            title: "No se pudo registrar la solicitud",
            text:
              error.message ||
              "Ocurrió un error al enviar la solicitud de cambio de estatus.",
            confirmButtonColor: "#F97316",
          });
        } else {
          showToast(
            error.message ||
              "Ocurrió un error al enviar la solicitud de cambio de estatus.",
            "error"
          );
        }
      }
    };

    // Función global para descargar factura
    window.descargarFacturaAgente = async function(pedidoId) {
      const token = localStorage.getItem('razoconnect_agente_token');
      if (!token) {
        showToast('Debes iniciar sesión para descargar la factura', 'error');
        return;
      }

      // Mostrar alerta sobre el IVA
      if (typeof Swal !== 'undefined' && Swal && typeof Swal.fire === 'function') {
        const result = await Swal.fire({
          icon: 'info',
          title: 'Información sobre la Factura',
          html: `
            <div style="text-align: left;">
              <p><strong>Importante:</strong></p>
              <ul style="margin-left: 1rem;">
                <li>Esta factura incluye el <strong>IVA (16%)</strong> aplicable.</li>
                <li>Es un documento interno para control administrativo.</li>
                <li><strong>No es un CFDI fiscal válido</strong> ante el SAT.</li>
              </ul>
              <p style="margin-top: 1rem;">¿Deseas continuar con la descarga?</p>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: 'Sí, descargar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#dc2626',
          cancelButtonColor: '#6b7280'
        });

        if (!result.isConfirmed) {
          return;
        }
      }

      // Obtener botón y mostrar loading
      const botonDescarga = event?.target?.closest('button');
      let restoreButton = null;
      if (botonDescarga && typeof UI !== 'undefined' && UI && typeof UI.setButtonLoading === 'function') {
        restoreButton = UI.setButtonLoading(botonDescarga, 'Descargando...');
      }

      try {
        const response = await fetch(`/api/pedidos/${pedidoId}/factura`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Error al generar la factura');
          } else {
            throw new Error(`Error del servidor: ${response.status}`);
          }
        }

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Factura-Pedido-${pedidoId}.pdf`;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
        
        showToast('Factura descargada correctamente', 'success');
      } catch (error) {
        console.error('Error al descargar factura:', error);
        showToast(error.message || 'Error al generar la factura', 'error');
      } finally {
        if (restoreButton) restoreButton();
      }
    };

    loadPedidos();
  }
})();
