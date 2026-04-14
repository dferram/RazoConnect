// ============================================
// UTILITY FUNCTIONS FOR PEDIDOS CALCULATIONS
// Extracted from controllers/pedidosController.js
// ============================================

const db = require("../../db");

const TAMANO_VALUE_KEYS = [
  "valor",
  "cantidad",
  "piezas",
  "piezasporpaquete",
  "numeropiezas",
  "tamano",
  "cantidadpiezas",
];

const TAMANO_LABEL_KEYS = ["etiqueta", "descripcion", "nombre", "label"];

/**
 * Calcula el split entre stock disponible y backorder para un producto
 * Considera el múltiplo de empaque si aplica
 */
function calcularSplitBackorder({
  cantidadSolicitada,
  stockPiezas,
  piezasPorPaquete,
  multiploBackorder,
}) {
  const cantidad = Number.isInteger(cantidadSolicitada) ? cantidadSolicitada : 0;
  const stock = Number.isInteger(stockPiezas) ? stockPiezas : 0;
  const piezas = Number.isInteger(piezasPorPaquete) ? piezasPorPaquete : 0;
  const multiplo = Number.isInteger(multiploBackorder) ? multiploBackorder : 1;
  const regla = multiplo > 1 ? "PAQUETE" : "UNITARIO";

  if (cantidad <= 0 || piezas <= 0) {
    return {
      cantidadSurtida: 0,
      cantidadPendiente: 0,
      cantidadBackorderAjustada: 0,
      cantidadTotalCobrar: 0,
      ajusteAplicado: false,
      reglaBackorder: regla,
    };
  }

  const paquetesSurtibles = Math.floor(Math.max(stock, 0) / piezas);
  const cantidadSurtida = Math.max(Math.min(cantidad, paquetesSurtibles), 0);
  const cantidadPendiente = Math.max(cantidad - cantidadSurtida, 0);

  let cantidadBackorderAjustada = cantidadPendiente;
  if (cantidadPendiente > 0 && multiplo > 1) {
    const piezasPendientes = cantidadPendiente * piezas;
    const piezasBackorderAjustadas = Math.ceil(piezasPendientes / multiplo) * multiplo;
    cantidadBackorderAjustada = Math.ceil(piezasBackorderAjustadas / piezas);
  }

  const cantidadTotalCobrar = cantidad;
  const ajusteAplicado = cantidadBackorderAjustada !== cantidadPendiente;

  return {
    cantidadSurtida,
    cantidadPendiente,
    cantidadBackorderAjustada,
    cantidadTotalCobrar,
    ajusteAplicado,
    reglaBackorder: regla,
  };
}

/**
 * Obtiene el múltiplo de empaque desde las reglas de empaque del proveedor
 */
async function obtenerMultiploBackorderDesdeReglaEmpaque({
  proveedorId,
  tipoProductoId,
}) {
  const proveedor = Number.parseInt(proveedorId, 10);
  const tipo = Number.parseInt(tipoProductoId, 10);
  if (!Number.isInteger(proveedor) || proveedor <= 0) return 1;
  if (!Number.isInteger(tipo) || tipo <= 0) return 1;

  try {
    const { rows } = await db.query(
      `SELECT cantidadempaque
       FROM proveedor_reglas_empaque
       WHERE proveedorid = $1 AND tipoproductoid = $2
       LIMIT 1`,
      [proveedor, tipo]
    );
    const raw = rows[0]?.cantidadempaque;
    const parsed = Number.parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  } catch (dbError) {
    if (dbError && dbError.code === "42703") {
      const { rows } = await db.query(
        `SELECT piezasporpaquete AS cantidadempaque
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1 AND tipoproductoid = $2
         LIMIT 1`,
        [proveedor, tipo]
      );
      const raw = rows[0]?.cantidadempaque;
      const parsed = Number.parseInt(raw, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
    }
    throw dbError;
  }
}

/**
 * Extrae información de tamaño/paquete de su estructura de objeto
 * Devuelve { valor, etiqueta }
 */
function extraerInfoTamano(tamanoRaw) {
  if (!tamanoRaw || typeof tamanoRaw !== "object") {
    return { valor: null, etiqueta: null };
  }

  let valorEncontrado = null;
  for (const [key, value] of Object.entries(tamanoRaw)) {
    const lowerKey = key.toLowerCase();
    if (TAMANO_VALUE_KEYS.includes(lowerKey)) {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        valorEncontrado = parsed;
        break;
      }
    }
  }

  let etiquetaEncontrada = null;
  for (const [key, value] of Object.entries(tamanoRaw)) {
    const lowerKey = key.toLowerCase();
    if (
      TAMANO_LABEL_KEYS.includes(lowerKey) &&
      typeof value === "string" &&
      value.trim()
    ) {
      etiquetaEncontrada = value.trim();
      break;
    }
  }

  if (etiquetaEncontrada === null && Number.isFinite(valorEncontrado)) {
    etiquetaEncontrada =
      valorEncontrado === 1 ? "Pieza individual" : `Pack de ${valorEncontrado}`;
  }

  return {
    valor: Number.isFinite(valorEncontrado) ? valorEncontrado : null,
    etiqueta: etiquetaEncontrada,
  };
}

module.exports = {
  calcularSplitBackorder,
  obtenerMultiploBackorderDesdeReglaEmpaque,
  extraerInfoTamano,
  TAMANO_VALUE_KEYS,
  TAMANO_LABEL_KEYS,
};
