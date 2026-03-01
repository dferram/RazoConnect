/**
 * VARIANTES PENDIENTES CONTROLLER
 * 
 * Controlador especializado para obtener variantes pendientes de aprobación.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/variantesPendientesController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Obtener variantes pendientes (INSERT) desde control_cambios
 * GET /api/admin/productos/:id/variantes-pendientes
 */
const getVariantesPendientesProducto = async (req, res) => {
  try {
    const productoId = Number.parseInt(req.params.id, 10);

    if (!Number.isInteger(productoId) || productoId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ProductoID inválido",
      });
    }

    const result = await db.query(
      `SELECT id, datos_nuevos, fecha_solicitud
       FROM control_cambios
       WHERE estado = 'PENDIENTE'
         AND LOWER(entidad) = 'producto_variantes'
         AND COALESCE(
           (datos_nuevos::jsonb)->>'productoid',
           (datos_nuevos::jsonb)->>'ProductoID',
           (datos_nuevos::jsonb)->>'productoId'
         ) = $1
       ORDER BY fecha_solicitud DESC`,
      [String(productoId)]
    );

    const pendientes = (result.rows || [])
      .map((row) => {
        let datos = row.datos_nuevos;
        if (!datos || typeof datos !== "object") {
          try {
            datos = JSON.parse(row.datos_nuevos);
          } catch (e) {
            return null;
          }
        }

        const sku = datos.sku ?? datos.SKU ?? null;
        const dimensiones = datos.dimensiones ?? datos.Dimensiones ?? null;
        const costoUnitarioRaw = datos.costounitario ?? datos.CostoUnitario;
        const precioUnitarioRaw = datos.preciounitario ?? datos.PrecioUnitario;
        const precioOfertaRaw =
          datos.precioofertaunitario ?? datos.PrecioOfertaUnitario;
        const stockRaw = datos.stock ?? datos.Stock;
        const piezasPorPaqueteRaw =
          datos.piezasporpaquete ?? datos.PiezasPorPaquete;
        const tipoProductoIdRaw = datos.tipoproductoid ?? datos.TipoProductoID;
        const medidaIdRaw = datos.medidaid ?? datos.MedidaID;

        const costoUnitario =
          costoUnitarioRaw !== undefined && costoUnitarioRaw !== null
            ? Number.parseFloat(costoUnitarioRaw)
            : null;
        const precioUnitario =
          precioUnitarioRaw !== undefined && precioUnitarioRaw !== null
            ? Number.parseFloat(precioUnitarioRaw)
            : null;
        const precioOfertaUnitario =
          precioOfertaRaw !== undefined && precioOfertaRaw !== null
            ? Number.parseFloat(precioOfertaRaw)
            : null;
        const stock =
          stockRaw !== undefined && stockRaw !== null
            ? Number.parseInt(stockRaw, 10)
            : 0;
        const piezasPorPaquete =
          piezasPorPaqueteRaw !== undefined && piezasPorPaqueteRaw !== null
            ? Number.parseInt(piezasPorPaqueteRaw, 10)
            : null;
        const tipoProductoId =
          tipoProductoIdRaw !== undefined && tipoProductoIdRaw !== null
            ? Number.parseInt(tipoProductoIdRaw, 10)
            : null;
        const medidaId =
          medidaIdRaw !== undefined && medidaIdRaw !== null
            ? Number.parseInt(medidaIdRaw, 10)
            : null;

        const activo =
          datos.activo !== undefined && datos.activo !== null
            ? Boolean(datos.activo)
            : true;

        return {
          varianteId: null,
          productoId,
          sku,
          dimensiones,
          costoUnitario: Number.isFinite(costoUnitario) ? costoUnitario : null,
          precioUnitario: Number.isFinite(precioUnitario) ? precioUnitario : null,
          precioOfertaUnitario: Number.isFinite(precioOfertaUnitario)
            ? precioOfertaUnitario
            : null,
          stock: Number.isInteger(stock) && stock > 0 ? stock : 0,
          piezasPorPaquete:
            Number.isInteger(piezasPorPaquete) && piezasPorPaquete > 0
              ? piezasPorPaquete
              : null,
          tipoProductoId:
            Number.isInteger(tipoProductoId) && tipoProductoId > 0
              ? tipoProductoId
              : null,
          medidaId: Number.isInteger(medidaId) && medidaId > 0 ? medidaId : null,
          activo,
          isPending: true,
          controlCambioId: row.id,
          fechaSolicitud: row.fecha_solicitud,
        };
      })
      .filter(Boolean);

    return res.status(200).json({
      success: true,
      message: "Variantes pendientes obtenidas exitosamente",
      data: {
        productoId,
        variantes: pendientes,
        total: pendientes.length,
      },
    });
  } catch (error) {
    logger.error('Error al obtener variantes pendientes del producto:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    return res.status(500).json({
      success: false,
      message: "Error al obtener variantes pendientes"
    });
  }
};

module.exports = {
  getVariantesPendientesProducto
};
