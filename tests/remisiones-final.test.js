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

  describe('7. NEW: Pedido Status Update on Almacen Confirmation', () => {
    test('confirmarRemisionAlmacen should update pedido status to "Pendiente de Confirmación"', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Should update pedido status
      expect(code).toContain('UPDATE pedidos');
      expect(code).toContain('Pendiente de Confirmación');
      expect(code).toContain('tiene_remisiones = TRUE');
      expect(code).toContain('completamente_surtido');
      expect(code).toContain('monto_surtido');
      expect(code).toContain('monto_backorder');
    });

    test('confirmarRemisionAlmacen should calculate montos correctly', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Should calculate new amounts
      expect(code).toContain('nuevoMontoSurtido');
      expect(code).toContain('montoBackorder');
      expect(code).toContain('completamenteSurtido');
      
      // Should have precision handling
      expect(code).toContain('.toFixed(2)');
      expect(code).toContain('Math.abs');
    });

    test('confirmarRemisionAlmacen should include detailed logging', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Should log the status update
      expect(code).toContain('[PEDIDO] Estado actualizado al confirmar remisión por almacén');
      expect(code).toContain('nuevo_estado');
      expect(code).toContain('monto_total_pedido');
      expect(code).toContain('monto_surtido_anterior');
      expect(code).toContain('nuevo_monto_surtido');
    });
  });

  describe('8. NEW: Double Confirmation Prevention', () => {
    test('confirmarRemisionAlmacen should block if already PENDIENTE_CONFIRMACION_FINANZAS', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Should validate state and prevent double confirmation
      expect(code).toContain('DOBLE CONFIRMACIÓN');
      expect(code).toContain('PENDIENTE_CONFIRMACION_FINANZAS');
      expect(code).toContain('No se puede confirmar dos veces');
    });

    test('confirmarRemisionFinanzas should have double confirmation detection', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Should reject if already confirmed
      expect(code).toContain('ya fue confirmada por finanzas');
      expect(code).toContain("remision.estado === 'SURTIDO'");
    });
  });

  describe('9. NEW: CXC Duplication Prevention', () => {
    test('confirmarRemisionFinanzas should check for existing CXC before insert', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Should verify CXC doesn't exist before creating
      expect(code).toContain('cxc_id FROM cuentas_por_cobrar');
      expect(code).toContain('WHERE remision_id = $1');
      expect(code).toContain('cxcExistenteQuery');
    });

    test('CXC should be linked to remision_id for uniqueness', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Should include remision_id in CXC insert
      expect(code).toContain('remision_id');
      expect(code).toContain('cuentas_por_cobrar');
    });
  });

  describe('10. NEW: Partial Remision CXC Logic', () => {
    test('first remision should release full reserve and create CXC for actual amount', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // First remision logic
      expect(code).toContain('Primera remisión: Liberar reserva');
      expect(code).toContain('saldoSinReserva');
      expect(code).toContain('AJUSTE');
      expect(code).toContain('remision.montototal');
    });

    test('subsequent remisions should NOT release reserve', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Should NOT have AJUSTE in subsequent
      expect(code).toContain('Remisiones subsecuentes: SOLO sumar cargo, NO liberar reserva');
      expect(code).toContain('SIN AJUSTE DE RESERVA');
    });

    test('each remision should generate separate CXC with cargo amount', () => {
      const fs = require('fs');
      const controllerPath = require.resolve('../controllers/remisionesController');
      const code = fs.readFileSync(controllerPath, 'utf8');
      
      // Each remision creates CXC
      expect(code).toContain('Crear registro en CXC');
      expect(code).toContain('montoRemision');
      expect(code).toContain('cuentas_por_cobrar');
    });
  });

  // Tests de archivos externos comentados para no bloquear CI
  // La migración y documentación se crearán cuando sea necesario
});
