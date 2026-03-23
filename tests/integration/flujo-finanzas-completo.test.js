/**
 * TEST SUITE COMPLETO - FLUJO OPERATIVO FINANZAS
 * 
 * Prueba el ciclo completo de generación, revisión y confirmación de remisiones
 * con integración a inventarios, CxC, historial y backorders
 * 
 * @module tests/integration/flujo-finanzas-completo
 */

const request = require('supertest');
const app = require('../../index');
const { pool } = require('../../db');

describe.skip('Flujo Operativo Finanzas - Ciclo Completo', () => {
  let tokenFinanzas;
  let tokenInventarios;
  let tokenCliente;
  let pedidoId;
  let remisionId;
  let clienteId;
  let varianteId;

  beforeAll(async () => {
    // Setup: Crear tokens de autenticación para diferentes roles
    // Implementar según tu sistema de autenticación
  });

  afterAll(async () => {
    // Cleanup: Cerrar conexiones
    await pool.end();
  });

  describe('1. GENERACIÓN DE REMISIÓN', () => {
    
    test('1.1 Debe generar remisión con stock suficiente', async () => {
      const response = await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          pedido_id: pedidoId,
          items_a_surtir: [
            {
              detalle_pedido_id: 1,
              cantidad_paquetes: 10
            }
          ],
          notas: 'Test - Surtido completo',
          emitir_inmediatamente: true
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.remision).toHaveProperty('remision_id');
      expect(response.body.remision.estado).toBe('PENDIENTE_REVISION');
      expect(response.body.remision.cxc_generado).toBe(false);

      remisionId = response.body.remision.remision_id;
    });

    test('1.2 Debe manejar backorder automáticamente con stock insuficiente', async () => {
      // Reducir stock artificialmente para forzar backorder
      await pool.query(
        'UPDATE producto_variantes SET stock = 5 WHERE varianteid = $1',
        [varianteId]
      );

      const response = await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          pedido_id: pedidoId,
          items_a_surtir: [
            {
              detalle_pedido_id: 2,
              cantidad_paquetes: 10 // Solicita 10 pero solo hay 5
            }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      
      // Verificar que se creó backorder
      const pedido = await pool.query(
        'SELECT monto_backorder FROM pedidos WHERE pedidoid = $1',
        [pedidoId]
      );
      expect(parseFloat(pedido.rows[0].monto_backorder)).toBeGreaterThan(0);
    });

    test('1.3 Debe rechazar si no hay stock (todo backorder)', async () => {
      await pool.query(
        'UPDATE producto_variantes SET stock = 0 WHERE varianteid = $1',
        [varianteId]
      );

      const response = await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          pedido_id: pedidoId,
          items_a_surtir: [
            {
              detalle_pedido_id: 3,
              cantidad_paquetes: 10
            }
          ]
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No hay stock disponible');
    });

    test('1.4 Debe rechazar si usuario no tiene permisos', async () => {
      const response = await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenCliente}`)
        .send({
          pedido_id: pedidoId,
          items_a_surtir: []
        });

      expect(response.status).toBe(403);
    });

    test('1.5 NO debe afectar stock al generar', async () => {
      const stockAntes = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1',
        [varianteId]
      );

      await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          pedido_id: pedidoId,
          items_a_surtir: [
            { detalle_pedido_id: 4, cantidad_paquetes: 5 }
          ]
        });

      const stockDespues = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1',
        [varianteId]
      );

      expect(stockDespues.rows[0].cantidad).toBe(stockAntes.rows[0].cantidad);
    });

    test('1.6 NO debe generar CxC al generar', async () => {
      const cxcAntes = await pool.query(
        'SELECT COUNT(*) FROM cuentas_por_cobrar WHERE cliente_id = $1',
        [clienteId]
      );

      await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          pedido_id: pedidoId,
          items_a_surtir: [
            { detalle_pedido_id: 5, cantidad_paquetes: 3 }
          ]
        });

      const cxcDespues = await pool.query(
        'SELECT COUNT(*) FROM cuentas_por_cobrar WHERE cliente_id = $1',
        [clienteId]
      );

      expect(parseInt(cxcDespues.rows[0].count)).toBe(parseInt(cxcAntes.rows[0].count));
    });
  });

  describe('2. CONFIRMACIÓN POR ALMACÉN', () => {
    
    test('2.1 Debe confirmar remisión por almacenista', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${remisionId}/confirmar-almacen`)
        .set('Authorization', `Bearer ${tokenInventarios}`)
        .send({
          notas_almacen: 'Verificado físicamente. Todo correcto.'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.remision.estado).toBe('PENDIENTE_CONFIRMACION_FINANZAS');
    });

    test('2.2 Debe registrar en historial', async () => {
      const historial = await pool.query(
        `SELECT * FROM historial_remisiones 
         WHERE remision_id = $1 AND accion = 'CONFIRMACION_ALMACEN'`,
        [remisionId]
      );

      expect(historial.rows.length).toBeGreaterThan(0);
    });

    test('2.3 NO debe afectar stock al confirmar almacén', async () => {
      const stockAntes = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1',
        [varianteId]
      );

      await request(app)
        .post(`/api/remisiones/${remisionId}/confirmar-almacen`)
        .set('Authorization', `Bearer ${tokenInventarios}`)
        .send({
          notas_almacen: 'Test'
        });

      const stockDespues = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1',
        [varianteId]
      );

      expect(stockDespues.rows[0].cantidad).toBe(stockAntes.rows[0].cantidad);
    });

    test('2.4 Debe rechazar si estado es incorrecto', async () => {
      // Cambiar estado manualmente
      await pool.query(
        'UPDATE remisiones SET estado = $1 WHERE remision_id = $2',
        ['SURTIDO', remisionId]
      );

      const response = await request(app)
        .post(`/api/remisiones/${remisionId}/confirmar-almacen`)
        .set('Authorization', `Bearer ${tokenInventarios}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('No se puede confirmar');

      // Restaurar estado
      await pool.query(
        'UPDATE remisiones SET estado = $1 WHERE remision_id = $2',
        ['PENDIENTE_CONFIRMACION_FINANZAS', remisionId]
      );
    });
  });

  describe('3. CONFIRMACIÓN POR FINANZAS (CRÍTICO)', () => {
    
    test('3.1 Debe confirmar remisión y afectar stock', async () => {
      const stockAntes = await pool.query(
        'SELECT cantidad, cantidad_reservada FROM stock_admin WHERE variante_id = $1',
        [varianteId]
      );

      const response = await request(app)
        .post(`/api/remisiones/${remisionId}/confirmar-finanzas`)
        .set('Authorization', `Bearer ${tokenFinanzas}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.remision.estado).toBe('SURTIDO');
      expect(response.body.remision.cxc_generado).toBe(true);

      const stockDespues = await pool.query(
        'SELECT cantidad, cantidad_reservada FROM stock_admin WHERE variante_id = $1',
        [varianteId]
      );

      // Stock debe haberse descontado
      expect(stockDespues.rows[0].cantidad).toBeLessThan(stockAntes.rows[0].cantidad);
    });

    test('3.2 Debe registrar en Kardex', async () => {
      const kardex = await pool.query(
        `SELECT * FROM kardex_inventario 
         WHERE variante_id = $1 
         AND tipo = 'SALIDA' 
         AND motivo = 'VENTA'
         ORDER BY fecha_movimiento DESC
         LIMIT 1`,
        [varianteId]
      );

      expect(kardex.rows.length).toBe(1);
      expect(kardex.rows[0].referencia_tipo).toBe('REMISION');
    });

    test('3.3 Debe generar CxC si es crédito', async () => {
      const cxc = await pool.query(
        `SELECT * FROM cuentas_por_cobrar 
         WHERE remision_id = $1 
         AND tipo_movimiento = 'CARGO'`,
        [remisionId]
      );

      expect(cxc.rows.length).toBe(1);
      expect(parseFloat(cxc.rows[0].monto)).toBeGreaterThan(0);
    });

    test('3.4 Debe actualizar saldo deudor del cliente', async () => {
      const credito = await pool.query(
        'SELECT saldo_deudor FROM cliente_creditos WHERE cliente_id = $1',
        [clienteId]
      );

      expect(parseFloat(credito.rows[0].saldo_deudor)).toBeGreaterThan(0);
    });

    test('3.5 Debe registrar movimientos de crédito (AJUSTE + CARGO)', async () => {
      const movimientos = await pool.query(
        `SELECT tipo_movimiento, monto FROM credito_movimientos 
         WHERE referencia_id LIKE $1
         ORDER BY fecha_movimiento DESC
         LIMIT 2`,
        [`%${remisionId}%`]
      );

      expect(movimientos.rows.length).toBe(2);
      
      const tipos = movimientos.rows.map(m => m.tipo_movimiento);
      expect(tipos).toContain('AJUSTE');
      expect(tipos).toContain('CARGO');
    });

    test('3.6 Debe registrar en historial', async () => {
      const historial = await pool.query(
        `SELECT * FROM historial_remisiones 
         WHERE remision_id = $1 AND accion = 'CONFIRMACION_FINANZAS'`,
        [remisionId]
      );

      expect(historial.rows.length).toBe(1);
    });

    test('3.7 Debe registrar en log de auditoría', async () => {
      const log = await pool.query(
        `SELECT * FROM inventario_reservas_log 
         WHERE variante_id = $1 
         AND accion = 'CONFIRMAR_FINANZAS'
         ORDER BY created_at DESC
         LIMIT 1`,
        [varianteId]
      );

      expect(log.rows.length).toBe(1);
    });

    test('3.8 Debe rechazar si estado es incorrecto', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${remisionId}/confirmar-finanzas`)
        .set('Authorization', `Bearer ${tokenFinanzas}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Se requiere PENDIENTE_CONFIRMACION_FINANZAS');
    });
  });

  describe('4. RECHAZO POR FINANZAS', () => {
    let remisionRechazadaId;

    beforeAll(async () => {
      // Crear nueva remisión para rechazar
      const res = await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          pedido_id: pedidoId,
          items_a_surtir: [{ detalle_pedido_id: 6, cantidad_paquetes: 2 }]
        });
      
      remisionRechazadaId = res.body.remision.remision_id;

      // Confirmar por almacén
      await request(app)
        .post(`/api/remisiones/${remisionRechazadaId}/confirmar-almacen`)
        .set('Authorization', `Bearer ${tokenInventarios}`)
        .send({ notas_almacen: 'Test' });
    });

    test('4.1 Debe rechazar remisión y regresar a almacén', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${remisionRechazadaId}/rechazar-finanzas`)
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          observaciones_finanzas: 'Discrepancia en cantidad de SKU-123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.remision.estado).toBe('REVISION_ALMACEN');
    });

    test('4.2 Debe registrar observaciones de finanzas', async () => {
      const remision = await pool.query(
        'SELECT observaciones_finanzas FROM remisiones WHERE remision_id = $1',
        [remisionRechazadaId]
      );

      expect(remision.rows[0].observaciones_finanzas).toContain('Discrepancia');
    });

    test('4.3 Debe rechazar si faltan observaciones', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${remisionRechazadaId}/rechazar-finanzas`)
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Se requieren observaciones');
    });

    test('4.4 NO debe afectar stock al rechazar', async () => {
      const stockAntes = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1',
        [varianteId]
      );

      await request(app)
        .post(`/api/remisiones/${remisionRechazadaId}/rechazar-finanzas`)
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({ observaciones_finanzas: 'Test' });

      const stockDespues = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1',
        [varianteId]
      );

      expect(stockDespues.rows[0].cantidad).toBe(stockAntes.rows[0].cantidad);
    });
  });

  describe('5. CORRECCIÓN DE REMISIÓN', () => {
    
    test('5.1 Debe corregir cantidades de items', async () => {
      const response = await request(app)
        .put(`/api/remisiones/${remisionId}/corregir`)
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          items_corregir: [
            {
              detalle_remision_id: 1,
              nueva_cantidad_paquetes: 8
            }
          ],
          motivo_correccion: 'Ajuste por conteo físico'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('5.2 Debe recalcular totales', async () => {
      const remision = await pool.query(
        'SELECT total_remision FROM remisiones WHERE remision_id = $1',
        [remisionId]
      );

      expect(parseFloat(remision.rows[0].total_remision)).toBeGreaterThan(0);
    });
  });

  describe('6. CANCELACIÓN DE REMISIÓN', () => {
    let remisionCanceladaId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          pedido_id: pedidoId,
          items_a_surtir: [{ detalle_pedido_id: 7, cantidad_paquetes: 3 }]
        });
      
      remisionCanceladaId = res.body.remision.remision_id;
    });

    test('6.1 Debe cancelar remisión', async () => {
      const response = await request(app)
        .put(`/api/remisiones/${remisionCanceladaId}/cancelar`)
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({
          motivo: 'Cliente canceló pedido'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('6.2 Debe revertir cantidad surtida en pedido', async () => {
      const detalle = await pool.query(
        `SELECT cantidad_surtida_remisiones 
         FROM detallesdelpedido 
         WHERE detalleid = 7`
      );

      expect(parseInt(detalle.rows[0].cantidad_surtida_remisiones)).toBe(0);
    });

    test('6.3 Debe devolver stock si ya fue descontado', async () => {
      // Este test requiere que la remisión haya sido confirmada primero
      // Implementar según flujo específico
    });

    test('6.4 Debe registrar en Kardex (ENTRADA)', async () => {
      const kardex = await pool.query(
        `SELECT * FROM kardex_inventario 
         WHERE referencia_tipo = 'CANCELACION_REMISION'
         AND referencia_id = $1`,
        [remisionCanceladaId.toString()]
      );

      expect(kardex.rows.length).toBeGreaterThan(0);
    });
  });

  describe('7. LISTADO Y CONSULTAS', () => {
    
    test('7.1 Debe listar remisiones con filtros', async () => {
      const response = await request(app)
        .get('/api/remisiones')
        .query({ estado: 'SURTIDO', page: 1, limit: 10 })
        .set('Authorization', `Bearer ${tokenFinanzas}`);

      expect(response.status).toBe(200);
      expect(response.body.remisiones).toBeInstanceOf(Array);
      expect(response.body.pagination).toHaveProperty('total');
    });

    test('7.2 Debe obtener detalle de remisión', async () => {
      const response = await request(app)
        .get(`/api/remisiones/${remisionId}`)
        .set('Authorization', `Bearer ${tokenFinanzas}`);

      expect(response.status).toBe(200);
      expect(response.body.remision_id).toBe(remisionId);
      expect(response.body.detalles).toBeInstanceOf(Array);
    });

    test('7.3 Debe obtener items pendientes de surtir', async () => {
      const response = await request(app)
        .get(`/api/remisiones/pedido/${pedidoId}/pendiente`)
        .set('Authorization', `Bearer ${tokenFinanzas}`);

      expect(response.status).toBe(200);
      expect(response.body.items_pendientes).toBeInstanceOf(Array);
    });
  });

  describe('8. GENERACIÓN DE FACTURA', () => {
    
    test('8.1 Debe generar factura PDF para pedido surtido', async () => {
      const response = await request(app)
        .get(`/api/pedidos/${pedidoId}/factura`)
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('8.2 Debe rechazar factura si no hay remisiones surtidas', async () => {
      // Crear pedido sin remisiones
      const pedidoSinRemisiones = 999;

      const response = await request(app)
        .get(`/api/pedidos/${pedidoSinRemisiones}/factura`)
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('remisión confirmada');
    });
  });

  describe('9. PERMISOS Y SEGURIDAD', () => {
    
    test('9.1 Cliente NO debe poder generar remisión', async () => {
      const response = await request(app)
        .post('/api/remisiones/generar')
        .set('Authorization', `Bearer ${tokenCliente}`)
        .send({});

      expect(response.status).toBe(403);
    });

    test('9.2 Cliente NO debe poder confirmar finanzas', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${remisionId}/confirmar-finanzas`)
        .set('Authorization', `Bearer ${tokenCliente}`);

      expect(response.status).toBe(403);
    });

    test('9.3 Inventarios NO debe poder confirmar finanzas', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${remisionId}/confirmar-finanzas`)
        .set('Authorization', `Bearer ${tokenInventarios}`);

      expect(response.status).toBe(403);
    });

    test('9.4 Finanzas NO debe poder confirmar almacén', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${remisionId}/confirmar-almacen`)
        .set('Authorization', `Bearer ${tokenFinanzas}`)
        .send({});

      expect(response.status).toBe(403);
    });
  });

  describe('10. INTEGRIDAD DE DATOS', () => {
    
    test('10.1 Monto surtido + Monto backorder = Monto total pedido', async () => {
      const pedido = await pool.query(
        `SELECT montototal, monto_surtido, monto_backorder 
         FROM pedidos 
         WHERE pedidoid = $1`,
        [pedidoId]
      );

      const total = parseFloat(pedido.rows[0].montototal);
      const surtido = parseFloat(pedido.rows[0].monto_surtido || 0);
      const backorder = parseFloat(pedido.rows[0].monto_backorder || 0);

      expect(Math.abs((surtido + backorder) - total)).toBeLessThan(0.01);
    });

    test('10.2 Suma de remisiones = Monto surtido del pedido', async () => {
      const remisiones = await pool.query(
        `SELECT SUM(total_remision) as total_remisiones 
         FROM remisiones 
         WHERE pedido_id = $1 AND estado = 'SURTIDO'`,
        [pedidoId]
      );

      const pedido = await pool.query(
        'SELECT monto_surtido FROM pedidos WHERE pedidoid = $1',
        [pedidoId]
      );

      const totalRemisiones = parseFloat(remisiones.rows[0].total_remisiones || 0);
      const montoSurtido = parseFloat(pedido.rows[0].monto_surtido || 0);

      expect(Math.abs(totalRemisiones - montoSurtido)).toBeLessThan(0.01);
    });

    test('10.3 CxC generado = Total de remisiones confirmadas', async () => {
      const cxc = await pool.query(
        `SELECT SUM(monto) as total_cxc 
         FROM cuentas_por_cobrar 
         WHERE cliente_id = $1 AND tipo_movimiento = 'CARGO'`,
        [clienteId]
      );

      const remisiones = await pool.query(
        `SELECT SUM(total_remision) as total_remisiones 
         FROM remisiones 
         WHERE cliente_id = $1 AND estado = 'SURTIDO'`,
        [clienteId]
      );

      const totalCxC = parseFloat(cxc.rows[0].total_cxc || 0);
      const totalRemisiones = parseFloat(remisiones.rows[0].total_remisiones || 0);

      expect(Math.abs(totalCxC - totalRemisiones)).toBeLessThan(0.01);
    });
  });
});
