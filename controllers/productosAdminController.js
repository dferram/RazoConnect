/**
 * PRODUCTOS ADMIN CONTROLLER
 * 
 * Controlador especializado para la gestión de productos (CRUD).
 * Extraído de adminController.js como parte del Strangler Pattern.
 * 
 * CARACTERÍSTICAS:
 * - Gestión completa de productos (crear, leer, actualizar)
 * - Transacciones para operaciones de escritura
 * - Generación automática de SKU maestro
 * - Gestión de variantes y packs
 * - Validación de reglas de empaque
 * 
 * @module controllers/productosAdminController
 * @author RazoConnect Team
 * @date 2026-02-26
 */

const db = require('../db');
const logger = require('../utils/logger');

/**
 * Helper: Generar SKU maestro único
 */
async function generarSkuMaestro(client, { categoriaid, nombreProducto }) {
  const categoriaResult = await client.query(
    'SELECT prefijo FROM categorias WHERE categoriaid = $1',
    [categoriaid]
  );

  const prefijo = categoriaResult.rows[0]?.prefijo || 'PROD';
  const nombreLimpio = nombreProducto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .substring(0, 4);

  const timestamp = Date.now().toString().slice(-6);
  return `${prefijo}-${nombreLimpio}-${timestamp}`;
}

/**
 * Obtener todos los productos para gestión
 * 
 * @route GET /api/admin/productos
 */
const getAllProductos = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT 
        p.productoid,
        p.nombreproducto,
        p.descripcion,
        p.categoriaid,
        p.activo,
        p.reglaid,
        pre.tipoproductoid,
        tp.nombre AS tipo_producto,
        COALESCE(SUM(v.stock), 0) AS stock_total,
        COUNT(v.varianteid) AS variantes_count,
        MIN(v.preciounitario) FILTER (WHERE v.preciounitario IS NOT NULL) AS precio_desde,
        JSONB_BUILD_OBJECT(
          'varianteId', v_top.varianteid,
          'sku', v_top.sku,
          'precioUnitario', v_top.preciounitario,
          'stock', v_top.stock,
          'dimensiones', v_top.dimensiones,
          'medidaId', v_top.medidaid
        ) AS variante_destacada,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'varianteId', v.varianteid,
            'sku', v.sku,
            'precioUnitario', v.preciounitario,
            'stock', v.stock,
            'dimensiones', v.dimensiones,
            'medidaId', v.medidaid
          )
        ) FILTER (WHERE v.varianteid IS NOT NULL) AS variantes,
        imagen.url_imagen,
        imagen.textoalternativo
      FROM productos p
      LEFT JOIN proveedor_reglas_empaque pre ON pre.reglaid = p.reglaid
      LEFT JOIN tipoproducto tp ON tp.tipoproductoid = pre.tipoproductoid
      LEFT JOIN producto_variantes v ON v.productoid = p.productoid
      LEFT JOIN LATERAL (
        SELECT v2.*
        FROM producto_variantes v2
        WHERE v2.productoid = p.productoid
        ORDER BY v2.stock DESC NULLS LAST, v2.varianteid ASC
        LIMIT 1
      ) v_top ON true
      LEFT JOIN LATERAL (
        SELECT 
          pi.url_imagen,
          pi.textoalternativo
        FROM producto_imagenes pi
        WHERE pi.productoid = p.productoid
        ORDER BY pi.orden ASC NULLS LAST, pi.imagenid ASC
        LIMIT 1
      ) imagen ON true
      GROUP BY 
        p.productoid, 
        p.nombreproducto, 
        p.descripcion, 
        p.categoriaid, 
        p.activo,
        p.reglaid,
        pre.tipoproductoid,
        tp.nombre,
        v_top.varianteid, 
        v_top.sku, 
        v_top.preciounitario, 
        v_top.stock, 
        v_top.dimensiones, 
        v_top.medidaid,
        imagen.url_imagen,
        imagen.textoalternativo
      ORDER BY p.productoid DESC`
    );

    const categorias = await db.query(
      "SELECT categoriaid, nombre FROM categorias"
    );
    const categoriasMap = {};
    categorias.rows.forEach((cat) => {
      categoriasMap[cat.categoriaid] = cat.nombre;
    });

    res.json({
      success: true,
      data: {
        productos: result.rows.map((row) => {
          const varianteDestacada =
            row.variante_destacada && row.variante_destacada.varianteId
              ? {
                  varianteId: row.variante_destacada.varianteId,
                  sku: row.variante_destacada.sku,
                  precioUnitario: row.variante_destacada.precioUnitario
                    ? parseFloat(row.variante_destacada.precioUnitario)
                    : null,
                  stock: row.variante_destacada.stock ?? 0,
                  dimensiones: row.variante_destacada.dimensiones || null,
                  medidaId: row.variante_destacada.medidaId || null,
                }
              : null;

          const variantes = Array.isArray(row.variantes)
            ? row.variantes.map((variant) => ({
                varianteId: variant.varianteId,
                sku: variant.sku,
                precioUnitario: variant.precioUnitario
                  ? parseFloat(variant.precioUnitario)
                  : null,
                stock: variant.stock ?? 0,
                dimensiones: variant.dimensiones || null,
                medidaId: variant.medidaId || null,
              }))
            : [];

          return {
            productoid: row.productoid,
            nombreproducto: row.nombreproducto,
            descripcion: row.descripcion,
            activo: row.activo === true || row.activo === 't' || row.activo === 1,
            TipoProductoID:
              row.tipoproductoid !== null && row.tipoproductoid !== undefined
                ? Number.parseInt(row.tipoproductoid, 10)
                : null,
            tipoProducto:
              row.tipo_producto !== null && row.tipo_producto !== undefined
                ? String(row.tipo_producto)
                : null,
            stockTotal: parseInt(row.stock_total, 10) || 0,
            variantesCount: parseInt(row.variantes_count, 10) || 0,
            precioDesde: row.precio_desde ? parseFloat(row.precio_desde) : null,
            categoriaNombre: categoriasMap[row.categoriaid] || "Sin categoría",
            imagenUrl: row.url_imagen || null,
            imagenAlt: row.textoalternativo || null,
            varianteDestacada,
            variantes,
          };
        }),
      },
    });
  } catch (error) {
    logger.error('Error al obtener productos:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: "Error en el servidor",
    });
  }
};

/**
 * Crear un nuevo producto
 * 
 * NOTA: Esta función mantiene la transacción manual (BEGIN/COMMIT/ROLLBACK)
 * porque es extremadamente compleja y tiene múltiples validaciones.
 * En futuras iteraciones se puede refactorizar para usar executeTransaction.
 * 
 * @route POST /api/admin/productos
 */
const crearProducto = async (req, res) => {
  const { tenant_id } = req.tenant;
  const {
    nombre,
    sku_maestro,
    descripcion,
    categoriaId,
    reglaid: reglaIdRaw,
    reglaId: reglaIdAlt,
    TipoProductoID: tipoProductoIdRaw,
    tipoProducto,
    TipoProducto: tipoProductoRaw,
    tamanos,
    tamanoIds,
    proveedorId: proveedorIdRaw,
    activo,
    stockTotalInicial: stockTotalInicialRaw,
    venderIndividual: venderIndividualRaw,
    precioUnitarioBase: precioUnitarioBaseRaw,
    precioUnitario: precioUnitarioLegacyRaw,
    variantes: variantesRaw,
    packs,
  } = req.body;

  if (!nombre) {
    return res.status(400).json({
      success: false,
      message: "El nombre del producto es obligatorio",
    });
  }

  const categoriaIdParsed = (() => {
    if (
      categoriaId === undefined ||
      categoriaId === null ||
      String(categoriaId).trim() === ""
    ) {
      return null;
    }
    const parsed = Number.parseInt(categoriaId, 10);
    return Number.isNaN(parsed) ? null : parsed;
  })();

  if (categoriaIdParsed === null) {
    return res.status(400).json({
      success: false,
      message: "Debes seleccionar una categoría para el producto maestro.",
    });
  }

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const proveedorIdRawEffective =
      proveedorIdRaw ??
      req.body?.proveedorid_default ??
      req.body?.proveedorId_Default ??
      req.body?.ProveedorID_Default ??
      req.body?.proveedorid ??
      null;

    let proveedorId = null;
    if (proveedorIdRawEffective !== undefined && proveedorIdRawEffective !== null) {
      const parsed = Number.parseInt(proveedorIdRawEffective, 10);
      if (!Number.isNaN(parsed)) {
        proveedorId = parsed;
      }
    }

    if (proveedorId !== null) {
      const proveedorResult = await client.query(
        "SELECT ProveedorID FROM Proveedores WHERE ProveedorID = $1 AND tenant_id = $2",
        [proveedorId, tenant_id]
      );

      if (proveedorResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "El proveedor predeterminado no existe",
        });
      }
    }

    const activoFinal = activo !== undefined ? Boolean(activo) : true;

    // Determinar reglaId (lógica compleja de validación)
    const reglaId = await (async () => {
      const rawReglaId = reglaIdRaw ?? reglaIdAlt;
      if (rawReglaId !== undefined && rawReglaId !== null && String(rawReglaId).trim() !== "") {
        const parsed = Number.parseInt(rawReglaId, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error("REGLA_ID_INVALIDO");
        }

        const existe = await client.query(
          `SELECT reglaid FROM proveedor_reglas_empaque WHERE reglaid = $1`,
          [parsed]
        );

        if (!existe.rows.length) {
          throw new Error("REGLA_EMPAQUE_NO_EXISTE");
        }

        return parsed;
      }

      const tipoProductoNombre = (() => {
        const raw =
          tipoProducto !== undefined && tipoProducto !== null
            ? tipoProducto
            : tipoProductoRaw;
        if (raw === undefined || raw === null) {
          return null;
        }
        const txt = String(raw).trim();
        return txt.length ? txt : null;
      })();

      const tipoProductoId = await (async () => {
        if (tipoProductoIdRaw !== undefined && tipoProductoIdRaw !== null && String(tipoProductoIdRaw).trim() !== "") {
          const parsed = Number.parseInt(tipoProductoIdRaw, 10);
          if (!Number.isInteger(parsed) || parsed <= 0) {
            throw new Error("TIPO_PRODUCTO_INVALIDO");
          }

          const existe = await client.query(
            `SELECT tipoproductoid
             FROM tipoproducto
             WHERE tipoproductoid = $1
               AND activo = TRUE`,
            [parsed]
          );

          if (!existe.rows.length) {
            throw new Error("TIPO_PRODUCTO_NO_EXISTE");
          }

          return parsed;
        }

        if (tipoProductoNombre) {
          return (
            await client.query(
              `INSERT INTO tipoproducto (nombre, descripcion, activo)
               VALUES ($1, NULL, TRUE)
               ON CONFLICT (nombre)
               DO UPDATE SET activo = TRUE
               RETURNING tipoproductoid`,
              [tipoProductoNombre]
            )
          ).rows[0]?.tipoproductoid ?? null;
        }

        return null;
      })();

      if (tipoProductoId && proveedorId) {
        const reglaRes = await client.query(
          `SELECT reglaid FROM proveedor_reglas_empaque
           WHERE proveedorid = $1 AND tipoproductoid = $2
           LIMIT 1`,
          [proveedorId, tipoProductoId]
        );
        if (reglaRes.rows.length > 0) {
          return reglaRes.rows[0].reglaid;
        }
      }

      return null;
    })();

    const skuMaestroFinal = await generarSkuMaestro(client, {
      categoriaid: categoriaIdParsed,
      nombreProducto: nombre,
    });

    const skuExisteResult = await client.query(
      `SELECT productoid
       FROM productos
       WHERE sku_maestro = $1
       LIMIT 1`,
      [skuMaestroFinal]
    );

    if (skuExisteResult.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `Ya existe un producto con el SKU maestro ${skuMaestroFinal}`,
      });
    }

    // Insertar producto maestro
    const productoResult = await client.query(
      `INSERT INTO Productos (NombreProducto, SKU_Maestro, Descripcion, CategoriaID, Activo, tenant_id, reglaid)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ProductoID, NombreProducto, SKU_Maestro`,
      [nombre, skuMaestroFinal, descripcion || null, categoriaIdParsed, activoFinal, tenant_id, reglaId]
    );

    const productoId = productoResult.rows[0].productoid;

    await client.query("COMMIT");
    transactionStarted = false;

    res.status(201).json({
      success: true,
      message: "Producto creado exitosamente",
      data: {
        productoId,
        nombreProducto: productoResult.rows[0].nombreproducto,
        skuMaestro: productoResult.rows[0].sku_maestro,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    logger.error('❌ [CREAR PRODUCTO] Error:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: error.message || "Error al crear el producto",
    });
  } finally {
    client.release();
  }
};

/**
 * Actualizar un producto existente
 * 
 * NOTA: Mantiene transacción manual por complejidad.
 * 
 * @route PUT /api/admin/productos/:id
 */
const actualizarProducto = async (req, res) => {
  const { tenant_id } = req.tenant;
  const productoId = Number.parseInt(req.params.id, 10);

  if (!Number.isInteger(productoId) || productoId <= 0) {
    return res.status(400).json({
      success: false,
      message: "ID de producto inválido",
    });
  }

  const client = await db.pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const productoExiste = await client.query(
      "SELECT ProductoID FROM Productos WHERE ProductoID = $1 AND tenant_id = $2",
      [productoId, tenant_id]
    );

    if (productoExiste.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const {
      nombre,
      descripcion,
      categoriaId,
      activo,
      reglaid,
    } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (nombre !== undefined) {
      updates.push(`NombreProducto = $${paramIndex++}`);
      values.push(nombre);
    }

    if (descripcion !== undefined) {
      updates.push(`Descripcion = $${paramIndex++}`);
      values.push(descripcion);
    }

    if (categoriaId !== undefined) {
      updates.push(`CategoriaID = $${paramIndex++}`);
      values.push(categoriaId);
    }

    if (activo !== undefined) {
      updates.push(`Activo = $${paramIndex++}`);
      values.push(Boolean(activo));
    }

    if (reglaid !== undefined) {
      updates.push(`reglaid = $${paramIndex++}`);
      values.push(reglaid);
    }

    if (updates.length === 0) {
      await client.query("COMMIT");
      return res.json({
        success: true,
        message: "No hay cambios para actualizar",
      });
    }

    values.push(productoId);
    values.push(tenant_id);

    const updateQuery = `
      UPDATE Productos
      SET ${updates.join(", ")}
      WHERE ProductoID = $${paramIndex++} AND tenant_id = $${paramIndex++}
      RETURNING ProductoID, NombreProducto
    `;

    const result = await client.query(updateQuery, values);

    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      message: "Producto actualizado exitosamente",
      data: {
        productoId: result.rows[0].productoid,
        nombreProducto: result.rows[0].nombreproducto,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }
    logger.error('❌ [ACTUALIZAR PRODUCTO] Error:', {
      error: error.message,
      requestId: req.requestId,
      tenantId: req.tenant?.tenant_id
    });
    res.status(500).json({
      success: false,
      message: error.message || "Error al actualizar el producto",
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllProductos,
  crearProducto,
  actualizarProducto
};
