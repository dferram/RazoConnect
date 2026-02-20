const db = require('../db');

const favoritosController = {
  async toggleFavorito(req, res) {
    const client = await db.pool.connect();
    try {
      const { varianteId } = req.body;
      const clienteId = req.user.id;
      const { tenant_id } = req.tenant;

      if (!varianteId) {
        return res.status(400).json({ message: 'varianteId es requerido' });
      }

      await client.query('BEGIN');

      const existeQuery = `
        SELECT favorito_id, alerta_restock_activa 
        FROM clientes_favoritos 
        WHERE cliente_id = $1 AND variante_id = $2 AND tenant_id = $3
      `;
      const existeResult = await client.query(existeQuery, [clienteId, varianteId, tenant_id]);

      if (existeResult.rows.length > 0) {
        const deleteQuery = `
          DELETE FROM clientes_favoritos 
          WHERE favorito_id = $1
          RETURNING favorito_id
        `;
        await client.query(deleteQuery, [existeResult.rows[0].favorito_id]);
        
        await client.query('COMMIT');
        return res.json({ 
          message: 'Producto eliminado de favoritos',
          action: 'removed',
          esFavorito: false
        });
      }

      const stockQuery = `
        SELECT COALESCE(SUM(cantidad), 0) as stock_total
        FROM stock_admin
        WHERE variante_id = $1 AND tenant_id = $2
      `;
      const stockResult = await client.query(stockQuery, [varianteId, tenant_id]);
      const stockTotal = parseInt(stockResult.rows[0].stock_total) || 0;

      const alertaActiva = stockTotal <= 0;

      const insertQuery = `
        INSERT INTO clientes_favoritos (cliente_id, variante_id, alerta_restock_activa, tenant_id)
        VALUES ($1, $2, $3, $4)
        RETURNING favorito_id, alerta_restock_activa
      `;
      const insertResult = await client.query(insertQuery, [clienteId, varianteId, alertaActiva, tenant_id]);

      await client.query('COMMIT');

      return res.json({
        message: alertaActiva 
          ? 'Producto agregado a favoritos. Te notificaremos cuando vuelva a estar disponible.'
          : 'Producto agregado a favoritos',
        action: 'added',
        esFavorito: true,
        alertaActiva: insertResult.rows[0].alerta_restock_activa
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ [FAVORITOS] Error en toggleFavorito:', error);
      res.status(500).json({ message: 'Error al gestionar favorito', error: error.message });
    } finally {
      client.release();
    }
  },

  async obtenerFavoritos(req, res) {
    try {
      const clienteId = req.user.id;
      const { tenant_id } = req.tenant;

      const query = `
        SELECT 
          cf.favorito_id,
          cf.variante_id,
          cf.alerta_restock_activa,
          cf.fecha_agregado,
          pv.sku,
          pv.dimensiones,
          pv.preciounitario,
          pv.precioofertaunitario,
          pv.color_nombre,
          pv.color_hex,
          pv.piezasporpaquete,
          p.productoid,
          p.nombreproducto,
          p.descripcion,
          COALESCE(SUM(sa.cantidad), 0) as stock_disponible,
          (
            SELECT url_imagen 
            FROM producto_variante_imagenes 
            WHERE varianteid = pv.varianteid 
            ORDER BY imagenid 
            LIMIT 1
          ) as imagen_url,
          (
            SELECT url_imagen 
            FROM producto_imagenes 
            WHERE productoid = p.productoid 
            ORDER BY imagenid 
            LIMIT 1
          ) as imagen_producto_url
        FROM clientes_favoritos cf
        INNER JOIN producto_variantes pv ON cf.variante_id = pv.varianteid
        INNER JOIN productos p ON pv.productoid = p.productoid
        LEFT JOIN stock_admin sa ON pv.varianteid = sa.variante_id AND sa.tenant_id = cf.tenant_id
        WHERE cf.cliente_id = $1 AND cf.tenant_id = $2
        GROUP BY 
          cf.favorito_id, cf.variante_id, cf.alerta_restock_activa, cf.fecha_agregado,
          pv.varianteid, pv.sku, pv.dimensiones, pv.preciounitario, pv.precioofertaunitario,
          pv.color_nombre, pv.color_hex, pv.piezasporpaquete,
          p.productoid, p.nombreproducto, p.descripcion
        ORDER BY cf.fecha_agregado DESC
      `;

      const result = await db.pool.query(query, [clienteId, tenant_id]);

      const favoritos = result.rows.map(row => ({
        favoritoId: row.favorito_id,
        varianteId: row.variante_id,
        alertaRestockActiva: row.alerta_restock_activa,
        fechaAgregado: row.fecha_agregado,
        sku: row.sku,
        dimensiones: row.dimensiones,
        precioUnitario: parseFloat(row.preciounitario),
        precioOferta: row.precioofertaunitario ? parseFloat(row.precioofertaunitario) : null,
        colorNombre: row.color_nombre,
        colorHex: row.color_hex,
        piezasPorPaquete: row.piezasporpaquete,
        productoId: row.productoid,
        nombreProducto: row.nombreproducto,
        descripcion: row.descripcion,
        stockDisponible: parseInt(row.stock_disponible),
        imagenUrl: row.imagen_url || row.imagen_producto_url || '/icon/Logo_Razo.png',
        disponible: parseInt(row.stock_disponible) > 0
      }));

      res.json({ favoritos });

    } catch (error) {
      console.error('❌ [FAVORITOS] Error en obtenerFavoritos:', error);
      res.status(500).json({ message: 'Error al obtener favoritos', error: error.message });
    }
  },

  async verificarFavorito(req, res) {
    try {
      const { varianteId } = req.params;
      const clienteId = req.user.id;
      const { tenant_id } = req.tenant;

      const query = `
        SELECT favorito_id, alerta_restock_activa
        FROM clientes_favoritos
        WHERE cliente_id = $1 AND variante_id = $2 AND tenant_id = $3
      `;
      const result = await db.pool.query(query, [clienteId, varianteId, tenant_id]);

      res.json({
        esFavorito: result.rows.length > 0,
        alertaActiva: result.rows.length > 0 ? result.rows[0].alerta_restock_activa : false
      });

    } catch (error) {
      console.error('❌ [FAVORITOS] Error en verificarFavorito:', error);
      res.status(500).json({ message: 'Error al verificar favorito', error: error.message });
    }
  },

  async contarNotificacionesRestock(req, res) {
    try {
      const clienteId = req.user.id;
      const { tenant_id } = req.tenant;

      const query = `
        SELECT COUNT(*) as total
        FROM notificaciones
        WHERE clienteid = $1 
          AND tipo = 'restock' 
          AND leida = false
          AND tenant_id = $2
      `;
      const result = await db.pool.query(query, [clienteId, tenant_id]);

      res.json({ 
        count: parseInt(result.rows[0].total) || 0 
      });

    } catch (error) {
      console.error('❌ [FAVORITOS] Error en contarNotificacionesRestock:', error);
      res.status(500).json({ message: 'Error al contar notificaciones', error: error.message });
    }
  },

  async marcarNotificacionesLeidas(req, res) {
    try {
      const clienteId = req.user.id;
      const { tenant_id } = req.tenant;

      const query = `
        UPDATE notificaciones
        SET leida = true
        WHERE clienteid = $1 
          AND tipo = 'restock' 
          AND leida = false
          AND tenant_id = $2
        RETURNING notificacionid
      `;
      const result = await db.pool.query(query, [clienteId, tenant_id]);

      res.json({ 
        message: 'Notificaciones marcadas como leídas',
        count: result.rows.length
      });

    } catch (error) {
      console.error('❌ [FAVORITOS] Error en marcarNotificacionesLeidas:', error);
      res.status(500).json({ message: 'Error al marcar notificaciones', error: error.message });
    }
  }
};

module.exports = favoritosController;
