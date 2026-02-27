/**
 * DETALLES ORDEN COMPRA CONTROLLER
 * 
 * Controlador especializado para obtener detalles de órdenes de compra.
 * Incluye funciones para obtener información general y específica para recepción.
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * @module controllers/detallesOrdenCompraController
 * @author RazoConnect Team
 * @date 2026-02-27
 */

const db = require('../db');

/**
 * Obtener detalles de una orden de compra específica
 * GET /api/admin/ordenes-compra/:id/detalles
 */
const getDetallesOrdenCompra = async (req, res) => {
  try {
    const ordenCompraId = parseInt(req.params.id);

    // Obtener información de la orden
    const ordenQuery = `
      SELECT 
        oc.ordencompraid,
        oc.proveedorid,
        oc.fechacreacion,
        oc.fechaentregaesperada,
        oc.estatus,
        p.nombreempresa as proveedornombre,
        p.contactonombre as proveedorcontacto
      FROM ordenesdecompra oc
      INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
      WHERE oc.ordencompraid = $1
    `;

    const ordenResult = await db.query(ordenQuery, [ordenCompraId]);

    if (ordenResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada",
      });
    }

    const orden = ordenResult.rows[0];

    let reglasEmpaqueProveedor = [];
    try {
      const reglasRes = await db.query(
        `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion, nombre_regla
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1
         ORDER BY reglaid ASC`,
        [orden.proveedorid]
      );
      reglasEmpaqueProveedor = reglasRes.rows || [];
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        const reglasRes = await db.query(
          `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1
           ORDER BY reglaid ASC`,
          [orden.proveedorid]
        );
        reglasEmpaqueProveedor = reglasRes.rows || [];
      } else {
        throw dbError;
      }
    }

    const reglasEmpaqueByTipo = new Map();
    for (const r of reglasEmpaqueProveedor) {
      const tipoProductoId = Number.parseInt(r.tipoproductoid, 10);
      const reglaid = Number.parseInt(r.reglaid, 10);
      const cantidadEmpaque = Number.parseInt(r.cantidadempaque, 10);
      if (!Number.isInteger(tipoProductoId) || tipoProductoId <= 0) continue;
      if (!Number.isInteger(cantidadEmpaque) || cantidadEmpaque <= 0) continue;

      const nombreRegla = (() => {
        const raw = (r.nombre_regla ?? r.descripcion ?? "").toString().trim();
        if (raw) return raw;
        return `Caja x${cantidadEmpaque}`;
      })();

      if (!reglasEmpaqueByTipo.has(tipoProductoId)) {
        reglasEmpaqueByTipo.set(tipoProductoId, []);
      }
      reglasEmpaqueByTipo.get(tipoProductoId).push({
        reglaId: Number.isInteger(reglaid) && reglaid > 0 ? reglaid : null,
        tipoProductoId,
        cantidadEmpaque,
        nombreRegla,
      });
    }

    // Obtener detalles de productos
    const { tenant_id } = req.tenant;
    const detallesQuery = `
      SELECT 
        doc.detalleoc_id,
        doc.ordencompraid,
        doc.varianteid,
        doc.cantidadsolicitada,
        doc.cantidadrecibida,
        doc.piezasporpaquete,
        pv.productoid,
        pv.sku,
        pv.dimensiones,
        pv.medidaid,
        pv.tipoproductoid,
        pv.color_nombre,
        COALESCE(pv.stock, 0) AS stockvariante,
        pr.nombreproducto,
        c.nombre AS categoria_nombre,
        COALESCE(
          (
            SELECT pvi.url_imagen 
            FROM producto_variante_imagenes pvi 
            WHERE pvi.varianteid = pv.varianteid 
            ORDER BY pvi.orden ASC 
            LIMIT 1
          ),
          (
            SELECT pi.url_imagen 
            FROM producto_imagenes pi 
            WHERE pi.productoid = pv.productoid 
            ORDER BY pi.orden ASC 
            LIMIT 1
          )
        ) AS imagen_url
      FROM detallesordencompra doc
      INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
      INNER JOIN productos pr ON pv.productoid = pr.productoid
      LEFT JOIN categorias c ON pr.categoriaid = c.categoriaid
      WHERE doc.ordencompraid = $1
        AND doc.tenant_id = $2
      ORDER BY pr.nombreproducto ASC
    `;

    console.log(`[getDetallesOrdenCompra] Buscando detalles para orden ${ordenCompraId}, tenant ${tenant_id}`);
    const detallesResult = await db.query(detallesQuery, [ordenCompraId, tenant_id]);
    console.log(`[getDetallesOrdenCompra] Detalles encontrados: ${detallesResult.rows.length}`);
    
    if (detallesResult.rows.length === 0) {
      console.warn(`[getDetallesOrdenCompra] ⚠️ No se encontraron detalles para orden ${ordenCompraId}`);
    }

    res.json({
      success: true,
      message: "Detalles obtenidos exitosamente",
      data: {
        orden: {
          ordenCompraId: orden.ordencompraid,
          proveedorId: orden.proveedorid,
          proveedorNombre: orden.proveedornombre,
          proveedorContacto: orden.proveedorcontacto,
          fechaCreacion: orden.fechacreacion,
          fechaEntregaEsperada: orden.fechaentregaesperada,
          estatus: orden.estatus,
        },
        detalles: detallesResult.rows.map((row) => ({
          detalleId: row.detalleoc_id,
          ordenCompraId: row.ordencompraid,
          varianteId: row.varianteid,
          productoId: row.productoid,
          nombreProducto: row.nombreproducto,
          sku: row.sku,
          dimensiones: row.dimensiones,
          medidaId: row.medidaid,
          categoria: row.categoria_nombre,
          color: row.color_nombre,
          imagen: row.imagen_url,
          cantidadSolicitada: row.cantidadsolicitada,
          cantidadRecibida: row.cantidadrecibida,
          cantidadPendiente: row.cantidadsolicitada - row.cantidadrecibida,
          stockVariante: row.stockvariante,
          reglas_empaque: {
            disponibles:
              reglasEmpaqueByTipo.get(Number.parseInt(row.tipoproductoid, 10)) || [],
          },
          piezasPorPaquete: (() => {
            const parsed = Number.parseInt(row.piezasporpaquete, 10);
            return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
          })(),
        })),
      },
    });
  } catch (error) {
    console.error("Error al obtener detalles de orden de compra:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener detalles de la orden de compra",
    });
  }
};

/**
 * Obtener información de recepción de una orden de compra
 * GET /api/admin/ordenes-compra/:id/recepcion
 */
const getRecepcionOrdenCompra = async (req, res) => {
  try {
    const ordenCompraId = Number.parseInt(req.params.id, 10);
    const userRole = req.user.rol;
    const userId = req.user.id;

    if (!Number.isInteger(ordenCompraId) || ordenCompraId <= 0) {
      return res.status(400).json({
        success: false,
        message: "ID de orden de compra inválido",
      });
    }

    let whereConditions = ['oc.ordencompraid = $1'];
    let queryParams = [ordenCompraId];
    let paramIndex = 2;

    // REGLA DE VISIBILIDAD: Admin solo puede acceder a sus propias órdenes
    if (userRole === 'admin') {
      queryParams.push(userId);
      whereConditions.push(`oc.usuario_creador_id = $${paramIndex}`);
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    const ordenResult = await db.query(
      `SELECT
         oc.ordencompraid,
         oc.proveedorid,
         oc.fechacreacion,
         oc.fechaentregaesperada,
         oc.estatus,
         oc.usuario_creador_id,
         p.nombreempresa AS proveedornombre,
         p.contactonombre AS proveedorcontacto
       FROM ordenesdecompra oc
       INNER JOIN proveedores p ON oc.proveedorid = p.proveedorid
       WHERE ${whereClause}`,
      queryParams
    );

    if (!ordenResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Orden de compra no encontrada o no tienes permiso para acceder a ella",
      });
    }

    const orden = ordenResult.rows[0];

    let reglasEmpaqueProveedor = [];
    try {
      const reglasRes = await db.query(
        `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion, nombre_regla
         FROM proveedor_reglas_empaque
         WHERE proveedorid = $1
         ORDER BY reglaid ASC`,
        [orden.proveedorid]
      );
      reglasEmpaqueProveedor = reglasRes.rows || [];
    } catch (dbError) {
      if (dbError && dbError.code === "42703") {
        const reglasRes = await db.query(
          `SELECT reglaid, tipoproductoid, cantidadempaque, descripcion
           FROM proveedor_reglas_empaque
           WHERE proveedorid = $1
           ORDER BY reglaid ASC`,
          [orden.proveedorid]
        );
        reglasEmpaqueProveedor = reglasRes.rows || [];
      } else {
        throw dbError;
      }
    }

    const reglasEmpaqueByTipo = new Map();
    for (const r of reglasEmpaqueProveedor) {
      const tipoProductoId = Number.parseInt(r.tipoproductoid, 10);
      const reglaid = Number.parseInt(r.reglaid, 10);
      const cantidadEmpaque = Number.parseInt(r.cantidadempaque, 10);
      if (!Number.isInteger(tipoProductoId) || tipoProductoId <= 0) continue;
      if (!Number.isInteger(cantidadEmpaque) || cantidadEmpaque <= 0) continue;

      const nombreRegla = (() => {
        const raw = (r.nombre_regla ?? r.descripcion ?? "").toString().trim();
        if (raw) return raw;
        return `Caja x${cantidadEmpaque}`;
      })();

      if (!reglasEmpaqueByTipo.has(tipoProductoId)) {
        reglasEmpaqueByTipo.set(tipoProductoId, []);
      }
      reglasEmpaqueByTipo.get(tipoProductoId).push({
        reglaId: Number.isInteger(reglaid) && reglaid > 0 ? reglaid : null,
        tipoProductoId,
        cantidadEmpaque,
        nombreRegla,
      });
    }

    const detallesResult = await db.query(
      `SELECT
         doc.detalleoc_id,
         doc.ordencompraid,
         doc.varianteid,
         doc.cantidadsolicitada,
         doc.cantidadrecibida,
         doc.piezasrecibidas,
         doc.piezasporpaquete,
         doc.costounitario,
         doc.cerrado_por_merma,
         doc.fecha_cierre_merma,
         doc.motivo_discrepancia,
         doc.tipo_discrepancia,
         pv.productoid,
         pv.sku,
         pv.dimensiones,
         pv.medidaid,
         pv.tipoproductoid,
         pv.piezasporpaquete AS variante_piezasporpaquete,
         pv.color_nombre,
         pv.preciounitario,
         pv.precioofertaunitario,
         COALESCE(pv.stock, 0) AS stockvariante,
         pr.nombreproducto,
         pr.categoriaid,
         cat.nombre AS categoria_nombre,
         pi.url_imagen AS imagen
       FROM detallesordencompra doc
       INNER JOIN producto_variantes pv ON doc.varianteid = pv.varianteid
       INNER JOIN productos pr ON pv.productoid = pr.productoid
       LEFT JOIN categorias cat ON pr.categoriaid = cat.categoriaid
       LEFT JOIN producto_imagenes pi ON pi.productoid = pr.productoid AND pi.orden = 1
       WHERE doc.ordencompraid = $1
       ORDER BY pr.nombreproducto ASC`,
      [ordenCompraId]
    );

    const items = detallesResult.rows.map((row) => {
      const tipoProductoId = Number.parseInt(row.tipoproductoid, 10);
      const reglasDisponibles = reglasEmpaqueByTipo.get(tipoProductoId) || [];

      const piezasPorPaqueteParsed = Number.parseInt(
        row.piezasporpaquete ??
          row.variante_piezasporpaquete ??
          reglasDisponibles[0]?.cantidadEmpaque,
        10
      );
      const piezasPorPaquete =
        Number.isInteger(piezasPorPaqueteParsed) && piezasPorPaqueteParsed > 0
          ? piezasPorPaqueteParsed
          : 1;

      const solicitadoPaq = Number.parseInt(row.cantidadsolicitada, 10) || 0;
      const solicitadoPzas = solicitadoPaq * piezasPorPaquete;
      const recibidoPzas = (() => {
        const piezasRecibidasRaw = row.piezasrecibidas;
        const piezasRecibidas = Number.parseInt(piezasRecibidasRaw, 10);
        if (Number.isInteger(piezasRecibidas) && piezasRecibidas >= 0) return piezasRecibidas;
        const recibidoPaq = Number.parseInt(row.cantidadrecibida, 10) || 0;
        return recibidoPaq * piezasPorPaquete;
      })();

      const reglaEmpaqueIdSeleccionada = (() => {
        if (!Array.isArray(reglasDisponibles) || reglasDisponibles.length === 0) return null;
        const match = reglasDisponibles.find((r) => r.cantidadEmpaque === piezasPorPaquete);
        return match?.reglaId ?? reglasDisponibles[0]?.reglaId ?? null;
      })();

      return {
        detalleId: row.detalleoc_id,
        ordenCompraId: row.ordencompraid,
        varianteId: row.varianteid,
        productoId: row.productoid,
        sku: row.sku,
        nombreProducto: row.nombreproducto,
        dimensiones: row.dimensiones,
        medidaId: row.medidaid,
        tipoProductoId,
        categoriaId: row.categoriaid || null,
        categoria: row.categoria_nombre || null,
        color: row.color_nombre || null,
        imagen: row.imagen || null,
        cantidadSolicitada: solicitadoPzas,
        cantidadRecibida: recibidoPzas,
        cantidadSolicitadaPaquetes: solicitadoPaq,
        cantidadRecibidaPaquetes: Number.parseInt(row.cantidadrecibida, 10) || 0,
        piezasRecibidas: Number.parseInt(row.piezasrecibidas, 10) || 0,
        cantidadPendiente: Math.max(solicitadoPzas - recibidoPzas, 0),
        piezasPorPaquete,
        costounitario: row.costounitario !== null ? Number.parseFloat(row.costounitario) : 0,
        preciounitario: row.preciounitario !== null ? Number.parseFloat(row.preciounitario) : 0,
        precioofertaunitario: row.precioofertaunitario !== null ? Number.parseFloat(row.precioofertaunitario) : null,
        stockVariante: Number.parseInt(row.stockvariante, 10) || 0,
        cerrado_por_merma: row.cerrado_por_merma || false,
        fecha_cierre_merma: row.fecha_cierre_merma || null,
        motivo_discrepancia: row.motivo_discrepancia || null,
        tipo_discrepancia: row.tipo_discrepancia || null,
        reglas_empaque: {
          cantidadEmpaque: piezasPorPaquete,
          disponibles: reglasDisponibles,
          reglaEmpaqueIdSeleccionada,
        },
      };
    });

    return res.json({
      success: true,
      data: {
        orden: {
          ordenCompraId: orden.ordencompraid,
          proveedorId: orden.proveedorid,
          proveedorNombre: orden.proveedornombre,
          proveedorContacto: orden.proveedorcontacto,
          fechaCreacion: orden.fechacreacion,
          fechaEntregaEsperada: orden.fechaentregaesperada,
          estatus: orden.estatus,
        },
        items,
      },
    });
  } catch (error) {
    console.error("Error al obtener recepción de OC:", error);
    return res.status(500).json({
      success: false,
      message: "Error al obtener información de recepción",
    });
  }
};

module.exports = {
  getDetallesOrdenCompra,
  getRecepcionOrdenCompra
};
