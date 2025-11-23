const db = require("../db");
const { enviarEmail } = require("../services/emailService");

const STOCK_ALERT_THRESHOLD = 5;

async function checkStockBajo(varianteId) {
  if (!varianteId) {
    return;
  }

  try {
    const varianteResult = await db.query(
      `SELECT pv.VarianteID, pv.SKU, pv.Stock, p.NombreProducto
       FROM Producto_Variantes pv
       INNER JOIN Productos p ON p.ProductoID = pv.ProductoID
       WHERE pv.VarianteID = $1`,
      [varianteId]
    );

    if (varianteResult.rows.length === 0) {
      return;
    }

    const variante = varianteResult.rows[0];
    const stockActual =
      variante.stock !== null ? parseInt(variante.stock, 10) : 0;

    if (Number.isNaN(stockActual) || stockActual > STOCK_ALERT_THRESHOLD) {
      return;
    }

    const adminEmail = process.env.ADMIN_EMAIL;

    if (!adminEmail) {
      console.warn(
        "ADMIN_EMAIL no está configurado; no se enviará alerta de stock bajo."
      );
      return;
    }

    const sku = variante.sku || variante.varianteid;
    const nombreProducto = variante.nombreproducto || "Producto";
    const asunto = `⚠️ Alerta de Stock Bajo: ${sku}`;
    const cuerpoHtml = `
      <div style="font-family: Arial, sans-serif; color: #1f2937;">
        <h2 style="color:#dc2626;">Stock bajo detectado</h2>
        <p>La variante <strong>${sku}</strong> (${nombreProducto}) tiene un stock actual de <strong>${stockActual}</strong>.</p>
        <p>Revisa el inventario para reabastecer lo antes posible.</p>
        <p style="margin-top: 1.5rem;">Sistema RazoConnect</p>
      </div>
    `;

    enviarEmail(adminEmail, asunto, cuerpoHtml).catch((error) => {
      console.error("No se pudo enviar alerta de stock bajo:", error);
    });
  } catch (error) {
    console.error("Error verificando stock bajo:", error);
  }
}

module.exports = {
  checkStockBajo,
  STOCK_ALERT_THRESHOLD,
};
