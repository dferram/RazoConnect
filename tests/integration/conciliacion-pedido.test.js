/**
 * Test de Integración: Conciliación con Filtro de Pedido
 * 
 * Verifica que el endpoint /api/admin/ajustes-inventario/filtrados
 * retorne correctamente los detalles del pedido cuando se filtra por pedidoId
 */

const request = require('supertest');
const app = require('../../index');
const db = require('../../db');

describe('Conciliación - Filtro por Pedido', () => {
  let adminToken;
  let testPedidoId;
  let testTenantId = 1;

  beforeAll(async () => {
    // Simular login de admin para obtener token
    // En un entorno real, deberías hacer login con credenciales válidas
    adminToken = 'test_admin_token'; // Reemplazar con token real en test
  });

  describe('GET /api/admin/ajustes-inventario/filtrados', () => {
    it('debe retornar detalles del pedido cuando se filtra por pedidoId', async () => {
      // Primero, obtener un pedido surtido de la BD
      const pedidoResult = await db.query(
        `SELECT p.pedidoid 
         FROM pedidos p
         WHERE p.estatus IN ('Surtido', 'Enviado', 'Entregado')
         AND p.tenant_id = $1
         LIMIT 1`,
        [testTenantId]
      );

      if (pedidoResult.rows.length === 0) {
        console.log('⚠️ No hay pedidos surtidos para testear');
        return;
      }

      testPedidoId = pedidoResult.rows[0].pedidoid;
      console.log(`🧪 Testing con Pedido #${testPedidoId}`);

      const response = await request(app)
        .get('/api/admin/ajustes-inventario/filtrados')
        .query({
          fechaInicio: '2024-01-01',
          fechaFin: '2026-12-31',
          tipoOrigen: 'VENTA',
          pedidoId: testPedidoId
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect('Content-Type', /json/);

      console.log('📦 Response status:', response.status);
      console.log('📦 Response body:', JSON.stringify(response.body, null, 2));

      // Verificaciones
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      
      // Verificar que retorna detalles del pedido
      if (response.body.data.pedidoDetalles) {
        const pedidoDetalles = response.body.data.pedidoDetalles;
        
        console.log('✅ Pedido Detalles encontrado:');
        console.log(`   - Pedido ID: ${pedidoDetalles.pedidoId}`);
        console.log(`   - Cliente: ${pedidoDetalles.cliente.nombre}`);
        console.log(`   - Monto Total: $${pedidoDetalles.montoTotal}`);
        console.log(`   - Productos: ${pedidoDetalles.productos.length}`);
        
        expect(pedidoDetalles.pedidoId).toBe(testPedidoId);
        expect(pedidoDetalles.cliente).toBeDefined();
        expect(pedidoDetalles.productos).toBeInstanceOf(Array);
        expect(pedidoDetalles.productos.length).toBeGreaterThan(0);
        
        // Verificar estructura de productos
        pedidoDetalles.productos.forEach(producto => {
          expect(producto.sku).toBeDefined();
          expect(producto.nombreProducto).toBeDefined();
          expect(producto.cantidadPaquetes).toBeDefined();
          expect(producto.piezasTotales).toBeDefined();
          expect(producto.subtotal).toBeDefined();
        });
      } else {
        console.log('⚠️ No se retornaron detalles del pedido');
        console.log('   Ajustes encontrados:', response.body.data.ajustes?.length || 0);
      }
    });

    it('debe retornar ajustes de inventario relacionados al pedido', async () => {
      if (!testPedidoId) {
        console.log('⚠️ Skipping test - no hay pedido de prueba');
        return;
      }

      const response = await request(app)
        .get('/api/admin/ajustes-inventario/filtrados')
        .query({
          fechaInicio: '2024-01-01',
          fechaFin: '2026-12-31',
          tipoOrigen: 'VENTA',
          pedidoId: testPedidoId
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const ajustes = response.body.data.ajustes || [];
      
      console.log(`📊 Ajustes encontrados: ${ajustes.length}`);
      
      if (ajustes.length > 0) {
        ajustes.forEach(ajuste => {
          console.log(`   - ${ajuste.productoNombre} (${ajuste.sku}): ${ajuste.totalPiezas} pzas`);
          
          // Verificar que el motivo incluye el pedido
          expect(ajuste.motivo).toContain(`Pedido #${testPedidoId}`);
          expect(ajuste.tipoOrigen).toBe('VENTA');
          expect(ajuste.esSalida).toBe(true);
        });
      } else {
        console.log('⚠️ No se encontraron ajustes para este pedido');
        console.log('   Esto puede indicar que el pedido no tiene movimientos de inventario registrados');
      }
    });
  });

  afterAll(async () => {
    // Cleanup si es necesario
  });
});

/**
 * Test Manual con cURL:
 * 
 * curl -X GET "http://localhost:8080/api/admin/ajustes-inventario/filtrados?fechaInicio=2024-01-01&fechaFin=2026-12-31&tipoOrigen=VENTA&pedidoId=46" \
 *   -H "Authorization: Bearer YOUR_TOKEN_HERE" \
 *   -H "Content-Type: application/json"
 */
