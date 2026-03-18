/**
 * Tests para el flujo de confirmación Finance-Warehouse
 * 
 * Este archivo contiene tests para validar:
 * 1. Flujo de confirmación de almacén
 * 2. Flujo de confirmación de finanzas
 * 3. Flujo de rechazo de finanzas
 * 4. Validaciones de permisos
 * 5. Validaciones de estados
 * 6. Descuento de stock y generación de CxC
 */

const request = require('supertest');
const app = require('../index');
const pool = require('../db');

describe('Finance-Warehouse Workflow', () => {
  let adminToken;
  let finanzasToken;
  let inventariosToken;
  let secretariaToken;
  let testTenantId;
  let testPedidoId;
  let testRemisionId;
  let testClienteId;
  let testVarianteId;

  beforeAll(async () => {
    // Setup: Crear tenant de prueba
    const tenantResult = await pool.query(
      `INSERT INTO tenants (nombre, dominio, is_active) 
       VALUES ('Test Tenant', 'test.local', true) 
       RETURNING tenant_id`
    );
    testTenantId = tenantResult.rows[0].tenant_id;

    // Crear usuarios de prueba
    const adminResult = await pool.query(
      `INSERT INTO administradores (nombre, email, password, rol, tenant_id)
       VALUES ('Admin Test', 'admin@test.local', 'hashed_password', 'admin', $1)
       RETURNING adminid`,
      [testTenantId]
    );

    const finanzasResult = await pool.query(
      `INSERT INTO administradores (nombre, email, password, rol, tenant_id)
       VALUES ('Finanzas Test', 'finanzas@test.local', 'hashed_password', 'finanzas', $1)
       RETURNING adminid`,
      [testTenantId]
    );

    const inventariosResult = await pool.query(
      `INSERT INTO administradores (nombre, email, password, rol, tenant_id)
       VALUES ('Inventarios Test', 'inventarios@test.local', 'hashed_password', 'inventarios', $1)
       RETURNING adminid`,
      [testTenantId]
    );

    const secretariaResult = await pool.query(
      `INSERT INTO administradores (nombre, email, password, rol, tenant_id)
       VALUES ('Secretaria Test', 'secretaria@test.local', 'hashed_password', 'secretaria', $1)
       RETURNING adminid`,
      [testTenantId]
    );

    // Crear tokens de prueba (simplificado - en producción usar JWT real)
    adminToken = 'test_admin_token';
    finanzasToken = 'test_finanzas_token';
    inventariosToken = 'test_inventarios_token';
    secretariaToken = 'test_secretaria_token';

    // Crear cliente de prueba
    const clienteResult = await pool.query(
      `INSERT INTO clientes (nombre, email, tenant_id)
       VALUES ('Cliente Test', 'cliente@test.local', $1)
       RETURNING clienteid`,
      [testTenantId]
    );
    testClienteId = clienteResult.rows[0].clienteid;

    // Crear producto y variante de prueba
    const productoResult = await pool.query(
      `INSERT INTO productos (nombre, tenant_id)
       VALUES ('Producto Test', $1)
       RETURNING productoid`,
      [testTenantId]
    );

    const varianteResult = await pool.query(
      `INSERT INTO producto_variantes (productoid, sku, nombre, tenant_id)
       VALUES ($1, 'TEST-SKU-001', 'Variante Test', $2)
       RETURNING varianteid`,
      [productoResult.rows[0].productoid, testTenantId]
    );
    testVarianteId = varianteResult.rows[0].varianteid;

    // Crear stock de prueba
    await pool.query(
      `INSERT INTO stock_admin (variante_id, admin_id, cantidad, cantidad_reservada, tenant_id)
       VALUES ($1, 1, 100, 0, $2)`,
      [testVarianteId, testTenantId]
    );
  });

  afterAll(async () => {
    // Cleanup: Eliminar datos de prueba
    await pool.query('DELETE FROM tenants WHERE tenant_id = $1', [testTenantId]);
    await pool.end();
  });

  describe('1. Flujo de Almacén - Marcar Pedido como Listo', () => {
    beforeEach(async () => {
      // Crear pedido de prueba
      const pedidoResult = await pool.query(
        `INSERT INTO pedidos (clienteid, estatus, montototal, tenant_id)
         VALUES ($1, 'Pendiente', 1000.00, $2)
         RETURNING pedidoid`,
        [testClienteId, testTenantId]
      );
      testPedidoId = pedidoResult.rows[0].pedidoid;

      // Agregar detalle al pedido
      await pool.query(
        `INSERT INTO detallesdelpedido (pedidoid, varianteid, cantidadpaquetes, piezastotales, preciounitario, esbackorder, tenant_id)
         VALUES ($1, $2, 5, 50, 20.00, false, $3)`,
        [testPedidoId, testVarianteId, testTenantId]
      );
    });

    test('Debe permitir a inventarios marcar pedido como listo', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/surtir`)
        .set('Authorization', `Bearer ${inventariosToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.estatus).toBe('Pendiente de confirmación');
      expect(response.body.message).toContain('Stock NO afectado');

      // Verificar que el stock NO fue afectado
      const stockResult = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );
      expect(stockResult.rows[0].cantidad).toBe(100); // Stock sin cambios
    });

    test('Debe rechazar si el usuario no tiene permisos', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/surtir`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('Debe rechazar si el pedido no está en estado válido', async () => {
      // Cambiar estado a Surtido
      await pool.query(
        'UPDATE pedidos SET estatus = $1 WHERE pedidoid = $2',
        ['Surtido', testPedidoId]
      );

      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/surtir`)
        .set('Authorization', `Bearer ${inventariosToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('2. Flujo de Finanzas - Confirmar Pedido', () => {
    beforeEach(async () => {
      // Crear pedido en estado "Pendiente de confirmación"
      const pedidoResult = await pool.query(
        `INSERT INTO pedidos (clienteid, estatus, montototal, tenant_id)
         VALUES ($1, 'Pendiente de confirmación', 1000.00, $2)
         RETURNING pedidoid`,
        [testClienteId, testTenantId]
      );
      testPedidoId = pedidoResult.rows[0].pedidoid;

      await pool.query(
        `INSERT INTO detallesdelpedido (pedidoid, varianteid, cantidadpaquetes, piezastotales, preciounitario, esbackorder, cantidadsurtida, tenant_id)
         VALUES ($1, $2, 5, 50, 20.00, false, 5, $3)`,
        [testPedidoId, testVarianteId, testTenantId]
      );
    });

    test('Debe permitir a finanzas confirmar pedido y descontar stock', async () => {
      const stockAntes = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );

      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/confirmar-surtido`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.estatus).toBe('Surtido');

      // Verificar que el stock FUE descontado
      const stockDespues = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );
      expect(stockDespues.rows[0].cantidad).toBe(stockAntes.rows[0].cantidad - 50);
    });

    test('Debe permitir a secretaria confirmar pedido', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/confirmar-surtido`)
        .set('Authorization', `Bearer ${secretariaToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('Debe rechazar si el usuario no tiene permisos', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/confirmar-surtido`)
        .set('Authorization', `Bearer ${inventariosToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('Debe hacer ROLLBACK si falla el descuento de stock', async () => {
      // Eliminar stock para forzar error
      await pool.query(
        'DELETE FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );

      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/confirmar-surtido`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);

      // Verificar que el pedido NO cambió de estado
      const pedidoResult = await pool.query(
        'SELECT estatus FROM pedidos WHERE pedidoid = $1',
        [testPedidoId]
      );
      expect(pedidoResult.rows[0].estatus).toBe('Pendiente de confirmación');
    });
  });

  describe('3. Flujo de Finanzas - Rechazar Pedido', () => {
    beforeEach(async () => {
      const pedidoResult = await pool.query(
        `INSERT INTO pedidos (clienteid, estatus, montototal, tenant_id)
         VALUES ($1, 'Pendiente de confirmación', 1000.00, $2)
         RETURNING pedidoid`,
        [testClienteId, testTenantId]
      );
      testPedidoId = pedidoResult.rows[0].pedidoid;
    });

    test('Debe permitir a finanzas rechazar pedido con observaciones', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/rechazar-finanzas`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .send({
          observaciones_finanzas: 'Revisar cantidades del producto SKU-123'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.estatus).toBe('Revisión de almacén');
      expect(response.body.data.observaciones_finanzas).toBe('Revisar cantidades del producto SKU-123');

      // Verificar que el stock NO fue afectado
      const stockResult = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );
      expect(stockResult.rows[0].cantidad).toBe(100); // Stock sin cambios
    });

    test('Debe rechazar si no se proporcionan observaciones', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/rechazar-finanzas`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .send({
          observaciones_finanzas: ''
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('observaciones');
    });

    test('Debe rechazar si secretaria intenta rechazar', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/rechazar-finanzas`)
        .set('Authorization', `Bearer ${secretariaToken}`)
        .send({
          observaciones_finanzas: 'Test'
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('4. Flujo de Corrección - Almacén Reenvía', () => {
    beforeEach(async () => {
      const pedidoResult = await pool.query(
        `INSERT INTO pedidos (clienteid, estatus, montototal, observaciones_finanzas, tenant_id)
         VALUES ($1, 'Revisión de almacén', 1000.00, 'Revisar cantidades', $2)
         RETURNING pedidoid`,
        [testClienteId, testTenantId]
      );
      testPedidoId = pedidoResult.rows[0].pedidoid;

      await pool.query(
        `INSERT INTO detallesdelpedido (pedidoid, varianteid, cantidadpaquetes, piezastotales, preciounitario, esbackorder, tenant_id)
         VALUES ($1, $2, 5, 50, 20.00, false, $3)`,
        [testPedidoId, testVarianteId, testTenantId]
      );
    });

    test('Debe permitir a almacén corregir y reenviar pedido', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/surtir`)
        .set('Authorization', `Bearer ${inventariosToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.estatus).toBe('Pendiente de confirmación');

      // Verificar que las observaciones de finanzas fueron limpiadas
      const pedidoResult = await pool.query(
        'SELECT observaciones_finanzas FROM pedidos WHERE pedidoid = $1',
        [testPedidoId]
      );
      expect(pedidoResult.rows[0].observaciones_finanzas).toBeNull();
    });
  });

  describe('5. Flujo de Remisiones - Confirmación de Almacén', () => {
    beforeEach(async () => {
      const pedidoResult = await pool.query(
        `INSERT INTO pedidos (clienteid, estatus, montototal, tenant_id)
         VALUES ($1, 'Pendiente', 1000.00, $2)
         RETURNING pedidoid`,
        [testClienteId, testTenantId]
      );
      testPedidoId = pedidoResult.rows[0].pedidoid;

      const remisionResult = await pool.query(
        `INSERT INTO remisiones (pedido_id, cliente_id, folio, total_remision, estado, tenant_id)
         VALUES ($1, $2, 'REM-001', 1000.00, 'PENDIENTE_REVISION', $3)
         RETURNING remision_id`,
        [testPedidoId, testClienteId, testTenantId]
      );
      testRemisionId = remisionResult.rows[0].remision_id;
    });

    test('Debe permitir a inventarios confirmar remisión', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${testRemisionId}/confirmar-almacen`)
        .set('Authorization', `Bearer ${inventariosToken}`)
        .send({
          notas_almacen: 'Verificado físicamente'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.remision.estado).toBe('PENDIENTE_CONFIRMACION_FINANZAS');
    });

    test('Debe permitir confirmar remisión en estado REVISION_ALMACEN', async () => {
      // Cambiar estado a REVISION_ALMACEN
      await pool.query(
        `UPDATE remisiones 
         SET estado = 'REVISION_ALMACEN', observaciones_finanzas = 'Revisar cantidades'
         WHERE remision_id = $1`,
        [testRemisionId]
      );

      const response = await request(app)
        .post(`/api/remisiones/${testRemisionId}/confirmar-almacen`)
        .set('Authorization', `Bearer ${inventariosToken}`)
        .send({
          notas_almacen: 'Corregido'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.remision.estado).toBe('PENDIENTE_CONFIRMACION_FINANZAS');
    });
  });

  describe('6. Flujo de Remisiones - Confirmación de Finanzas', () => {
    beforeEach(async () => {
      const pedidoResult = await pool.query(
        `INSERT INTO pedidos (clienteid, estatus, montototal, es_credito, tenant_id)
         VALUES ($1, 'Pendiente', 1000.00, false, $2)
         RETURNING pedidoid`,
        [testClienteId, testTenantId]
      );
      testPedidoId = pedidoResult.rows[0].pedidoid;

      const remisionResult = await pool.query(
        `INSERT INTO remisiones (pedido_id, cliente_id, folio, total_remision, estado, tenant_id)
         VALUES ($1, $2, 'REM-002', 1000.00, 'PENDIENTE_CONFIRMACION_FINANZAS', $3)
         RETURNING remision_id`,
        [testPedidoId, testClienteId, testTenantId]
      );
      testRemisionId = remisionResult.rows[0].remision_id;

      // Agregar detalles a la remisión
      await pool.query(
        `INSERT INTO detalles_remision (remision_id, variante_id, cantidad_paquetes_surtidos, piezas_surtidas, precio_unitario, subtotal, tenant_id)
         VALUES ($1, $2, 5, 50, 20.00, 1000.00, $3)`,
        [testRemisionId, testVarianteId, testTenantId]
      );
    });

    test('Debe permitir a finanzas confirmar remisión y descontar stock', async () => {
      const stockAntes = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );

      const response = await request(app)
        .post(`/api/remisiones/${testRemisionId}/confirmar-finanzas`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.remision.estado).toBe('SURTIDO');

      // Verificar descuento de stock
      const stockDespues = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );
      expect(stockDespues.rows[0].cantidad).toBe(stockAntes.rows[0].cantidad - 50);

      // Verificar registro en Kardex
      const kardexResult = await pool.query(
        `SELECT * FROM kardex 
         WHERE variante_id = $1 AND tipo = 'SALIDA' AND referencia_tipo = 'REMISION'
         ORDER BY fecha DESC LIMIT 1`,
        [testVarianteId]
      );
      expect(kardexResult.rows.length).toBeGreaterThan(0);
    });

    test('Debe hacer ROLLBACK si hay error en descuento de stock', async () => {
      // Eliminar stock para forzar error
      await pool.query(
        'DELETE FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );

      const response = await request(app)
        .post(`/api/remisiones/${testRemisionId}/confirmar-finanzas`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();

      // Verificar que la remisión NO cambió de estado
      const remisionResult = await pool.query(
        'SELECT estado FROM remisiones WHERE remision_id = $1',
        [testRemisionId]
      );
      expect(remisionResult.rows[0].estado).toBe('PENDIENTE_CONFIRMACION_FINANZAS');
    });
  });

  describe('7. Flujo de Remisiones - Rechazo de Finanzas', () => {
    beforeEach(async () => {
      const pedidoResult = await pool.query(
        `INSERT INTO pedidos (clienteid, estatus, montototal, tenant_id)
         VALUES ($1, 'Pendiente', 1000.00, $2)
         RETURNING pedidoid`,
        [testClienteId, testTenantId]
      );
      testPedidoId = pedidoResult.rows[0].pedidoid;

      const remisionResult = await pool.query(
        `INSERT INTO remisiones (pedido_id, cliente_id, folio, total_remision, estado, tenant_id)
         VALUES ($1, $2, 'REM-003', 1000.00, 'PENDIENTE_CONFIRMACION_FINANZAS', $3)
         RETURNING remision_id`,
        [testPedidoId, testClienteId, testTenantId]
      );
      testRemisionId = remisionResult.rows[0].remision_id;
    });

    test('Debe permitir a finanzas rechazar remisión', async () => {
      const response = await request(app)
        .post(`/api/remisiones/${testRemisionId}/rechazar-finanzas`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .send({
          observaciones_finanzas: 'Revisar cantidades de SKU-001'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.remision.estado).toBe('REVISION_ALMACEN');
      expect(response.body.remision.observaciones_finanzas).toBe('Revisar cantidades de SKU-001');

      // Verificar que el stock NO fue afectado
      const stockResult = await pool.query(
        'SELECT cantidad FROM stock_admin WHERE variante_id = $1 AND tenant_id = $2',
        [testVarianteId, testTenantId]
      );
      expect(stockResult.rows[0].cantidad).toBe(100);
    });
  });

  describe('8. Validación de Facturación', () => {
    beforeEach(async () => {
      const pedidoResult = await pool.query(
        `INSERT INTO pedidos (clienteid, estatus, montototal, tenant_id)
         VALUES ($1, 'Surtido', 1000.00, $2)
         RETURNING pedidoid`,
        [testClienteId, testTenantId]
      );
      testPedidoId = pedidoResult.rows[0].pedidoid;
    });

    test('Debe permitir facturación solo si hay remisión SURTIDO', async () => {
      // Crear remisión en estado SURTIDO
      await pool.query(
        `INSERT INTO remisiones (pedido_id, cliente_id, folio, total_remision, estado, tenant_id)
         VALUES ($1, $2, 'REM-004', 1000.00, 'SURTIDO', $3)`,
        [testPedidoId, testClienteId, testTenantId]
      );

      const response = await request(app)
        .get(`/api/facturas/${testPedidoId}/descargar`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
    });

    test('Debe rechazar facturación si no hay remisión SURTIDO', async () => {
      const response = await request(app)
        .get(`/api/facturas/${testPedidoId}/descargar`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('confirmada por finanzas');
    });

    test('Debe rechazar facturación si remisión está en PENDIENTE_CONFIRMACION_FINANZAS', async () => {
      // Crear remisión en estado pendiente
      await pool.query(
        `INSERT INTO remisiones (pedido_id, cliente_id, folio, total_remision, estado, tenant_id)
         VALUES ($1, $2, 'REM-005', 1000.00, 'PENDIENTE_CONFIRMACION_FINANZAS', $3)`,
        [testPedidoId, testClienteId, testTenantId]
      );

      const response = await request(app)
        .get(`/api/facturas/${testPedidoId}/descargar`)
        .set('Authorization', `Bearer ${finanzasToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});
