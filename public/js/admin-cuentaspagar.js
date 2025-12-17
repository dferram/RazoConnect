(function () {
  "use strict";

  const el = {
    btnRefresh: document.getElementById("btnRefresh"),
    filtroEstatus: document.getElementById("filtroEstatus"),

    loadingState: document.getElementById("loadingState"),
    emptyState: document.getElementById("emptyState"),
    cxpTable: document.getElementById("cxpTable"),
    cxpTbody: document.getElementById("cxpTbody"),
    resultadosBadge: document.getElementById("resultadosBadge"),

    kpiTotalPorPagar: document.getElementById("kpiTotalPorPagar"),
    kpiVencido: document.getElementById("kpiVencido"),
    kpiProximo: document.getElementById("kpiProximo"),

    pagoModal: document.getElementById("pagoModal"),
    btnCerrarModal: document.getElementById("btnCerrarModal"),
    btnCancelarPago: document.getElementById("btnCancelarPago"),
    btnGuardarPago: document.getElementById("btnGuardarPago"),
    btnGuardarPagoText: document.getElementById("btnGuardarPagoText"),
    btnGuardarPagoSpinner: document.getElementById("btnGuardarPagoSpinner"),

    pagoDeudaActual: document.getElementById("pagoDeudaActual"),
    pagoMonto: document.getElementById("pagoMonto"),
    pagoReferencia: document.getElementById("pagoReferencia"),
    pagoComprobante: document.getElementById("pagoComprobante"),
  };

  const state = {
    cuentas: [],
    cuentaSeleccionada: null,
  };

  const formatMoney = (value) => {
    const n = Number.parseFloat(value);
    const v = Number.isFinite(n) ? n : 0;
    return v.toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
    });
  };

  const safeText = (value) => (value == null ? "" : String(value));

  const parseDateOnly = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const daysDiff = (a, b) => {
    if (!a || !b) return null;
    const ms = 24 * 60 * 60 * 1000;
    return Math.floor((a.getTime() - b.getTime()) / ms);
  };

  const getDueSeverity = (fechaVencimiento) => {
    const due = parseDateOnly(fechaVencimiento);
    if (!due) {
      return { badge: "secondary", label: "Sin vencimiento", isOverdue: false, isSoon: false };
    }

    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diff = daysDiff(due, todayOnly);

    if (diff < 0) {
      return { badge: "danger", label: "Vencido", isOverdue: true, isSoon: false };
    }

    if (diff <= 7) {
      return { badge: "warning", label: "Próximo", isOverdue: false, isSoon: true };
    }

    return { badge: "success", label: "Al día", isOverdue: false, isSoon: false };
  };

  const setLoading = (isLoading) => {
    if (!el.loadingState || !el.emptyState || !el.cxpTable) return;
    el.loadingState.style.display = isLoading ? "flex" : "none";
  };

  const setEmpty = (show, text) => {
    if (!el.emptyState || !el.cxpTable) return;
    el.emptyState.style.display = show ? "block" : "none";
    if (text) el.emptyState.textContent = text;
    el.cxpTable.style.display = show ? "none" : "table";
  };

  const showToastOk = (title) => {
    if (typeof Swal === "undefined" || !Swal) return;
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "success",
      title: title || "Listo",
      showConfirmButton: false,
      timer: 1400,
      timerProgressBar: true,
    });
  };

  const showToastError = (title) => {
    if (typeof Swal === "undefined" || !Swal) return;
    Swal.fire({
      toast: true,
      position: "top-end",
      icon: "error",
      title: title || "Error",
      showConfirmButton: false,
      timer: 2200,
      timerProgressBar: true,
    });
  };

  const openPagoModal = (cuenta) => {
    state.cuentaSeleccionada = cuenta;

    if (el.pagoDeudaActual) {
      el.pagoDeudaActual.textContent = formatMoney(cuenta?.restante ?? 0);
    }

    if (el.pagoMonto) {
      el.pagoMonto.value = "";
      el.pagoMonto.max = String(Number.parseFloat(cuenta?.restante ?? 0) || "");
    }

    if (el.pagoReferencia) {
      el.pagoReferencia.value = "";
    }

    if (el.pagoComprobante) {
      el.pagoComprobante.value = "";
    }

    if (el.pagoModal) {
      el.pagoModal.style.display = "flex";
    }
  };

  const closePagoModal = () => {
    state.cuentaSeleccionada = null;
    if (el.pagoModal) {
      el.pagoModal.style.display = "none";
    }
  };

  const renderKPIs = (cuentas) => {
    const today = new Date();
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let totalPorPagar = 0;
    let vencido = 0;
    let proximo = 0;

    for (const c of cuentas) {
      const estatus = safeText(c.estatus).toUpperCase();
      if (estatus === "PAGADO") continue;

      const restante = Number.parseFloat(c.restante ?? 0) || 0;
      totalPorPagar += restante;

      const due = parseDateOnly(c.fechaVencimiento);
      if (!due) continue;

      const diff = daysDiff(due, todayOnly);
      if (diff < 0) {
        vencido += restante;
      } else if (diff <= 7) {
        proximo += restante;
      }
    }

    if (el.kpiTotalPorPagar) el.kpiTotalPorPagar.textContent = formatMoney(totalPorPagar);
    if (el.kpiVencido) el.kpiVencido.textContent = formatMoney(vencido);
    if (el.kpiProximo) el.kpiProximo.textContent = formatMoney(proximo);
  };

  const renderTable = (cuentas) => {
    if (!el.cxpTbody || !el.cxpTable || !el.resultadosBadge) return;

    el.cxpTbody.innerHTML = "";
    el.resultadosBadge.textContent = `${cuentas.length} CUENTA${cuentas.length === 1 ? "" : "S"}`;

    if (!cuentas.length) {
      setEmpty(true, "No hay cuentas por pagar para mostrar.");
      return;
    }

    setEmpty(false);

    for (const c of cuentas) {
      const tr = document.createElement("tr");

      const tdProv = document.createElement("td");
      tdProv.innerHTML = `
        <div style="display:flex; align-items:center; gap: 0.6rem;">
          <div style="width: 34px; height: 34px; border-radius: 0.75rem; background: rgba(249, 115, 22, 0.12); display:flex; align-items:center; justify-content:center; font-weight: 900; color:#9a3412;">🏭</div>
          <div style="display:grid; gap: 0.15rem;">
            <div style="font-weight: 800; color: #111827;">${safeText(c.proveedorNombre)}</div>
            <div style="font-size: 0.85rem; color: #6b7280;">Proveedor #${safeText(c.proveedorId)}</div>
          </div>
        </div>
      `;

      const tdOc = document.createElement("td");
      tdOc.innerHTML = c.ordenCompraId ? `<strong>#${safeText(c.ordenCompraId)}</strong>` : "—";

      const tdEmi = document.createElement("td");
      tdEmi.textContent = c.fechaEmision
        ? new Date(c.fechaEmision).toLocaleDateString("es-MX")
        : "—";

      const tdVenc = document.createElement("td");
      const severity = getDueSeverity(c.fechaVencimiento);
      const vencText = c.fechaVencimiento
        ? new Date(c.fechaVencimiento).toLocaleDateString("es-MX")
        : "—";
      tdVenc.innerHTML = `
        <div style="display:grid; gap: 0.25rem;">
          <div style="font-weight: 800; color: ${severity.isOverdue ? "#ef4444" : "#111827"};">${vencText}</div>
          <div><span class="admin-badge ${severity.badge}">${severity.label}</span></div>
        </div>
      `;

      const tdTotal = document.createElement("td");
      tdTotal.style.textAlign = "right";
      tdTotal.style.whiteSpace = "nowrap";
      tdTotal.textContent = formatMoney(c.montoTotal);

      const tdRest = document.createElement("td");
      tdRest.style.textAlign = "right";
      tdRest.style.whiteSpace = "nowrap";
      tdRest.innerHTML = `<strong>${formatMoney(c.restante)}</strong>`;

      const tdEst = document.createElement("td");
      const estatus = safeText(c.estatus).toUpperCase();
      const badge = (() => {
        if (estatus === "PAGADO") return "success";
        if (estatus === "PARCIAL") return "warning";
        return "info";
      })();
      tdEst.innerHTML = `<span class="admin-badge ${badge}">${estatus}</span>`;

      const tdAcc = document.createElement("td");
      tdAcc.style.textAlign = "center";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-primary";
      btn.style.padding = "0.45rem 0.75rem";
      btn.style.fontSize = "0.875rem";
      btn.innerHTML = "Pagar";
      btn.title = "Registrar pago";
      btn.disabled = estatus === "PAGADO";
      btn.addEventListener("click", () => openPagoModal(c));

      tdAcc.appendChild(btn);

      tr.appendChild(tdProv);
      tr.appendChild(tdOc);
      tr.appendChild(tdEmi);
      tr.appendChild(tdVenc);
      tr.appendChild(tdTotal);
      tr.appendChild(tdRest);
      tr.appendChild(tdEst);
      tr.appendChild(tdAcc);

      el.cxpTbody.appendChild(tr);
    }
  };

  const getFiltered = () => {
    const filter = safeText(el.filtroEstatus?.value).toUpperCase();
    const cuentas = Array.isArray(state.cuentas) ? state.cuentas : [];
    if (!filter) return cuentas;
    return cuentas.filter((c) => safeText(c.estatus).toUpperCase() === filter);
  };

  const loadCuentas = async () => {
    setLoading(true);
    try {
      const resp = await apiCall("/admin/cuentas-por-pagar", { method: "GET" });
      if (!resp.ok) {
        throw new Error(resp.data?.message || "No se pudieron cargar cuentas");
      }

      state.cuentas = Array.isArray(resp.data?.data?.cuentas) ? resp.data.data.cuentas : [];

      const filtered = getFiltered();
      renderKPIs(filtered);
      renderTable(filtered);
    } catch (error) {
      console.error(error);
      setEmpty(true, error.message || "Error cargando cuentas");
      showToastError(error.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  const setGuardarLoading = (isLoading) => {
    if (!el.btnGuardarPago || !el.btnGuardarPagoText || !el.btnGuardarPagoSpinner) return;
    el.btnGuardarPago.disabled = isLoading;
    el.btnGuardarPagoText.style.display = isLoading ? "none" : "inline";
    el.btnGuardarPagoSpinner.style.display = isLoading ? "inline-block" : "none";
  };

  const guardarPago = async () => {
    const cuenta = state.cuentaSeleccionada;
    if (!cuenta) return;

    const monto = Number.parseFloat(el.pagoMonto?.value);
    if (!Number.isFinite(monto) || monto <= 0) {
      showToastError("Monto inválido");
      return;
    }

    const restante = Number.parseFloat(cuenta.restante ?? 0) || 0;
    if (monto > restante) {
      showToastError("No puedes pagar más que el restante");
      return;
    }

    const referencia = safeText(el.pagoReferencia?.value).trim();
    const file = el.pagoComprobante?.files?.[0] || null;

    const formData = new FormData();
    formData.append("monto", String(monto));
    formData.append("referencia", referencia);
    formData.append("nota", referencia);
    if (file) {
      formData.append("comprobante", file);
    }

    setGuardarLoading(true);
    try {
      const token = localStorage.getItem("razoconnect_admin_token");
      const res = await fetch(
        `${API_BASE_URL}/admin/cuentas-por-pagar/${encodeURIComponent(cuenta.cxpId)}/registrar-pago`,
        {
          method: "POST",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: formData,
        }
      );

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "No se pudo registrar pago");
      }

      const updated = data?.data?.cuenta;
      if (updated) {
        state.cuentas = state.cuentas.map((c) =>
          Number.parseInt(c.cxpId, 10) === Number.parseInt(updated.cxpId, 10)
            ? {
                ...c,
                montoPagado: updated.montoPagado,
                restante: updated.restante,
                estatus: updated.estatus,
                comprobantePago: updated.comprobantePago,
                referenciaFactura: updated.referenciaFactura,
              }
            : c
        );
      }

      showToastOk("Pago registrado");
      closePagoModal();

      const filtered = getFiltered();
      renderKPIs(filtered);
      renderTable(filtered);
    } catch (error) {
      console.error(error);
      showToastError(error.message || "Error");
    } finally {
      setGuardarLoading(false);
    }
  };

  if (el.btnRefresh) {
    el.btnRefresh.addEventListener("click", loadCuentas);
  }

  if (el.filtroEstatus) {
    el.filtroEstatus.addEventListener("change", () => {
      const filtered = getFiltered();
      renderKPIs(filtered);
      renderTable(filtered);
    });
  }

  if (el.btnCerrarModal) {
    el.btnCerrarModal.addEventListener("click", closePagoModal);
  }

  if (el.btnCancelarPago) {
    el.btnCancelarPago.addEventListener("click", closePagoModal);
  }

  if (el.btnGuardarPago) {
    el.btnGuardarPago.addEventListener("click", guardarPago);
  }

  window.addEventListener("click", (event) => {
    if (event.target === el.pagoModal) {
      closePagoModal();
    }
  });

  loadCuentas();
})();
