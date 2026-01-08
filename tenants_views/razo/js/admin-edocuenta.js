(function () {
  "use strict";

  const el = {
    btnRefresh: document.getElementById("btnRefresh"),
    loadingState: document.getElementById("loadingState"),
    emptyState: document.getElementById("emptyState"),
    proveedoresGrid: document.getElementById("proveedoresGrid"),
  };

  const state = {
    proveedores: [],
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

  const setLoading = (isLoading) => {
    if (!el.loadingState) return;
    el.loadingState.style.display = isLoading ? "flex" : "none";
  };

  const setEmpty = (show, text) => {
    if (el.emptyState) {
      el.emptyState.style.display = show ? "block" : "none";
      if (text) el.emptyState.textContent = text;
    }
    if (el.proveedoresGrid) {
      el.proveedoresGrid.style.display = show ? "none" : "grid";
    }
  };

  const render = () => {
    if (!el.proveedoresGrid) return;

    el.proveedoresGrid.innerHTML = "";
    const proveedores = Array.isArray(state.proveedores) ? state.proveedores : [];

    if (!proveedores.length) {
      setEmpty(true, "No hay proveedores con movimientos.");
      return;
    }

    setEmpty(false);

    for (const p of proveedores) {
      const card = document.createElement("div");
      card.className = "bank-card";

      const saldo = Number.parseFloat(p.saldoPendiente ?? 0) || 0;
      const deudaHist = Number.parseFloat(p.deudaTotalHistorica ?? 0) || 0;
      const facturas = Number.parseInt(p.facturasVivas ?? 0, 10) || 0;

      const initials = safeText(p.proveedorNombre)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0]?.toUpperCase())
        .join("") || "🏭";

      card.innerHTML = `
        <div class="bank-card-top">
          <div class="bank-provider">
            <div class="bank-provider-logo" aria-hidden="true">${initials}</div>
            <div style="min-width:0;">
              <div class="bank-provider-name" title="${safeText(p.proveedorNombre)}">${safeText(
        p.proveedorNombre
      )}</div>
              <div class="bank-provider-sub">Proveedor #${safeText(p.proveedorId)}</div>
            </div>
          </div>
        </div>

        <div>
          <div class="bank-balance">${formatMoney(saldo)}</div>
          <div class="bank-balance-sub">Saldo pendiente</div>
        </div>

        <div class="bank-meta">
          <div><strong>${facturas}</strong> factura${facturas === 1 ? "" : "s"} viva${
        facturas === 1 ? "" : "s"
      }</div>
          <div>Histórico: <strong>${formatMoney(deudaHist)}</strong></div>
        </div>

        <div class="bank-actions">
          <button type="button" class="btn btn-primary" style="padding: 0.55rem 1rem;">
            Ver Movimientos
          </button>
        </div>
      `;

      const btn = card.querySelector("button");
      if (btn) {
        btn.addEventListener("click", () => {
          const proveedorId = Number.parseInt(p.proveedorId, 10);
          if (!Number.isInteger(proveedorId) || proveedorId <= 0) return;
          window.location.href = `/admin-edocuenta-detalle.html?proveedorId=${encodeURIComponent(
            proveedorId
          )}`;
        });
      }

      el.proveedoresGrid.appendChild(card);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiCall("/admin/estado-cuenta/resumen", { method: "GET" });
      if (!resp.ok) {
        throw new Error(resp.data?.message || "No se pudo cargar estado de cuenta");
      }

      state.proveedores = Array.isArray(resp.data?.data?.proveedores)
        ? resp.data.data.proveedores
        : [];

      render();
    } catch (error) {
      console.error(error);
      setEmpty(true, error.message || "Error cargando estado de cuenta");
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

  if (el.btnRefresh) {
    el.btnRefresh.addEventListener("click", load);
  }

  load();
})();
