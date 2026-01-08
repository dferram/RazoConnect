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

    kpiTotalHistorico: document.getElementById("kpiTotalHistorico"),
    kpiPagado: document.getElementById("kpiPagado"),
    kpiCancelado: document.getElementById("kpiCancelado"),
  };

  const state = {
    cuentas: [],
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

  const formatDateTime = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  };

  const setLoading = (isLoading) => {
    if (!el.loadingState) return;
    el.loadingState.style.display = isLoading ? "flex" : "none";
  };

  const setEmpty = (show, text) => {
    if (!el.emptyState || !el.cxpTable) return;
    el.emptyState.style.display = show ? "block" : "none";
    if (text) el.emptyState.textContent = text;
    el.cxpTable.style.display = show ? "none" : "table";
  };

  const computeKpis = (cuentas) => {
    let totalHistorico = 0;
    let pagado = 0;
    let cancelado = 0;

    for (const c of cuentas) {
      const monto = Number.parseFloat(c.montoTotal ?? 0) || 0;
      totalHistorico += monto;

      const estatus = safeText(c.estatus).toUpperCase();
      if (estatus === "PAGADO") pagado += monto;
      if (estatus === "CANCELADO") cancelado += monto;
    }

    if (el.kpiTotalHistorico) el.kpiTotalHistorico.textContent = formatMoney(totalHistorico);
    if (el.kpiPagado) el.kpiPagado.textContent = formatMoney(pagado);
    if (el.kpiCancelado) el.kpiCancelado.textContent = formatMoney(cancelado);
  };

  const getFiltered = () => {
    const filter = safeText(el.filtroEstatus?.value).toUpperCase();
    const cuentas = Array.isArray(state.cuentas) ? state.cuentas : [];
    if (!filter) return cuentas;
    return cuentas.filter((c) => safeText(c.estatus).toUpperCase() === filter);
  };

  const renderTable = (cuentas) => {
    if (!el.cxpTbody || !el.resultadosBadge) return;

    el.cxpTbody.innerHTML = "";
    el.resultadosBadge.textContent = `${cuentas.length} REGISTRO${cuentas.length === 1 ? "" : "S"}`;

    if (!cuentas.length) {
      setEmpty(true, "No hay cuentas saldadas para mostrar.");
      return;
    }

    setEmpty(false);

    for (const c of cuentas) {
      const tr = document.createElement("tr");

      const tdProv = document.createElement("td");
      tdProv.innerHTML = `
        <div style="display:flex; align-items:center; gap: 0.6rem;">
          <div style="width: 34px; height: 34px; border-radius: 0.75rem; background: rgba(16, 185, 129, 0.10); display:flex; align-items:center; justify-content:center; font-weight: 900; color:#065f46;">✅</div>
          <div style="display:grid; gap: 0.15rem;">
            <div style="font-weight: 800; color: #111827;">${safeText(c.proveedorNombre)}</div>
            <div style="font-size: 0.85rem; color: #6b7280;">Proveedor #${safeText(c.proveedorId)}</div>
          </div>
        </div>
      `;

      const tdMonto = document.createElement("td");
      tdMonto.style.textAlign = "right";
      tdMonto.style.whiteSpace = "nowrap";
      tdMonto.innerHTML = `<strong style="color:#065f46;">${formatMoney(c.montoTotal)}</strong>`;

      const tdFecha = document.createElement("td");
      tdFecha.textContent = c.fechaPagado ? formatDateTime(c.fechaPagado) : "—";

      const tdRef = document.createElement("td");
      tdRef.textContent = safeText(c.referenciaFactura || "—");

      const tdEst = document.createElement("td");
      const estatus = safeText(c.estatus).toUpperCase();
      const badge = estatus === "PAGADO" ? "success" : "secondary";
      tdEst.innerHTML = `<span class="admin-badge ${badge}">${estatus}</span>`;

      const tdAcc = document.createElement("td");
      tdAcc.style.textAlign = "center";
      tdAcc.style.whiteSpace = "nowrap";

      const btnDetalle = document.createElement("a");
      btnDetalle.href = `/admin-edocuenta-detalle.html?proveedorId=${encodeURIComponent(
        safeText(c.proveedorId)
      )}`;
      btnDetalle.className = "btn btn-secondary";
      btnDetalle.style.padding = "0.45rem 0.65rem";
      btnDetalle.style.fontSize = "0.875rem";
      btnDetalle.title = "Ver detalles";
      btnDetalle.innerHTML = '<i class="bi bi-eye"></i>';

      tdAcc.appendChild(btnDetalle);

      if (c.comprobantePago) {
        const linkComp = document.createElement("a");
        linkComp.href = c.comprobantePago;
        linkComp.target = "_blank";
        linkComp.rel = "noopener noreferrer";
        linkComp.className = "btn btn-secondary";
        linkComp.style.padding = "0.45rem 0.65rem";
        linkComp.style.fontSize = "0.875rem";
        linkComp.style.marginLeft = "0.5rem";
        linkComp.title = "Ver comprobante / factura";
        linkComp.innerHTML = '<i class="bi bi-file-earmark-text"></i>';
        tdAcc.appendChild(linkComp);
      }

      tr.appendChild(tdProv);
      tr.appendChild(tdMonto);
      tr.appendChild(tdFecha);
      tr.appendChild(tdRef);
      tr.appendChild(tdEst);
      tr.appendChild(tdAcc);

      el.cxpTbody.appendChild(tr);
    }
  };

  const loadCuentas = async () => {
    setLoading(true);
    try {
      const resp = await apiCall("/admin/cuentas-por-pagar?modo=historico", { method: "GET" });
      if (!resp.ok) {
        throw new Error(resp.data?.message || "No se pudieron cargar cuentas");
      }

      state.cuentas = Array.isArray(resp.data?.data?.cuentas) ? resp.data.data.cuentas : [];

      const filtered = getFiltered();
      computeKpis(filtered);
      renderTable(filtered);
    } catch (error) {
      console.error(error);
      setEmpty(true, error.message || "Error cargando cuentas");
      if (typeof Swal !== "undefined" && Swal) {
        Swal.fire({
          toast: true,
          position: "top-end",
          icon: "error",
          title: error.message || "Error",
          showConfirmButton: false,
          timer: 2200,
          timerProgressBar: true,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (el.btnRefresh) {
    el.btnRefresh.addEventListener("click", loadCuentas);
  }

  if (el.filtroEstatus) {
    el.filtroEstatus.addEventListener("change", () => {
      const filtered = getFiltered();
      computeKpis(filtered);
      renderTable(filtered);
    });
  }

  loadCuentas();
})();
