const DEFAULT_FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || "https://tudominio.com").replace(/\/$/, "");

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(amount) {
  const num = Number.isFinite(amount) ? amount : parseFloat(amount || 0);
  const safe = Number.isFinite(num) ? num : 0;
  return `$${safe.toFixed(2)}`;
}

function buildAbsoluteUrl(rawUrl, frontendBaseUrl) {
  const base = (frontendBaseUrl || DEFAULT_FRONTEND_BASE_URL).replace(/\/$/, "");

  if (!rawUrl) {
    return `${base}/img/email-product-placeholder.png`;
  }

  const url = String(rawUrl).trim();

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("//")) {
    return `https:${url}`;
  }

  if (url.startsWith("/")) {
    return `${base}${url}`;
  }

  return `${base}/${url}`;
}

function formatFecha(fechaRaw) {
  if (!fechaRaw) {
    return "";
  }

  try {
    const d = new Date(fechaRaw);
    if (Number.isNaN(d.getTime())) {
      return String(fechaRaw);
    }

    return d.toLocaleString("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return String(fechaRaw);
  }
}

function buildDireccionTexto(direccion, clienteNombreFallback) {
  if (!direccion) {
    return escapeHtml(clienteNombreFallback || "");
  }

  const partesLinea1 = [];
  if (direccion.calle) {
    partesLinea1.push(direccion.calle);
  }
  if (direccion.numeroExterior) {
    partesLinea1.push(`#${direccion.numeroExterior}`);
  }
  if (direccion.numeroInterior) {
    partesLinea1.push(`Int. ${direccion.numeroInterior}`);
  }

  const linea1 = partesLinea1.join(", ");

  const partesLinea2 = [];
  if (direccion.colonia) {
    partesLinea2.push(direccion.colonia);
  }
  if (direccion.ciudad) {
    partesLinea2.push(direccion.ciudad);
  }

  const linea2 = partesLinea2.join(", ");

  const partesLinea3 = [];
  if (direccion.estadoNombre || direccion.estado) {
    partesLinea3.push(direccion.estadoNombre || direccion.estado);
  }
  if (direccion.codigoPostal) {
    partesLinea3.push(`C.P. ${direccion.codigoPostal}`);
  }

  const linea3 = partesLinea3.join(" · ");

  const receptor = direccion.receptor || clienteNombreFallback || "";

  const lineas = [receptor, linea1, linea2, linea3]
    .map((l) => escapeHtml(l || ""))
    .filter((l) => l.length > 0);

  if (direccion.telefonoContacto) {
    lineas.push(`Tel: ${escapeHtml(direccion.telefonoContacto)}`);
  }

  return lineas.join("<br/>");
}

function generarHtmlConfirmacion(pedido, detalles, cliente, options = {}) {
  const frontendBaseUrl = options.frontendBaseUrl || DEFAULT_FRONTEND_BASE_URL;

  const nombreCliente =
    (cliente && (cliente.nombre || cliente.nombreCompleto)) || "cliente";

  const fechaPedido = formatFecha(pedido && pedido.fecha);

  const subtotal = Number.isFinite(pedido && pedido.subtotal)
    ? pedido.subtotal
    : parseFloat(pedido && pedido.montoTotal) || 0;

  const costoEnvio = Number.isFinite(pedido && pedido.costoEnvio)
    ? pedido.costoEnvio
    : parseFloat(pedido && pedido.costoEnvio) || 0;

  let descuento = 0;
  if (pedido && pedido.descuento !== undefined && pedido.descuento !== null) {
    const parsed = parseFloat(pedido.descuento);
    if (!Number.isNaN(parsed)) {
      descuento = parsed;
    }
  }

  const total = subtotal + costoEnvio - descuento;

  const direccionHtml = buildDireccionTexto(
    cliente && cliente.direccion,
    nombreCliente
  );

  const rowsHtml = (Array.isArray(detalles) ? detalles : [])
    .map((item, index) => {
      const bgColor = index % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
      const imagenUrl = buildAbsoluteUrl(item.imagenUrl, frontendBaseUrl);
      const cantidad =
        item && Number.isFinite(item.cantidad)
          ? item.cantidad
          : parseInt(item.cantidad, 10) || 0;
      const precioUnitario =
        item && Number.isFinite(item.precioUnitario)
          ? item.precioUnitario
          : parseFloat(item.precioUnitario || 0);
      const precioTotal =
        item && Number.isFinite(item.precioTotal)
          ? item.precioTotal
          : parseFloat(item.precioTotal || 0);

      const nombreProducto = escapeHtml(item.nombreProducto || "");
      const sku = escapeHtml(item.sku || "");
      const dimensiones = escapeHtml(item.dimensiones || "");

      const varianteLinea = dimensiones
        ? `SKU: ${sku} · ${dimensiones}`
        : sku
        ? `SKU: ${sku}`
        : "";

      return `
        <tr style="background-color:${bgColor};">
          <td style="padding:12px 8px; vertical-align:top; text-align:center; width:64px;">
            <img src="${imagenUrl}" alt="${nombreProducto}" width="50" height="50" style="border-radius:8px; object-fit:cover; display:block; margin:0 auto;" />
          </td>
          <td style="padding:12px 8px; vertical-align:top;">
            <div style="font-size:14px; color:#111827; font-weight:600;">${nombreProducto}</div>
            ${
              varianteLinea
                ? `<div style="font-size:12px; color:#6B7280; margin-top:2px;">${varianteLinea}</div>`
                : ""
            }
          </td>
          <td style="padding:12px 8px; vertical-align:top; text-align:center; font-size:14px; color:#111827; white-space:nowrap;">${cantidad}</td>
          <td style="padding:12px 8px; vertical-align:top; text-align:right; font-size:14px; color:#111827; white-space:nowrap;">
            <div>${formatCurrency(precioUnitario)}</div>
            <div style="font-size:12px; color:#6B7280; margin-top:2px;">${formatCurrency(
              precioTotal
            )}</div>
          </td>
        </tr>
      `;
    })
    .join("");

  const pedidoIdTexto = pedido && (pedido.id || pedido.pedidoId || pedido.pedidoID);

  return `
  <html>
    <body style="margin:0; padding:0; background-color:#F3F4F6; font-family:system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6; padding:24px 0;">
        <tr>
          <td align="center" style="padding:0 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; box-shadow:0 12px 30px rgba(15, 23, 42, 0.12);">
              <tr>
                <td style="background-color:#F97316; padding:24px 24px 18px; text-align:center; color:#FFFFFF;">
                  <div style="font-size:20px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:6px;">RAZOCONNECT</div>
                  <div style="font-size:22px; font-weight:700; margin-bottom:4px;">
                    ¡Gracias por tu compra, ${escapeHtml(nombreCliente)}!
                  </div>
                  <div style="font-size:14px; opacity:0.9;">
                    Hemos recibido y confirmado tu pedido. Te compartimos el resumen de tu compra.
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:20px 24px 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="font-size:13px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">Pedido</td>
                      <td style="font-size:13px; color:#6B7280; text-transform:uppercase; letter-spacing:0.08em; font-weight:600; text-align:right;">Fecha</td>
                    </tr>
                    <tr>
                      <td style="font-size:16px; color:#111827; font-weight:600; padding-top:4px;">#${escapeHtml(
                        pedidoIdTexto || ""
                      )}</td>
                      <td style="font-size:15px; color:#111827; padding-top:4px; text-align:right;">${escapeHtml(
                        fechaPedido
                      )}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:4px 24px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:10px; overflow:hidden; border:1px solid #FEE2E2;">
                    <tr>
                      <td colspan="2" style="background:linear-gradient(90deg, #FEF2F2, #FFF7ED); padding:10px 14px; font-size:13px; font-weight:600; color:#9A3412; text-transform:uppercase; letter-spacing:0.08em;">
                        Dirección de envío
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:10px 14px 12px; font-size:14px; color:#111827; line-height:1.5;">
                        ${direccionHtml}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:4px 24px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:10px; overflow:hidden; border:1px solid #E5E7EB;">
                    <tr>
                      <td colspan="4" style="background-color:#F9FAFB; padding:10px 14px; font-size:13px; font-weight:600; color:#111827; text-transform:uppercase; letter-spacing:0.08em;">
                        Productos de tu pedido
                      </td>
                    </tr>
                    <tr>
                      <th align="left" style="padding:8px 8px; font-size:12px; color:#6B7280; font-weight:600; width:64px;">&nbsp;</th>
                      <th align="left" style="padding:8px 8px; font-size:12px; color:#6B7280; font-weight:600;">Producto</th>
                      <th align="center" style="padding:8px 8px; font-size:12px; color:#6B7280; font-weight:600; white-space:nowrap;">Cantidad</th>
                      <th align="right" style="padding:8px 8px; font-size:12px; color:#6B7280; font-weight:600; white-space:nowrap;">Precio</th>
                    </tr>
                    ${rowsHtml || `
                      <tr>
                        <td colspan="4" style="padding:16px 10px; font-size:14px; color:#6B7280; text-align:center;">
                          No se encontraron productos en este pedido.
                        </td>
                      </tr>
                    `}
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:0 24px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="width:55%;"></td>
                      <td style="width:45%;">
                        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px; color:#111827;">
                          <tr>
                            <td style="padding:3px 0; color:#6B7280;">Subtotal</td>
                            <td style="padding:3px 0; text-align:right; font-weight:500;">${formatCurrency(
                              subtotal
                            )}</td>
                          </tr>
                          <tr>
                            <td style="padding:3px 0; color:#6B7280;">Envío</td>
                            <td style="padding:3px 0; text-align:right; font-weight:500;">${formatCurrency(
                              costoEnvio
                            )}</td>
                          </tr>
                          <tr>
                            <td style="padding:3px 0; color:#6B7280;">Descuento</td>
                            <td style="padding:3px 0; text-align:right; font-weight:500;">${formatCurrency(
                              descuento
                            )}</td>
                          </tr>
                          <tr>
                            <td style="padding-top:8px; border-top:1px solid #E5E7EB; font-size:15px; font-weight:700; color:#111827;">Total</td>
                            <td style="padding-top:8px; border-top:1px solid #E5E7EB; font-size:18px; font-weight:800; color:#F97316; text-align:right;">${formatCurrency(
                              total
                            )}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:16px 24px 10px; border-top:1px solid #E5E7EB;">
                  <div style="font-size:13px; color:#6B7280; text-align:center; margin-bottom:6px;">
                    ¿Tienes dudas sobre tu pedido? Escríbenos y con gusto te ayudamos.
                  </div>
                  <div style="font-size:13px; color:#6B7280; text-align:center;">
                    <a href="mailto:soporte@razoconnect.com" style="color:#F97316; text-decoration:none; font-weight:600;">soporte@razoconnect.com</a>
                    ·
                    <a href="tel:+5215512345678" style="color:#F97316; text-decoration:none; font-weight:600;">+52 55 1234 5678</a>
                  </div>
                </td>
              </tr>

              <tr>
                <td style="padding:6px 24px 20px; text-align:center;">
                  <div style="font-size:12px; color:#9CA3AF; margin-bottom:6px;">
                    Síguenos en redes sociales
                  </div>
                  <div>
                    <a href="https://facebook.com" style="display:inline-block; margin:0 6px; font-size:12px; color:#6B7280; text-decoration:none;">Facebook</a>
                    <a href="https://instagram.com" style="display:inline-block; margin:0 6px; font-size:12px; color:#6B7280; text-decoration:none;">Instagram</a>
                    <a href="https://wa.me/5215512345678" style="display:inline-block; margin:0 6px; font-size:12px; color:#6B7280; text-decoration:none;">WhatsApp</a>
                  </div>
                  <div style="font-size:11px; color:#9CA3AF; margin-top:8px;">
                    &copy; ${new Date().getFullYear()} RazoConnect. Todos los derechos reservados.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

module.exports = {
  generarHtmlConfirmacion,
};
