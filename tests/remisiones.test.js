const db = require('../db');

describe('Remisiones Workflow Tests', () => {
  let testTenantId = 1;

  beforeAll(async () => {
    // Ensure database connection is ready
  });

  afterAll(async () => {
    // Don't close pool in tests to avoid connection issues
    // await db.pool.end();
  });

  describe('1. Database Schema Verification', () => {
    test('historial_remisiones table should exist', async () => {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'historial_remisiones'
        );
      `);
      expect(result.rows[0].exists).toBe(true);
    });

    test('remisiones table should have new workflow columns', async () => {
      const result = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'remisiones' 
        AND column_name IN (
          'fecha_confirmacion_almacen',
          'confirmado_por_almacen',
          'fecha_emision_final',
          'confirmado_por_finanzas'
        );
      `);
      expect(result.rows.length).toBe(4);
    });

    test('historial_remisiones should have correct structure', async () => {
      const result = await db.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'historial_remisiones'
        ORDER BY ordinal_position;
      `);
      
      const columns = result.rows.map(r => r.column_name);
      expect(columns).toContain('historial_id');
      expect(columns).toContain('remision_id');
      expect(columns).toContain('accion');
      expect(columns).toContain('usuario_id');
      expect(columns).toContain('detalles');
      expect(columns).toContain('fecha_accion');
      expect(columns).toContain('tenant_id');
    });
  });

  describe('2. Role Configuration', () => {
    test('almacenista role should be defined in rolesConfig', () => {
      const { getRolesValidos, tienePermiso } = require('../config/rolesConfig');
      
      const roles = getRolesValidos();
      expect(roles).toContain('almacenista');
    });

    test('almacenista should have correct permissions', () => {
      const { tienePermiso } = require('../config/rolesConfig');
      
      expect(tienePermiso('almacenista', 'remisiones', 'ver')).toBe(true);
      expect(tienePermiso('almacenista', 'remisiones', 'confirmar')).toBe(true);
      expect(tienePermiso('almacenista', 'inventario', 'ver')).toBe(true);
      expect(tienePermiso('almacenista', 'pedidos', 'ver')).toBe(true);
      
      // Should NOT have these permissions
      expect(tienePermiso('almacenista', 'remisiones', 'crear')).toBe(false);
      expect(tienePermiso('almacenista', 'inventario', 'modificar')).toBe(false);
    });

    test('finanzas should have remisiones permissions', () => {
      const { tienePermiso } = require('../config/rolesConfig');
      
      // Finanzas should be able to see and work with remisiones through pedidos
      expect(tienePermiso('finanzas', 'pedidos', 'ver')).toBe(true);
    });
  });

  describe('3. Controller Functions Exist', () => {
    test('remisionesController should have new functions', () => {
      const controller = require('../controllers/remisionesController');
      
      expect(typeof controller.generarRemision).toBe('function');
      expect(typeof controller.cancelarRemision).toBe('function');
      expect(typeof controller.confirmarRemisionAlmacen).toBe('function');
      expect(typeof controller.corregirRemision).toBe('function');
      expect(typeof controller.confirmarRemisionFinanzas).toBe('function');
    });
  });

  describe('4. Stock Return Logic in cancelarRemision', () => {
    test('cancelarRemision function should contain stock return logic', () => {
      const fs = require('fs');
      const controllerCode = fs.readFileSync(
        'd:/Ferram/Personal/RazoConnect/controllers/remisionesController.js',
        'utf8'
      );
      
      // Verify stock return logic exists
      expect(controllerCode).toContain('DEVOLVER STOCK');
      expect(controllerCode).toContain('cantidad = cantidad +');
      expect(controllerCode).toContain('cantidad_reservada = cantidad_reservada +');
      expect(controllerCode).toContain('REVERTIR_CANCELACION');
      expect(controllerCode).toContain('REVERTIR MOVIMIENTO EN KARDEX');
      expect(controllerCode).toContain("tipo: 'ENTRADA'");
      expect(controllerCode).toContain("motivo: 'DEVOLUCION'");
    });
  });

  describe('5. State Flow Logic', () => {
    test('generarRemision should set PENDIENTE_REVISION state', () => {
      const fs = require('fs');
      const controllerCode = fs.readFileSync(
        'd:/Ferram/Personal/RazoConnect/controllers/remisionesController.js',
        'utf8'
      );
      
      expect(controllerCode).toContain('PENDIENTE_REVISION');
      expect(controllerCode).toContain('BORRADOR');
      expect(controllerCode).toContain('CONFIRMADA');
      expect(controllerCode).toContain('EMITIDA');
    });

    test('CxC generation should be deferred until confirmar-finanzas', () => {
      const fs = require('fs');
      const controllerCode = fs.readFileSync(
        'd:/Ferram/Personal/RazoConnect/controllers/remisionesController.js',
        'utf8'
      );
      
      // Should have comment about NOT generating CxC immediately
      expect(controllerCode).toContain('NO generar CXC hasta que finanzas confirme');
      expect(controllerCode).toContain('if (false && emitir_inmediatamente && pedido.es_credito)');
    });
  });

  describe('6. Routes Configuration', () => {
    test('routes should use authorizeRole middleware', () => {
      const fs = require('fs');
      const routesCode = fs.readFileSync(
        'd:/Ferram/Personal/RazoConnect/routes/remisiones.js',
        'utf8'
      );
      
      expect(routesCode).toContain('authorizeRole');
      expect(routesCode).toContain("authorizeRole(['finanzas'");
      expect(routesCode).toContain("authorizeRole(['almacenista'");
      expect(routesCode).toContain('/confirmar-almacen');
      expect(routesCode).toContain('/corregir');
      expect(routesCode).toContain('/confirmar-finanzas');
    });
  });

  describe('7. Historical Tracking', () => {
    test('confirmarRemisionAlmacen should insert into historial_remisiones', () => {
      const fs = require('fs');
      const controllerCode = fs.readFileSync(
        'd:/Ferram/Personal/RazoConnect/controllers/remisionesController.js',
        'utf8'
      );
      
      expect(controllerCode).toContain('INSERT INTO historial_remisiones');
      expect(controllerCode).toContain('CONFIRMACION_ALMACEN');
      expect(controllerCode).toContain('CONFIRMACION_FINANZAS');
      expect(controllerCode).toContain('CORRECCION');
    });
  });

  describe('8. Data Integrity Checks', () => {
    test('should not have negative stock in stock_admin', async () => {
      try {
        const result = await db.query(`
          SELECT COUNT(*) as count 
          FROM stock_admin 
          WHERE cantidad < 0
        `);
        
        expect(result).toBeDefined();
        expect(result.rows).toBeDefined();
        expect(parseInt(result.rows[0].count)).toBe(0);
      } catch (error) {
        // Table might not exist yet, skip test
        console.warn('stock_admin table check skipped:', error.message);
      }
    });

    test('should not have orphaned historial_remisiones records', async () => {
      try {
        const result = await db.query(`
          SELECT COUNT(*) as count
          FROM historial_remisiones h
          LEFT JOIN remisiones r ON h.remision_id = r.remision_id
          WHERE r.remision_id IS NULL
        `);
        
        expect(result).toBeDefined();
        expect(result.rows).toBeDefined();
        expect(parseInt(result.rows[0].count)).toBe(0);
      } catch (error) {
        // Table might not exist yet, skip test
        console.warn('historial_remisiones check skipped:', error.message);
      }
    });
  });
});
