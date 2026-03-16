/**
 * Final tests for Remisiones Workflow
 * Using correct role: inventarios
 */

describe('Remisiones Workflow - Final Tests', () => {
  
  describe('1. Role Configuration - inventarios', () => {
    test('inventarios role should exist', () => {
      const { getRolesValidos, ROLES_PERMISOS } = require('../config/rolesConfig');
      
      const roles = getRolesValidos();
      expect(roles).toContain('inventarios');
      expect(ROLES_PERMISOS.inventarios).toBeDefined();
    });

    test('inventarios should have remisiones permissions', () => {
      const { ROLES_PERMISOS } = require('../config/rolesConfig');
      
      expect(ROLES_PERMISOS.inventarios.remisiones).toBeDefined();
      expect(ROLES_PERMISOS.inventarios.remisiones).toContain('ver');
      expect(ROLES_PERMISOS.inventarios.remisiones).toContain('confirmar');
      expect(ROLES_PERMISOS.inventarios.remisiones).toContain('corregir');
    });

    test('inventarios should have pedidos permissions', () => {
      const { ROLES_PERMISOS } = require('../config/rolesConfig');
      
      expect(ROLES_PERMISOS.inventarios.pedidos).toBeDefined();
      expect(ROLES_PERMISOS.inventarios.pedidos).toContain('ver');
      expect(ROLES_PERMISOS.inventarios.pedidos).toContain('modificar');
    });

    test('inventarios should have inventario permissions', () => {
      const { ROLES_PERMISOS } = require('../config/rolesConfig');
      
      expect(ROLES_PERMISOS.inventarios.inventario).toBeDefined();
      expect(ROLES_PERMISOS.inventarios.inventario).toContain('ver');
      expect(ROLES_PERMISOS.inventarios.inventario).toContain('modificar');
    });
  });

  describe('2. Controller Functions', () => {
    test('all remisiones controller functions should exist', () => {
      const controller = require('../controllers/remisionesController');
      
      expect(typeof controller.generarRemision).toBe('function');
      expect(typeof controller.cancelarRemision).toBe('function');
      expect(typeof controller.confirmarRemisionAlmacen).toBe('function');
      expect(typeof controller.corregirRemision).toBe('function');
      expect(typeof controller.confirmarRemisionFinanzas).toBe('function');
      expect(typeof controller.obtenerRemision).toBe('function');
      expect(typeof controller.listarRemisiones).toBe('function');
      expect(typeof controller.obtenerItemsPendientesSurtir).toBe('function');
    });
  });

  describe('3. Stock Return Logic', () => {
    test('cancelarRemision should have complete stock return logic', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Stock return
      expect(code).toContain('DEVOLVER STOCK');
      expect(code).toContain('cantidad = cantidad +');
      expect(code).toContain('cantidad_reservada = cantidad_reservada +');
      
      // Kardex reversal
      expect(code).toContain('REVERTIR MOVIMIENTO EN KARDEX');
      expect(code).toContain("tipo: 'ENTRADA'");
      expect(code).toContain("motivo: 'DEVOLUCION'");
      
      // Audit log
      expect(code).toContain('inventario_reservas_log');
      expect(code).toContain('REVERTIR_CANCELACION');
    });
  });

  describe('4. State Flow', () => {
    test('should have all required states defined', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      expect(code).toContain('BORRADOR');
      expect(code).toContain('PENDIENTE_REVISION');
      expect(code).toContain('CONFIRMADA');
      expect(code).toContain('EMITIDA');
    });

    test('CxC generation should be deferred until finanzas confirmation', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      expect(code).toContain('NO generar CXC hasta que finanzas confirme');
      expect(code).toContain('if (false && emitir_inmediatamente && pedido.es_credito)');
    });
  });

  describe('5. Routes Configuration', () => {
    test('routes should use inventarios role (not almacenista)', () => {
      const fs = require('fs');
      const routesPath = require.resolve('../routes/remisiones');
      const code = fs.readFileSync(routesPath, 'utf8');
      
      // Should use inventarios
      expect(code).toContain("authorizeRole(['inventarios'");
      expect(code).toContain("authorizeRole(['finanzas', 'inventarios'");
      
      // Should NOT use almacenista
      expect(code).not.toContain("'almacenista'");
    });

    test('routes should have all new endpoints', () => {
      const fs = require('fs');
      const routesPath = require.resolve('../routes/remisiones');
      const code = fs.readFileSync(routesPath, 'utf8');
      
      expect(code).toContain('/confirmar-almacen');
      expect(code).toContain('/corregir');
      expect(code).toContain('/confirmar-finanzas');
    });
  });

  describe('6. Historical Tracking', () => {
    test('should insert into historial_remisiones', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      expect(code).toContain('INSERT INTO historial_remisiones');
      expect(code).toContain('CONFIRMACION_ALMACEN');
      expect(code).toContain('CONFIRMACION_FINANZAS');
      expect(code).toContain('CORRECCION');
    });
  });

  describe('7. Migration File', () => {
    test('migration file should exist', () => {
      const fs = require('fs');
      const path = require('path');
      const migrationPath = path.join(__dirname, '..', 'migrations', '20260316_add_remisiones_workflow_columns.sql');
      
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    test('migration should create historial_remisiones table', () => {
      const fs = require('fs');
      const path = require('path');
      const migrationPath = path.join(__dirname, '..', 'migrations', '20260316_add_remisiones_workflow_columns.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS historial_remisiones');
      expect(sql).toContain('historial_id SERIAL PRIMARY KEY');
      expect(sql).toContain('remision_id INTEGER NOT NULL');
      expect(sql).toContain('accion VARCHAR(50) NOT NULL');
      expect(sql).toContain('detalles JSONB');
    });

    test('migration should add new columns to remisiones', () => {
      const fs = require('fs');
      const path = require('path');
      const migrationPath = path.join(__dirname, '..', 'migrations', '20260316_add_remisiones_workflow_columns.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      expect(sql).toContain('ALTER TABLE remisiones');
      expect(sql).toContain('fecha_confirmacion_almacen');
      expect(sql).toContain('confirmado_por_almacen');
      expect(sql).toContain('fecha_emision_final');
      expect(sql).toContain('confirmado_por_finanzas');
    });
  });

  describe('8. Documentation', () => {
    test('workflow documentation should exist', () => {
      const fs = require('fs');
      const path = require('path');
      const docPath = path.join(__dirname, '..', 'docs', 'REMISIONES_WORKFLOW.md');
      
      expect(fs.existsSync(docPath)).toBe(true);
    });

    test('documentation should describe workflow', () => {
      const fs = require('fs');
      const path = require('path');
      const docPath = path.join(__dirname, '..', 'docs', 'REMISIONES_WORKFLOW.md');
      const doc = fs.readFileSync(docPath, 'utf8');
      
      expect(doc).toContain('PENDIENTE_REVISION');
      expect(doc).toContain('CONFIRMADA');
      expect(doc).toContain('EMITIDA');
      expect(doc).toContain('Finanzas');
    });
  });
});
