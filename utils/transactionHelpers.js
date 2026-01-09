/**
 * Transaction Helpers - Atomic Operations with ACID Guarantees
 * 
 * Este módulo proporciona funciones helper para operaciones atómicas
 * que requieren generación de códigos secuenciales (COD-{id}).
 * 
 * Garantiza:
 * - Atomicidad: Todo o nada
 * - Consistencia: Códigos siempre generados
 * - Aislamiento: Transacciones independientes
 * - Durabilidad: COMMIT solo si todo es exitoso
 */

/**
 * Genera un código secuencial con padding
 * 
 * Formatos soportados:
 * - Producto: COD-00042 (COD-{productoid})
 * - Variante: COD-00042-00123 (COD-{productoid}-{varianteid})
 * 
 * @param {number} id - ID numérico del registro principal
 * @param {string} prefix - Prefijo del código (default: 'COD')
 * @param {number} padding - Número de dígitos con padding (default: 5)
 * @param {number} secondaryId - ID secundario opcional (para variantes)
 * @returns {string} Código formateado
 */
function generarCodigoSecuencial(id, prefix = 'COD', padding = 5, secondaryId = null) {
  if (!id || !Number.isInteger(id) || id <= 0) {
    throw new Error(`ID inválido para generar código: ${id}`);
  }
  
  const idStr = String(id).padStart(padding, '0');
  
  // Si hay secondaryId, generar formato COD-{id}-{secondaryId}
  if (secondaryId !== null && secondaryId !== undefined) {
    if (!Number.isInteger(secondaryId) || secondaryId <= 0) {
      throw new Error(`Secondary ID inválido para generar código: ${secondaryId}`);
    }
    const secondaryIdStr = String(secondaryId).padStart(padding, '0');
    return `${prefix}-${idStr}-${secondaryIdStr}`;
  }
  
  // Formato simple: COD-{id}
  return `${prefix}-${idStr}`;
}

/**
 * Crea un producto con transacción atómica y generación de código
 * 
 * FLUJO TRANSACCIONAL:
 * 1. BEGIN TRANSACTION
 * 2. INSERT producto (sin código o con código temporal)
 * 3. Obtener insertId
 * 4. Generar código COD-{insertId}
 * 5. UPDATE producto SET codigo = COD-{insertId}
 * 6. COMMIT (solo si todos los pasos son exitosos)
 * 7. ROLLBACK automático si cualquier paso falla
 * 
 * @param {Object} client - Cliente de base de datos (pg client)
 * @param {Object} productoData - Datos del producto
 * @param {string} productoData.nombreproducto - Nombre del producto
 * @param {string} productoData.sku_maestro - SKU maestro
 * @param {string} productoData.descripcion - Descripción
 * @param {number} productoData.categoriaid - ID de categoría
 * @param {number} productoData.proveedorid_default - ID de proveedor
 * @param {boolean} productoData.activo - Estado activo
 * @param {number} productoData.reglaid - ID de regla de empaque
 * @param {number} productoData.tenant_id - ID del tenant
 * @returns {Object} Producto creado con código generado
 */
async function crearProductoAtomic(client, productoData) {
  const {
    nombreproducto,
    sku_maestro,
    descripcion,
    categoriaid,
    proveedorid_default,
    activo,
    reglaid,
    tenant_id,
    created_by_admin_id
  } = productoData;

  // Validaciones básicas
  if (!nombreproducto) {
    throw new Error('El nombre del producto es obligatorio');
  }
  if (!categoriaid) {
    throw new Error('La categoría es obligatoria');
  }

  try {
    // PASO 1: INSERT del producto (sin código)
    const insertResult = await client.query(
      `INSERT INTO productos (
        nombreproducto, 
        sku_maestro, 
        descripcion, 
        categoriaid, 
        proveedorid_default, 
        activo, 
        reglaid, 
        tenant_id,
        created_by_admin_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING productoid, nombreproducto, sku_maestro, descripcion, categoriaid, 
                proveedorid_default, activo, reglaid, tenant_id`,
      [
        nombreproducto,
        sku_maestro || null,
        descripcion || null,
        categoriaid,
        proveedorid_default || null,
        activo !== undefined ? activo : true,
        reglaid || null,
        tenant_id,
        created_by_admin_id || null
      ]
    );

    const producto = insertResult.rows[0];
    const productoId = producto.productoid;

    // PASO 2: Si no tiene sku_maestro, generar código secuencial
    if (!producto.sku_maestro) {
      const codigoGenerado = generarCodigoSecuencial(productoId, 'COD', 5);

      // PASO 3: Actualizar el producto con el código generado
      const updateResult = await client.query(
        `UPDATE productos 
         SET sku_maestro = $1
         WHERE productoid = $2
         RETURNING productoid, nombreproducto, sku_maestro, descripcion, categoriaid, 
                   proveedorid_default, activo, reglaid, tenant_id`,
        [codigoGenerado, productoId]
      );

      if (updateResult.rows.length === 0) {
        throw new Error('Error al actualizar el sku_maestro del producto');
      }

      return updateResult.rows[0];
    }

    // Si ya tenía sku_maestro, retornar el producto tal cual
    return producto;
  } catch (error) {
    // El ROLLBACK será manejado por el caller
    throw error;
  }
}

/**
 * Crea una variante con transacción atómica y generación de código
 * 
 * FLUJO TRANSACCIONAL:
 * 1. BEGIN TRANSACTION
 * 2. INSERT variante (sin código o con SKU temporal)
 * 3. Obtener insertId
 * 4. Generar código VAR-{insertId}
 * 5. UPDATE variante SET sku = VAR-{insertId} (si no tenía SKU)
 * 6. COMMIT (solo si todos los pasos son exitosos)
 * 7. ROLLBACK automático si cualquier paso falla
 * 
 * @param {Object} client - Cliente de base de datos (pg client)
 * @param {Object} varianteData - Datos de la variante
 * @param {number} varianteData.productoid - ID del producto padre
 * @param {string} varianteData.sku - SKU de la variante (opcional, se genera si no existe)
 * @param {string} varianteData.dimensiones - Dimensiones
 * @param {number} varianteData.costounitario - Costo unitario
 * @param {number} varianteData.stock - Stock inicial
 * @param {number} varianteData.tipoproductoid - ID tipo producto
 * @param {number} varianteData.medidaid - ID medida
 * @param {number} varianteData.preciounitario - Precio unitario
 * @param {number} varianteData.precioofertaunitario - Precio oferta
 * @param {string} varianteData.color_nombre - Nombre del color
 * @param {string} varianteData.color_hex - Código hexadecimal del color
 * @param {boolean} varianteData.activo - Estado activo
 * @param {number} varianteData.piezasporpaquete - Piezas por paquete
 * @param {number} varianteData.tenant_id - ID del tenant
 * @returns {Object} Variante creada con código generado
 */
async function crearVarianteAtomic(client, varianteData) {
  const {
    productoid,
    sku,
    dimensiones,
    costounitario,
    stock,
    tipoproductoid,
    medidaid,
    preciounitario,
    precioofertaunitario,
    color_nombre,
    color_hex,
    activo,
    piezasporpaquete,
    tenant_id
  } = varianteData;

  // Validaciones básicas
  if (!productoid) {
    throw new Error('El ID del producto es obligatorio');
  }
  if (costounitario === undefined || costounitario === null) {
    throw new Error('El costo unitario es obligatorio');
  }

  try {
    // PASO 1: INSERT de la variante (con o sin SKU)
    const insertResult = await client.query(
      `INSERT INTO producto_variantes (
        productoid,
        sku,
        dimensiones,
        costounitario,
        stock,
        tipoproductoid,
        medidaid,
        preciounitario,
        precioofertaunitario,
        color_nombre,
        color_hex,
        activo,
        piezasporpaquete,
        tenant_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING varianteid, productoid, sku, dimensiones, costounitario, stock, 
                tipoproductoid, medidaid, preciounitario, precioofertaunitario, 
                color_nombre, color_hex, activo, piezasporpaquete, tenant_id`,
      [
        productoid,
        sku || null, // Permitir null temporalmente
        dimensiones || null,
        costounitario,
        stock !== undefined ? stock : 0,
        tipoproductoid || null,
        medidaid || null,
        preciounitario || null,
        precioofertaunitario || null,
        color_nombre || null,
        color_hex || null,
        activo !== undefined ? activo : true,
        piezasporpaquete !== undefined ? piezasporpaquete : 1,
        tenant_id
      ]
    );

    const variante = insertResult.rows[0];
    const varianteId = variante.varianteid;

    // PASO 2: Si no se proporcionó SKU, generar uno secuencial
    // Formato: COD-{productoid}-{varianteid}
    if (!sku) {
      const codigoGenerado = generarCodigoSecuencial(productoid, 'COD', 5, varianteId);

      // PASO 3: Actualizar la variante con el SKU generado
      const updateResult = await client.query(
        `UPDATE producto_variantes 
         SET sku = $1
         WHERE varianteid = $2
         RETURNING varianteid, productoid, sku, dimensiones, costounitario, stock, 
                   tipoproductoid, medidaid, preciounitario, precioofertaunitario, 
                   color_nombre, color_hex, activo, piezasporpaquete, tenant_id`,
        [codigoGenerado, varianteId]
      );

      if (updateResult.rows.length === 0) {
        throw new Error('Error al actualizar el SKU de la variante');
      }

      return updateResult.rows[0];
    }

    return variante;
  } catch (error) {
    // El ROLLBACK será manejado por el caller
    throw error;
  }
}

/**
 * Wrapper para ejecutar una operación dentro de una transacción
 * Maneja automáticamente BEGIN, COMMIT y ROLLBACK
 * 
 * @param {Object} client - Cliente de base de datos (pg client)
 * @param {Function} operation - Función async que ejecuta la operación
 * @returns {*} Resultado de la operación
 */
async function executeInTransaction(client, operation) {
  let transactionStarted = false;
  
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    
    const result = await operation(client);
    
    await client.query('COMMIT');
    transactionStarted = false;
    
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error en ROLLBACK:', rollbackError);
      }
    }
    throw error;
  }
}

module.exports = {
  generarCodigoSecuencial,
  crearProductoAtomic,
  crearVarianteAtomic,
  executeInTransaction
};
