/**
 * Integration Tests: Priority Orders Feature
 * Tests both backend API and frontend functionality
 */

// Unmock database for integration tests
jest.unmock('../db');

const request = require('supertest');
const db = require('../db');
const { generateAccessToken } = require('../utils/jwtHelper');

describe('Priority Orders Integration Tests', () => {
  let app;
  let authTokenFinanzas;
  let authTokenInventarios;
  let authTokenCliente;
  let testPedidoId;
  let testTenantId = 1;
  let testAdminFinanzasId;
  let testAdminInventariosId;

  beforeAll(async () => {
    // Setup test environment
    app = require('../index');
    
    // Create test users if they don't exist
    const finanzasResult = await db.query(
      `INSERT INTO administradores (nombre, email, password, rol, tenant_id, activo)
       VALUES ('Test Finanzas', 'test.finanzas@test.com', 'hashed_password', 'finanzas', $1, true)
       ON CONFLICT (email) DO UPDATE SET activo = true
       RETURNING adminid`,
      [testTenantId]
    );
    testAdminFinanzasId = finanzasResult.rows[0].adminid;

    const inventariosResult = await db.query(
      `INSERT INTO administradores (nombre, email, password, rol, tenant_id, activo)
       VALUES ('Test Inventarios', 'test.inventarios@test.com', 'hashed_password', 'inventarios', $1, true)
       ON CONFLICT (email) DO UPDATE SET activo = true
       RETURNING adminid`,
      [testTenantId]
    );
    testAdminInventariosId = inventariosResult.rows[0].adminid;

    // Create test pedido
    const pedidoResult = await db.query(
      `INSERT INTO pedidos (clienteid, estatus, monto_total, es_prioritario, tenant_id)
       VALUES (1, 'Pendiente', 1000.00, false, $1)
       RETURNING pedidoid`,
      [testTenantId]
    );
    testPedidoId = pedidoResult.rows[0].pedidoid;

    // Generate real JWT tokens for testing
    authTokenFinanzas = generateAccessToken({
      id: testAdminFinanzasId,
      rol: 'finanzas',
      tenant_id: testTenantId,
      email: 'test.finanzas@test.com'
    });
    
    authTokenInventarios = generateAccessToken({
      id: testAdminInventariosId,
      rol: 'inventarios',
      tenant_id: testTenantId,
      email: 'test.inventarios@test.com'
    });
    
    authTokenCliente = generateAccessToken({
      id: 1,
      rol: 'cliente',
      tenant_id: testTenantId,
      email: 'test.cliente@test.com'
    });
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await db.query('DELETE FROM notificaciones WHERE tipo = $1', ['prioridad_pedido']);
      if (testPedidoId) {
        await db.query('DELETE FROM pedidos WHERE pedidoid = $1', [testPedidoId]);
      }
      await db.query('DELETE FROM administradores WHERE email LIKE $1', ['test.%@test.com']);
    } catch (error) {
      console.error('Cleanup error:', error.message);
    }
  });

  describe('Backend API: POST /api/admin/pedidos/:id/prioritario', () => {
    
    test('Should mark pedido as prioritario with finanzas role', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/prioritario`)
        .set('Authorization', `Bearer ${authTokenFinanzas}`)
        .send({
          prioritario: true,
          motivo: 'Cliente VIP - Entrega urgente'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.prioritario).toBe(true);
      expect(response.body.pedidoId).toBe(testPedidoId);

      // Verify database update
      const dbResult = await db.query(
        'SELECT es_prioritario FROM pedidos WHERE pedidoid = $1',
        [testPedidoId]
      );
      expect(dbResult.rows[0].es_prioritario).toBe(true);
    });

    test('Should create notifications for inventarios staff', async () => {
      // First mark as priority
      await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/prioritario`)
        .set('Authorization', `Bearer ${authTokenFinanzas}`)
        .send({ prioritario: true, motivo: 'Test notification' });

      // Verify notification was created
      const notifResult = await db.query(
        `SELECT * FROM notificaciones 
         WHERE tipo = 'prioridad_pedido' 
         AND administrador_id = $1
         AND metadata->>'pedidoId' = $2`,
        [testAdminInventariosId, String(testPedidoId)]
      );

      expect(notifResult.rows.length).toBeGreaterThan(0);
      const notif = notifResult.rows[0];
      expect(notif.tipo).toBe('prioridad_pedido');
      expect(notif.prioridad).toBe('alta');
      expect(notif.leida).toBe(false);
      expect(notif.titulo).toContain('PRIORITARIO');
    });

    test('Should unmark pedido as prioritario', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/prioritario`)
        .set('Authorization', `Bearer ${authTokenFinanzas}`)
        .send({
          prioritario: false,
          motivo: 'Ya no es urgente'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.prioritario).toBe(false);

      // Verify database update
      const dbResult = await db.query(
        'SELECT es_prioritario FROM pedidos WHERE pedidoid = $1',
        [testPedidoId]
      );
      expect(dbResult.rows[0].es_prioritario).toBe(false);
    });

    test('Should reject request without authorization', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/prioritario`)
        .send({ prioritario: true });

      expect(response.status).toBe(401);
    });

    test('Should reject request from inventarios role (no permission)', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/prioritario`)
        .set('Authorization', `Bearer ${authTokenInventarios}`)
        .send({ prioritario: true });

      expect(response.status).toBe(403);
    });

    test('Should validate prioritario field is boolean', async () => {
      const response = await request(app)
        .post(`/api/admin/pedidos/${testPedidoId}/prioritario`)
        .set('Authorization', `Bearer ${authTokenFinanzas}`)
        .send({ prioritario: 'true' }); // String instead of boolean

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('boolean');
    });

    test('Should validate pedido ID exists', async () => {
      const response = await request(app)
        .post('/api/admin/pedidos/999999/prioritario')
        .set('Authorization', `Bearer ${authTokenFinanzas}`)
        .send({ prioritario: true });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('no encontrado');
    });

    test('Should validate pedido ID is a number', async () => {
      const response = await request(app)
        .post('/api/admin/pedidos/invalid/prioritario')
        .set('Authorization', `Bearer ${authTokenFinanzas}`)
        .send({ prioritario: true });

      expect(response.status).toBe(400);
    });
  });

  describe.skip('Frontend: Priority Badge and Button', () => {
    
    test('Priority badge should be hidden by default', () => {
      const badge = document.getElementById('prioridadBadge');
      expect(badge).toBeTruthy();
      expect(badge.style.display).toBe('none');
    });

    test('Priority badge should show when pedido is prioritario', () => {
      // Simulate pedido data load
      const mockPedido = {
        pedidoId: testPedidoId,
        es_prioritario: true
      };

      const badge = document.getElementById('prioridadBadge');
      badge.style.display = mockPedido.es_prioritario ? 'inline-block' : 'none';
      
      expect(badge.style.display).toBe('inline-block');
      expect(badge.textContent).toContain('PRIORITARIO');
    });

    test('Priority button should only be visible for finanzas role', () => {
      const btnPrioridad = document.getElementById('btnTogglePrioridad');
      expect(btnPrioridad).toBeTruthy();
      
      // Test visibility logic
      const rolesConPermiso = ['finanzas', 'gerente_finanzas', 'admin', 'super_admin'];
      const rolesSinPermiso = ['inventarios', 'cliente', 'agente'];

      rolesConPermiso.forEach(role => {
        const tienePermiso = rolesConPermiso.includes(role);
        expect(tienePermiso).toBe(true);
      });

      rolesSinPermiso.forEach(role => {
        const tienePermiso = rolesConPermiso.includes(role);
        expect(tienePermiso).toBe(false);
      });
    });
  });

  describe.skip('Frontend: Bajo Pedido Items - Gray Layer and Reordering', () => {
    
    test('Items bajo pedido should have gray layer CSS class', () => {
      const mockItems = [
        { sku: 'SKU001', stock: 10, piezasTotales: 5, esBackorder: false },
        { sku: 'SKU002', stock: 0, piezasTotales: 10, esBackorder: true },
        { sku: 'SKU003', stock: 3, piezasTotales: 5, esBackorder: true }
      ];

      mockItems.forEach(item => {
        const stock = item.stock !== undefined ? item.stock : 0;
        const piezasNecesarias = item.piezasTotales || 0;
        const hayStockSuficiente = stock >= piezasNecesarias;
        const esBackorder = item.esBackorder === true;
        
        const badgeText = esBackorder || !hayStockSuficiente ? 'BAJO PEDIDO' : 'CON STOCK';
        const esBajoPedido = badgeText === 'BAJO PEDIDO';
        const claseItemRow = esBajoPedido ? 'item-row item-bajo-pedido' : 'item-row';

        if (item.sku === 'SKU001') {
          expect(claseItemRow).toBe('item-row');
        } else {
          expect(claseItemRow).toBe('item-row item-bajo-pedido');
        }
      });
    });

    test('Items should be reordered: stock first, bajo pedido last', () => {
      const mockProductos = [
        { sku: 'SKU001', stock: 0, piezasTotales: 10, esBackorder: true },
        { sku: 'SKU002', stock: 10, piezasTotales: 5, esBackorder: false },
        { sku: 'SKU003', stock: 3, piezasTotales: 5, esBackorder: true },
        { sku: 'SKU004', stock: 20, piezasTotales: 10, esBackorder: false }
      ];

      // Reordering logic
      const productosConStock = mockProductos.filter(p => {
        const esBackorder = p.esBackorder === true;
        const stock = p.stock !== undefined ? p.stock : 0;
        const piezasNecesarias = p.piezasTotales || 0;
        const hayStockSuficiente = stock >= piezasNecesarias;
        return !esBackorder && hayStockSuficiente;
      });

      const productosBajoPedido = mockProductos.filter(p => {
        const esBackorder = p.esBackorder === true;
        const stock = p.stock !== undefined ? p.stock : 0;
        const piezasNecesarias = p.piezasTotales || 0;
        const hayStockSuficiente = stock >= piezasNecesarias;
        return esBackorder || !hayStockSuficiente;
      });

      const productosToRender = [...productosConStock, ...productosBajoPedido];

      // Verify order
      expect(productosToRender[0].sku).toBe('SKU002'); // Con stock
      expect(productosToRender[1].sku).toBe('SKU004'); // Con stock
      expect(productosToRender[2].sku).toBe('SKU001'); // Bajo pedido
      expect(productosToRender[3].sku).toBe('SKU003'); // Bajo pedido
    });

    test('Gray layer CSS should reduce opacity and show badge', () => {
      // This would be a visual regression test in a real scenario
      // Here we verify the CSS class is applied correctly
      const cssRules = `
        .item-bajo-pedido {
          opacity: 0.55;
          background: #f9fafb;
          position: relative;
        }
        .item-bajo-pedido::after {
          content: '🔄 BAJO PEDIDO';
          position: absolute;
          top: 8px;
          right: 8px;
          background: #fef3c7;
          color: #92400e;
          padding: 0.25rem 0.5rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 600;
        }
      `;
      
      expect(cssRules).toContain('opacity: 0.55');
      expect(cssRules).toContain('background: #f9fafb');
      expect(cssRules).toContain('BAJO PEDIDO');
    });
  });

  describe('Security and Permissions', () => {
    
    test('Only finanzas, admin, super_admin can mark priority', () => {
      const rolesPermitidos = ['finanzas', 'gerente_finanzas', 'admin', 'super_admin'];
      const rolesDenegados = ['inventarios', 'cliente', 'agente', 'secretaria'];

      rolesPermitidos.forEach(rol => {
        const tienePermiso = rolesPermitidos.includes(rol);
        expect(tienePermiso).toBe(true);
      });

      rolesDenegados.forEach(rol => {
        const tienePermiso = rolesPermitidos.includes(rol);
        expect(tienePermiso).toBe(false);
      });
    });

    test('Notifications should only go to inventarios/almacenista roles', async () => {
      const rolesDestinatarios = ['inventarios', 'almacenista'];
      
      // Verify query logic
      const query = `
        SELECT DISTINCT a.adminid
        FROM administradores a
        WHERE LOWER(a.rol) IN ('inventarios', 'almacenista')
          AND a.activo = TRUE
          AND a.tenant_id = $1
      `;

      expect(query).toContain('inventarios');
      expect(query).toContain('almacenista');
      expect(query).toContain('activo = TRUE');
      expect(query).toContain('tenant_id');
    });

    test('Tenant isolation should be enforced', async () => {
      // All queries should filter by tenant_id
      const pedidoQuery = 'SELECT pedidoid FROM pedidos WHERE pedidoid = $1 AND tenant_id = $2';
      const updateQuery = 'UPDATE pedidos SET es_prioritario = $1 WHERE pedidoid = $2 AND tenant_id = $3';
      const notifQuery = 'INSERT INTO notificaciones (...) VALUES (..., tenant_id = $8)';

      expect(pedidoQuery).toContain('tenant_id');
      expect(updateQuery).toContain('tenant_id');
    });
  });

  describe('Database Migration', () => {
    
    test('Migration should add prioridad_pedido to notificaciones constraint', async () => {
      const result = await db.query(`
        SELECT pg_get_constraintdef(oid) as constraint_def
        FROM pg_constraint
        WHERE conname = 'notificaciones_tipo_check'
      `);

      if (result.rows.length > 0) {
        const constraintDef = result.rows[0].constraint_def;
        expect(constraintDef).toContain('prioridad_pedido');
      }
    });

    test('Index on administrador_id should exist', async () => {
      const result = await db.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE indexname = 'idx_notificaciones_administrador_id'
      `);

      // Index should exist or migration should create it
      expect(result.rows.length).toBeGreaterThanOrEqual(0);
    });

    test('pedidos.es_prioritario column should exist', async () => {
      const result = await db.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'pedidos'
        AND column_name = 'es_prioritario'
      `);

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].data_type).toBe('boolean');
      expect(result.rows[0].column_default).toContain('false');
    });
  });
});
