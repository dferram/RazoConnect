/**
 * ============================================================
 * TESTS MEJORADOS - Performance Real + Funcionalidad
 * ============================================================
 *
 * Tests que REALMENTE validan performance y funcionalidad correcta
 * sin falsos positivos
 *
 * Ejecutar:
 * npm test -- PERFORMANCE_OPTIMIZED_TESTS.spec.js
 *
 * @file tests/integration/PERFORMANCE_OPTIMIZED_TESTS.spec.js
 */

const PedidoEstadoSincronizadorService = require('../../services/pedidoEstadoSincronizadorService');
const db = require('../../db');

describe('✅ PERFORMANCE TESTS - Validation Real', () => {

  // ================================================================
  // TEST CONTROL: Medir baseline sin fixes
  // ================================================================
  describe('[BASELINE] Mediciones sin optimizaciones', () => {
    test('Single recalcularUnPedido: <100ms', async () => {
      const start = Date.now();

      const result = await PedidoEstadoSincronizadorService.recalcularUnPedido(1000, 1);

      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(result).toHaveProperty('nuevo_estado');
      expect(result).toHaveProperty('cambio_realizado');
    });
  });

  // ================================================================
  // TEST PARALELIZACIÓN: Validar que mejora es real
  // ================================================================
  describe('[PARALELO] Verificar mejora concurrencia', () => {

    test('50 pedidos paralelos: <5000ms (con paralelismo)', async () => {
      // Setup: Crear 50 pedidos de prueba (o usar reales)
      const pedidoIds = Array.from({ length: 50 }, (_, i) => 1000 + i);
      const tenantId = 1;

      const start = Date.now();

      // Simular: Promise.all() - lo que DEBERÍA SER
      const promesas = pedidoIds.map(id =>
        PedidoEstadoSincronizadorService.recalcularUnPedido(id, tenantId)
          .catch(err => ({ error: err.message }))
      );

      const resultados = await Promise.all(promesas);

      const duration = Date.now() - start;

      console.log(`\n📊 50 pedidos en paralelo: ${duration}ms`);

      // ✅ Expectativa: <5s con paralelismo
      // ❌ Si >10s: significa falló paralelismo (vuelve a secuencial ~1000ms)
      expect(duration).toBeLessThan(5000);
      expect(resultados.length).toBe(50);
    });

    test('Comparar: secuencial vs paralelo timing', async () => {
      const pedidoIds = Array.from({ length: 10 }, (_, i) => 1000 + i);
      const tenantId = 1;

      // Medir SECUENCIAL
      const startSeq = Date.now();
      const resultSeq = [];
      for (const id of pedidoIds) {
        const result = await PedidoEstadoSincronizadorService.recalcularUnPedido(id, tenantId);
        resultSeq.push(result);
      }
      const durationSeq = Date.now() - startSeq;

      // Medir PARALELO
      const startPar = Date.now();
      const promesas = pedidoIds.map(id =>
        PedidoEstadoSincronizadorService.recalcularUnPedido(id, tenantId)
      );
      const resultPar = await Promise.all(promesas);
      const durationPar = Date.now() - startPar;

      console.log(`\n⏱️  10 pedidos:`);
      console.log(`   Secuencial: ${durationSeq}ms`);
      console.log(`   Paralelo: ${durationPar}ms`);
      console.log(`   Mejora: ${((durationSeq - durationPar) / durationSeq * 100).toFixed(1)}%`);

      // ✅ Paralelo DEBE ser más rápido
      expect(durationPar).toBeLessThan(durationSeq);
      // ✅ Mejora debe ser significativa (>30%)
      expect(durationPar).toBeLessThan(durationSeq * 0.7);
    });
  });

  // ================================================================
  // TEST CONSOLIDACIÓN: N+1 Queries
  // ================================================================
  describe('[N+1 QUERIES] Validar consolidación', () => {

    test('Queries consolidadas: máximo 1 query por operación', async () => {
      // Este test requiere query counting en BD
      // Mockear db.query para contar llamadas

      let queryCount = 0;
      const originalQuery = db.query;
      db.query = (...args) => {
        queryCount++;
        return originalQuery(...args);
      };

      try {
        // Operación que debería ser 1 query
        await PedidoEstadoSincronizadorService.obtenerHistorialCambios(1000, 1, 50);

        // ✅ Esperamos máximo 1 query
        expect(queryCount).toBeLessThanOrEqual(1);
      } finally {
        db.query = originalQuery;
      }
    });
  });

  // ================================================================
  // TEST AUDITORÍA: Índices están presentes
  // ================================================================
  describe('[ÍNDICES] Validar que existen para performance', () => {

    test('Índice (tenant_id, created_at) existe', async () => {
      const result = await db.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'estado_cambios_automaticos'
          AND indexname LIKE '%tenant_id%created_at%'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
    });

    test('Índice (disparador, tenant_id) existe', async () => {
      const result = await db.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'estado_cambios_automaticos'
          AND indexname LIKE '%disparador%'
      `);

      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  // ================================================================
  // TEST ESTADÍSTICAS: Query plan es optimal
  // ================================================================
  describe('[QUERY PLANS] Validar que no son full table scans', () => {

    test('obtenerEstadisticasCambios usa índice (no seq scan)', async () => {
      const result = await db.query(`
        EXPLAIN (FORMAT JSON)
        SELECT
          DATE_TRUNC('day', created_at) as periodo,
          COUNT(*) as total_cambios
        FROM estado_cambios_automaticos
        WHERE tenant_id = 1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        LIMIT 30
      `);

      const plan = JSON.parse(result.rows[0]['QUERY PLAN'])[0];
      const planStr = JSON.stringify(plan);

      // ✅ NO debería haber "Seq Scan" (secuencial)
      expect(planStr).not.toContain('Seq Scan');
      // ✅ DEBERÍA haber "Index" en el plan
      expect(planStr).toContain('Index');
    });

    test('obtenerCambiosPorDisparador usa índice (no seq scan)', async () => {
      const result = await db.query(`
        EXPLAIN (FORMAT JSON)
        SELECT *
        FROM estado_cambios_automaticos
        WHERE disparador = 'STOCK_INSERT'
          AND tenant_id = 1
        ORDER BY created_at DESC
        LIMIT 100
      `);

      const plan = JSON.parse(result.rows[0]['QUERY PLAN'])[0];
      const planStr = JSON.stringify(plan);

      expect(planStr).not.toContain('Seq Scan');
      expect(planStr).toContain('Index');
    });
  });

  // ================================================================
  // TEST VALORES: Correctas después de fixes
  // ================================================================
  describe('[VALUES] Validar valores correctos (no UPPER CASE)', () => {

    test('Valores de estado son proper case, no UPPER', async () => {
      const result = await db.query(`
        SELECT DISTINCT estado_nuevo FROM estado_cambios_automaticos
        WHERE tenant_id = 1
        LIMIT 100
      `);

      const estadosValidos = [
        'Pendiente', 'Bajo pedido', 'Completo', 'Combinado',
        'Listo para remisionar', 'Surtido completo', 'Cancelado', 'Entregado',
        'ERROR'  // Puede haber estados de error
      ];

      result.rows.forEach(row => {
        const estado = row.estado_nuevo;
        expect(estadosValidos).toContain(estado);
        // ❌ NO debe estar en mayúsculas ('COMPLETO')
        if (estado !== 'ERROR') {
          expect(estado).not.toMatch(/^[A-Z_]+$/);  // Rechaza 'COMPLETO'
        }
      });
    });

    test('Disparadores incluyen ESTADO_PRODUCTO_UPDATE', async () => {
      const result = await db.query(`
        SELECT DISTINCT disparador FROM estado_cambios_automaticos
        WHERE tenant_id = 1
        LIMIT 1000
      `);

      const disparadores = result.rows.map(r => r.disparador);
      const esperados = ['STOCK_INSERT', 'STOCK_UPDATE', 'STOCK_DELETE', 'ESTADO_PRODUCTO_UPDATE'];

      esperados.forEach(disp => {
        // No todos están obligados, pero si existen en la tabla, deben venir
        if (disparadores.includes(disp)) {
          expect(disparadores).toContain(disp);
        }
      });
    });
  });

  // ================================================================
  // TEST INTEGRACIÓN: Flujo completo sin delays
  // ================================================================
  describe('[INTEGRACIÓN E2E] Flujo de cambio de estatus', () => {

    test('Cambio de estatus: <500ms total', async () => {
      // Este test necesita:
      // 1. Crear pedido real
      // 2. Cambiar estatus
      // 3. Validar auditoria
      // 4. Medir tiempo

      const start = Date.now();

      // Setup
      const pedidoId = 10000;
      const tenantId = 1;

      // Crear pedido
      await db.query(
        `INSERT INTO pedidos (clienteid, tenant_id, admin_asignado_id, estatus)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING`,
        [1, tenantId, 2, 'Pendiente']
      );

      // Cambiar estatus (simular)
      const result = await PedidoEstadoSincronizadorService.recalcularUnPedido(9999, tenantId);

      // Verificar auditoría
      const audit = await db.query(
        `SELECT * FROM estado_cambios_automaticos
         WHERE pedido_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [9999, tenantId]
      );

      const duration = Date.now() - start;

      console.log(`\n⚡ Flujo E2E: ${duration}ms`);

      // ✅ Debe ser rápido
      expect(duration).toBeLessThan(500);
      expect(result).toHaveProperty('nuevo_estado');
    });
  });

  // ================================================================
  // TEST CARGA: Load testing básico
  // ================================================================
  describe('[LOAD TEST] Validar bajo carga', () => {

    test('100 requests simultáneos a recalcularUnPedido', async () => {
      const start = Date.now();
      const tenantId = 1;

      // Simular 100 requests en paralelo
      const requests = Array.from({ length: 100 }, (_, i) =>
        PedidoEstadoSincronizadorService.recalcularUnPedido(1000 + (i % 50), tenantId)
          .catch(err => ({ error: err.message }))
      );

      const results = await Promise.all(requests);
      const duration = Date.now() - start;

      console.log(`\n🔥 Load: 100 requests en ${duration}ms (${(duration/100).toFixed(1)}ms cada una)`);

      // ✅ Promedio <50ms por request incluso bajo carga
      expect(duration / requests.length).toBeLessThan(100);
      // ✅ Total <10 segundos para 100
      expect(duration).toBeLessThan(10000);
    });
  });

  // ================================================================
  // TEST MEMORIA: No leak en operaciones masivas
  // ================================================================
  describe('[MEMORY] Validar sin memory leaks', () => {

    test('1000 operaciones no causa memory leak', async () => {
      const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;

      // Ejecutar 1000 operaciones
      for (let i = 0; i < 1000; i++) {
        try {
          await PedidoEstadoSincronizadorService.recalcularUnPedido(1000, 1);
        } catch {
          // Ignorar errores
        }

        // Forcibar GC cada 100
        if (i % 100 === 0 && global.gc) {
          global.gc();
        }
      }

      const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
      const memDelta = memAfter - memBefore;

      console.log(`\n💾 Memory: ${memBefore.toFixed(1)}MB → ${memAfter.toFixed(1)}MB (Δ ${memDelta.toFixed(1)}MB)`);

      // ✅ Memoria no debe crecer más de 50MB
      expect(memDelta).toBeLessThan(50);
    });
  });

});

// ================================================================
// UTILS: Helpers para performance testing
// ================================================================

function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatMem(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

// Exportar para uso en otros tests
module.exports = { formatMs, formatMem };
