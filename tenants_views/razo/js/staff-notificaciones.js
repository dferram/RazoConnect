(function () {
  "use strict";

  const ENDPOINT_LIST = "/api/staff/notificaciones";
  const ENDPOINT_MARK_ALL = "/api/staff/notificaciones/marcar-todas-leidas";

  function getTokenStaff() {
    return (
      localStorage.getItem("razoconnect_admin_token") ||
      localStorage.getItem("razoconnect_token") ||
      null
    );
  }

  function setVisible(el, visible) {
    if (!el) return;
    el.style.display = visible ? "block" : "none";
  }

  function escapeHtml(str) {
    return (str ?? "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderCard(n) {
    const titulo = escapeHtml(n.titulo || "Notificación");
    const mensaje = escapeHtml(n.mensaje || "");
    const fecha = formatDate(n.fechacreacion);
    const leida = Boolean(n.leida);

    return `
      <div class="admin-card" style="margin-top: 1rem; box-shadow: 0 8px 22px rgba(17, 24, 39, 0.06);">
        <div class="admin-card-header" style="padding: 1.25rem 1.5rem;">
          <div style="display:flex; align-items:flex-start; justify-content:space-between; width:100%; gap: 1rem;">
            <div>
              <div class="admin-card-title" style="margin:0; font-size: 1.05rem; color: var(--razo-gray-dark);">
                ${titulo}
              </div>
              <div style="color: rgba(31, 45, 61, 0.6); font-size: 0.85rem; margin-top: 0.25rem;">
                ${fecha}
              </div>
            </div>

            <div>
              <span class="badge rounded-pill ${leida ? "bg-secondary" : "bg-danger"}">
                ${leida ? "Leída" : "Nueva"}
              </span>
            </div>
          </div>
        </div>
        <div class="admin-card-body" style="padding: 0 1.5rem 1.25rem;">
          <div style="color: var(--razo-gray-warm); font-size: 0.95rem; line-height: 1.55;">
            ${mensaje}
          </div>
        </div>
      </div>
    `;
  }

  async function fetchJson(url, options = {}) {
    const token = getTokenStaff();
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  }

  async function cargarNotificaciones() {
    const loading = document.getElementById("loadingNotificaciones");
    const lista = document.getElementById("listaNotificaciones");
    const empty = document.getElementById("emptyNotificaciones");

    if (!loading || !lista || !empty) return;

    setVisible(loading, true);
    setVisible(lista, false);
    setVisible(empty, false);
    lista.innerHTML = "";

    try {
      const response = await fetchJson(ENDPOINT_LIST, { method: "GET" });

      if (!response.ok || response.data?.success === false) {
        throw new Error(response.data?.message || "No se pudieron obtener notificaciones");
      }

      const notificaciones =
        response.data?.data?.notificaciones && Array.isArray(response.data.data.notificaciones)
          ? response.data.data.notificaciones
          : [];

      if (!notificaciones.length) {
        setVisible(empty, true);
        return;
      }

      lista.innerHTML = notificaciones.map(renderCard).join("");
      setVisible(lista, true);
    } catch (error) {
      console.error("Error cargando notificaciones staff:", error);

      if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
        Swal.fire({
          icon: "error",
          title: "No se pudieron cargar",
          text: error.message || "Error al cargar notificaciones",
          confirmButtonColor: "#F97316",
        });
      }

      setVisible(empty, true);
    } finally {
      setVisible(loading, false);

      if (typeof window.actualizarIndicadoresNotificacionesStaff === "function") {
        window.actualizarIndicadoresNotificacionesStaff();
      }
    }
  }

  async function marcarTodasComoLeidas() {
    const btn = document.getElementById("btnMarcarTodas");
    if (!btn) return;

    const prevText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Marcando...";

    try {
      const response = await fetchJson(ENDPOINT_MARK_ALL, { method: "POST" });

      if (!response.ok || response.data?.success === false) {
        throw new Error(response.data?.message || "No se pudieron marcar como leídas");
      }

      await cargarNotificaciones();

      if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
        Swal.fire({
          icon: "success",
          title: "Listo",
          text: response.data?.message || "Notificaciones marcadas como leídas",
          confirmButtonColor: "#F97316",
        });
      }
    } catch (error) {
      console.error("Error marcando todas como leídas:", error);

      if (typeof Swal !== "undefined" && Swal && typeof Swal.fire === "function") {
        Swal.fire({
          icon: "error",
          title: "No se pudo marcar",
          text: error.message || "Ocurrió un error",
          confirmButtonColor: "#F97316",
        });
      }
    } finally {
      btn.disabled = false;
      btn.textContent = prevText;

      if (typeof window.actualizarIndicadoresNotificacionesStaff === "function") {
        window.actualizarIndicadoresNotificacionesStaff();
      }
    }
  }

  function init() {
    const btn = document.getElementById("btnMarcarTodas");
    if (btn) {
      btn.addEventListener("click", marcarTodasComoLeidas);
    }

    cargarNotificaciones();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
