(function () {
  "use strict";

  // Validación crítica: Verificar que API esté disponible
  if (typeof API === 'undefined') {
    console.error('❌ [AGENTE-DASHBOARD] Error crítico: api.js no se cargó correctamente');
    return;
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!requireAgentAuth()) {
      return;
    }

    window.irADetallePedidoAgente = function (pedidoId) {
      if (!pedidoId) return;
      sessionStorage.setItem("_navigating", "true");
      localStorage.setItem("_nav_timestamp", Date.now().toString());
      window.location.href = `/agente-pedido-detalle.html?id=${pedidoId}`;
    };

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
      const value = (estatus || "").toString().toLowerCase().trim();

      // NUEVOS ESTADOS NORMALIZADOS (Sistema de 6 estados - Surtido Parcial ELIMINADO)
      if (value === "pendiente") return "pedido-estatus-badge pendiente";
      if (value === "bajo pedido") return "pedido-estatus-badge danger";           // 🔴 Rojo
      if (value === "combinado") return "pedido-estatus-badge warning";           // 🟠 Naranja
      if (value === "completo") return "pedido-estatus-badge warning";            // 🟡 Amarillo
      if (value === "listo para remisionar") return "pedido-estatus-badge primary"; // 🔵 Azul
      if (value === "surtido completo") return "pedido-estatus-badge success";    // 🟢 Verde
      // LEGACY - Mapear viejo Surtido Parcial a warning
      if (value === "surtido parcial" || value === "parcialmente surtido" || value === "parcialmente_surtido") return "pedido-estatus-badge warning";
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

          const estatusLower = (pedido.estatus || "").toString().toLowerCase();
          const puedeSolicitarCambio = [
            "pendiente",
            "confirmado",
            "validado",
          ].includes(estatusLower);

          return `
            <tr style="cursor:pointer;" onclick="irADetallePedidoAgente(${pedido.pedidoId})">
              <td>${pedido.numeroPedido || `#${pedido.pedidoId}`}</td>
              <td>${clienteNombre}</td>
              <td>${formatDate(pedido.fechaPedido)}</td>
              <td>${formatCurrency(pedido.montoTotal)}</td>
              <td>
                ${renderStatusSelector(pedido)}
              </td>
              <td>
                <div style="display:flex; align-items:center; justify-content:center;">
                  ${
                    puedeSolicitarCambio
                      ? `<button
                          type="button"
                          class="btn btn-outline-primary btn-sm"
                          data-pedido-id="${pedido.pedidoId}"
                          data-estatus="${pedido.estatus || ""}"
                          data-cliente="${clienteNombre.replace(/"/g, "&quot;")}"
                          onclick="event.stopPropagation(); abrirModalStatusDesdeBoton(this)"
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

      pedidosBody
        .querySelectorAll(".pedido-estatus-select")
        .forEach((select) => applyStatusSelectStyle(select));
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
              "⚠️ Se enviará una solicitud al administrador. Si se aprueba, se devolverán los productos al inventario y se notificará al cliente.",
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
              "⚠️ Se enviará una solicitud al administrador para actualizar el estatus y notificar al cliente.",
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

        loadDashboard();
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

    refrescarBtn?.addEventListener("click", loadDashboard);

    updateUserHeader();
    loadDashboard();
  });
})();
