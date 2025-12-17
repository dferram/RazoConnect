(function () {
  "use strict";

  const el = {
    proveedorNombre: document.getElementById("proveedorNombre"),
    proveedorSub: document.getElementById("proveedorSub"),

    kpiSaldo: document.getElementById("kpiSaldo"),
    kpiPagado: document.getElementById("kpiPagado"),
    kpiTotal: document.getElementById("kpiTotal"),

    btnRefresh: document.getElementById("btnRefresh"),

    movBadge: document.getElementById("movBadge"),
    loadingState: document.getElementById("loadingState"),
    emptyState: document.getElementById("emptyState"),
    timeline: document.getElementById("timeline"),
  };

  const state = {
    proveedorId: null,
    proveedor: null,
    resumen: { total: 0, pagado: 0, saldo: 0 },
    cuentas: [],
    movimientos: [],
  };

  const safeText = (value) => (value == null ? "" : String(value));

  const formatMoney = (value) => {
    const n = Number.parseFloat(value);
    const v = Number.isFinite(n) ? n : 0;
    return v.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    });
  };

  const fmtDate = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  };

  const setLoading = (isLoading) => {
    if (el.loadingState) el.loadingState.style.display = isLoading ? "flex" : "none";
  };

  const setEmpty = (show, text) => {
    if (el.emptyState) {
      el.emptyState.style.display = show ? "block" : "none";
      if (text) el.emptyState.textContent = text;
    }
    if (el.timeline) {
      el.timeline.style.display = show ? "none" : "grid";
    }
  };

  const getCuentaByCxpId = (cxpId) => {
    const list = Array.isArray(state.cuentas) ? state.cuentas : [];
    const id = Number.parseInt(cxpId, 10);
    return list.find((c) => Number.parseInt(c.cxpId, 10) === id) || null;
  };

  const showProductosCargo = async (cxpId) => {
    const id = Number.parseInt(cxpId, 10);
    if (!Number.isInteger(id) || id <= 0) return;

    try {
      const resp = await apiCall(`/admin/estado-cuenta/cxp/${encodeURIComponent(id)}/productos`, {
        method: "GET",
      });
      if (!resp.ok) {
        throw new Error(resp.data?.message || "No se pudieron cargar productos");
      }

      const productos = Array.isArray(resp.data?.data?.productos) ? resp.data.data.productos : [];

      let htmlTabla = `
        <div style="overflow-x:auto; border: 1px solid rgba(0,0,0,0.08); border-radius: 0.75rem;">
          <table style="width:100%; border-collapse: collapse; min-width: 680px;" class="table table-sm text-start">
            <thead>
              <tr style="background:#f8fafc; text-align:left;">
                <th style="padding: 0.55rem 0.6rem;">Producto</th>
                <th style="padding: 0.55rem 0.6rem;">SKU</th>
                <th style="padding: 0.55rem 0.6rem; text-align:right;">Piezas</th>
                <th style="padding: 0.55rem 0.6rem; text-align:right;">Paquetes</th>
              </tr>
            </thead>
            <tbody>
      `;

      if (productos.length === 0) {
        htmlTabla += `
          <tr>
            <td colspan="4" style="padding: 0.85rem; text-align:center; color:#6b7280;">
              No hay detalle de productos para esta recepción antigua.
            </td>
          </tr>
        `;
      } else {
        productos.forEach((prod) => {
          const piezas = Number.parseInt(prod.piezas ?? 0, 10) || 0;
          const paquetes = Number.parseFloat(prod.paquetes ?? 0) || 0;
          htmlTabla += `
            <tr>
              <td style="padding: 0.45rem 0.6rem; border-bottom: 1px solid rgba(0,0,0,0.06);">
                ${safeText(prod.nombreproducto)}
              </td>
              <td style="padding: 0.45rem 0.6rem; border-bottom: 1px solid rgba(0,0,0,0.06); white-space:nowrap;">
                <small>${safeText(prod.sku)}</small>
              </td>
              <td style="padding: 0.45rem 0.6rem; border-bottom: 1px solid rgba(0,0,0,0.06); text-align:right; white-space:nowrap;">
                ${piezas.toLocaleString("es-MX")}
              </td>
              <td style="padding: 0.45rem 0.6rem; border-bottom: 1px solid rgba(0,0,0,0.06); text-align:right; white-space:nowrap;">
                ${paquetes.toLocaleString("es-MX", { maximumFractionDigits: 2 })}
              </td>
            </tr>
          `;
        });
      }

      htmlTabla += `
            </tbody>
          </table>
        </div>
      `;

      const html = `
        <div style="text-align:left;">
          <div style="display:flex; justify-content: space-between; align-items:center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
            <div style="font-weight: 900; color:#111827;">Productos recibidos</div>
            <div style="color:#6b7280; font-size: 0.85rem;">CxP #${id}</div>
          </div>
          ${htmlTabla}
        </div>
      `;

      await Swal.fire({
        title: "Cargo (Recepción)",
        html,
        width: "1200px",
        confirmButtonText: "Cerrar",
        confirmButtonColor: "#F97316",
        buttonsStyling: false,
        customClass: {
          popup: "rc-swal-popup",
          title: "rc-swal-title",
          htmlContainer: "rc-swal-html",
          actions: "rc-swal-actions",
          confirmButton: "btn btn-primary rc-swal-btn",
        },
      });
    } catch (error) {
      console.error(error);
      if (typeof Swal !== "undefined" && Swal) {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: error.message || "No se pudo cargar",
          confirmButtonColor: "#F97316",
        });
      }
    }
  };

  const openAbonarModal = async () => {
    const proveedorId = Number.parseInt(state.proveedorId, 10);
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) return;

    const cuentas = Array.isArray(state.cuentas) ? state.cuentas : [];
    const cuentasVivas = cuentas.filter((c) => safeText(c.estatus).toUpperCase() !== "PAGADO");

    if (!cuentasVivas.length) {
      Swal.fire({
        icon: "info",
        title: "Sin cargos pendientes",
        text: "Este proveedor no tiene cargos pendientes para abonar.",
        confirmButtonColor: "#F97316",
      });
      return;
    }

    const opts = cuentasVivas
      .map((c) => {
        const label = `CxP #${c.cxpId}${c.ordenCompraId ? ` · OC #${c.ordenCompraId}` : ""} · Pendiente ${formatMoney(
          c.restante
        )}`;
        return `<option value="${safeText(c.cxpId)}">${label}</option>`;
      })
      .join("");

    const resp = await Swal.fire({
      title: "Abonar a la cuenta",
      html: `
        <div class="rc-swal-form">
          <div class="rc-swal-field">
            <label class="rc-swal-label">Selecciona un cargo</label>
            <select id="swalCxp" class="swal2-select rc-swal-control">${opts}</select>
            <div class="rc-swal-help">Selecciona el cargo (CxP) al que quieres aplicar el abono.</div>
          </div>

          <div class="rc-swal-grid">
            <div class="rc-swal-field">
              <label class="rc-swal-label">Monto</label>
              <input id="swalMonto" class="swal2-input rc-swal-control" type="number" min="0" step="0.01" placeholder="0.00" />
            </div>

            <div class="rc-swal-field">
              <label class="rc-swal-label">Referencia / Nota</label>
              <input id="swalRef" class="swal2-input rc-swal-control" placeholder="Ej: Transferencia BBVA #123" />
            </div>
          </div>

          <div class="rc-swal-field">
            <label class="rc-swal-label">Comprobante (opcional)</label>
            <input id="swalFile" type="file" class="swal2-file rc-swal-control" accept="image/*,application/pdf" />
          </div>
        </div>
      `,
      width: "1200px",
      focusConfirm: false,
      showCancelButton: true,
      showCloseButton: true,
      reverseButtons: true,
      confirmButtonText: "Guardar abono",
      cancelButtonText: "Cancelar",
      buttonsStyling: false,
      customClass: {
        popup: "rc-swal-popup",
        title: "rc-swal-title",
        htmlContainer: "rc-swal-html",
        actions: "rc-swal-actions",
        confirmButton: "btn btn-primary rc-swal-btn",
        cancelButton: "btn btn-secondary rc-swal-btn",
      },
      didOpen: () => {
        const montoInput = document.getElementById("swalMonto");
        if (montoInput) montoInput.focus();
      },
      preConfirm: () => {
        const cxpId = document.getElementById("swalCxp")?.value;
        const montoRaw = document.getElementById("swalMonto")?.value;
        const referencia = document.getElementById("swalRef")?.value?.trim() || "";
        const file = document.getElementById("swalFile")?.files?.[0] || null;

        const monto = Number.parseFloat(montoRaw);
        if (!cxpId) {
          Swal.showValidationMessage("Selecciona un cargo");
          return null;
        }
        if (!Number.isFinite(monto) || monto <= 0) {
          Swal.showValidationMessage("Monto inválido");
          return null;
        }

        return { cxpId, monto, referencia, file };
      },
    });

    if (!resp.isConfirmed || !resp.value) return;

    const cxpId = Number.parseInt(resp.value.cxpId, 10);
    if (!Number.isInteger(cxpId) || cxpId <= 0) return;

    const fd = new FormData();
    fd.append("monto", String(resp.value.monto));
    fd.append("referencia", resp.value.referencia || "");
    fd.append("nota", resp.value.referencia || "");
    if (resp.value.file) fd.append("comprobante", resp.value.file);

    try {
      const token = localStorage.getItem("razoconnect_admin_token");
      const res = await fetch(
        `${API_BASE_URL}/admin/cuentas-por-pagar/${encodeURIComponent(cxpId)}/registrar-pago`,
        {
          method: "POST",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: fd,
        }
      );

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "No se pudo registrar abono");
      }

      Swal.fire({
        icon: "success",
        title: "Abono registrado",
        timer: 1400,
        showConfirmButton: false,
      });

      await load();
    } catch (error) {
      console.error(error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.message || "No se pudo registrar",
        confirmButtonColor: "#F97316",
      });
    }
  };

  const render = () => {
    if (el.proveedorNombre) {
      el.proveedorNombre.textContent = safeText(state.proveedor?.proveedorNombre || "Proveedor");
    }
    if (el.proveedorSub) {
      const id = Number.parseInt(state.proveedorId, 10);
      el.proveedorSub.textContent = Number.isInteger(id) ? `Proveedor #${id} · Movimientos` : "Movimientos";
    }

    const total = Number.parseFloat(state.resumen?.total ?? 0) || 0;
    const pagado = Number.parseFloat(state.resumen?.pagado ?? 0) || 0;
    const saldo = Number.parseFloat(state.resumen?.saldo ?? 0) || 0;

    if (el.kpiSaldo) el.kpiSaldo.textContent = formatMoney(saldo);
    if (el.kpiPagado) el.kpiPagado.textContent = formatMoney(pagado);
    if (el.kpiTotal) el.kpiTotal.textContent = formatMoney(total);

    const movimientos = Array.isArray(state.movimientos) ? state.movimientos : [];
    if (el.movBadge) {
      el.movBadge.textContent = `${movimientos.length} MOVIMIENTO${movimientos.length === 1 ? "" : "S"}`;
    }

    if (!el.timeline) return;
    el.timeline.innerHTML = "";

    if (!movimientos.length) {
      setEmpty(true, "No hay movimientos para mostrar.");
    } else {
      setEmpty(false);
      for (const m of movimientos) {
        const tipo = safeText(m.tipo).toLowerCase();
        const isCargo = tipo === "cargo";
        const icon = isCargo ? "📦" : "💵";
        const css = isCargo ? "bank-event bank-event-cargo" : "bank-event bank-event-abono";
        const amount = formatMoney(m.monto);
        const fecha = fmtDate(m.fecha);

        const title = isCargo
          ? `Cargo${m.ordenCompraId ? ` · OC #${safeText(m.ordenCompraId)}` : ""}`
          : `Abono${m.pagoId ? ` · Pago #${safeText(m.pagoId)}` : ""}`;

        const cuenta = getCuentaByCxpId(m.cxpId);
        const estatus = isCargo ? safeText(cuenta?.estatus || m.estatus || "") : "PAGO";

        const chip = isCargo
          ? `<span class="bank-event-chip">CxP #${safeText(m.cxpId)}${estatus ? ` · ${safeText(
              estatus
            ).toUpperCase()}` : ""}</span>`
          : `<span class="bank-event-chip">CxP #${safeText(m.cxpId)} · ${safeText(estatus)}</span>`;

        const ref = safeText(m.referencia);
        const hasRef = Boolean(ref);

        const div = document.createElement("div");
        div.className = css;
        div.innerHTML = `
          <div class="bank-event-top">
            <div class="bank-event-left">
              <div class="bank-event-icon" aria-hidden="true">${icon}</div>
              <div style="min-width:0;">
                <div class="bank-event-title" title="${safeText(title)}">${safeText(title)}</div>
                <div class="bank-event-sub">${fecha}</div>
              </div>
            </div>
            <div class="bank-event-amount">${amount}</div>
          </div>

          <div class="bank-event-foot">
            <div style="display:flex; gap: 0.5rem; align-items:center; flex-wrap: wrap;">${chip}</div>
            <div style="display:flex; gap: 0.5rem; align-items:center; flex-wrap: wrap;">
              ${hasRef ? `<span class="bank-event-chip">${safeText(ref)}</span>` : ""}
              ${m.comprobanteUrl ? `<a href="${safeText(m.comprobanteUrl)}" target="_blank" rel="noopener" class="admin-badge secondary">Ver comprobante</a>` : ""}
            </div>
          </div>
        `;

        if (isCargo) {
          div.addEventListener("click", () => showProductosCargo(m.cxpId));
        }

        el.timeline.appendChild(div);
      }
    }

  };

  const load = async () => {
    setLoading(true);
    try {
      const proveedorId = Number.parseInt(state.proveedorId, 10);
      if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
        throw new Error("proveedorId inválido");
      }

      const resp = await apiCall(
        `/admin/estado-cuenta/proveedores/${encodeURIComponent(proveedorId)}/movimientos`,
        { method: "GET" }
      );

      if (!resp.ok) {
        throw new Error(resp.data?.message || "No se pudo cargar estado de cuenta");
      }

      state.proveedor = resp.data?.data?.proveedor || null;
      state.resumen = resp.data?.data?.resumen || { total: 0, pagado: 0, saldo: 0 };
      state.cuentas = Array.isArray(resp.data?.data?.cuentas) ? resp.data.data.cuentas : [];
      state.movimientos = Array.isArray(resp.data?.data?.movimientos) ? resp.data.data.movimientos : [];

      render();
    } catch (error) {
      console.error(error);
      setEmpty(true, error.message || "Error cargando movimientos");
      if (typeof Swal !== "undefined" && Swal) {
        Swal.fire({
          icon: "error",
          title: "Error",
          text: error.message || "No se pudo cargar",
          confirmButtonColor: "#F97316",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const init = () => {
    const params = new URLSearchParams(window.location.search);
    state.proveedorId = Number.parseInt(params.get("proveedorId"), 10);

    if (el.btnRefresh) el.btnRefresh.addEventListener("click", load);

    load();
  };

  init();
})();
