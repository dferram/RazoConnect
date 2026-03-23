/**
 * Verification Script: Priority Orders Implementation
 * Verifies all components are correctly implemented and secure
 */

const { pool } = require('../db');
const fs = require('fs');
const path = require('path');

const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m'
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

async function verifyDatabaseSchema() {
  log('\n📊 Verificando Esquema de Base de Datos...', COLORS.BLUE);
  
  try {
    // Check pedidos.es_prioritario column
    const columnResult = await pool.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'pedidos' AND column_name = 'es_prioritario'
    `);
    
    if (columnResult.rows.length === 0) {
      log('❌ FALLO: Columna pedidos.es_prioritario no existe', COLORS.RED);
      return false;
    }
    
    const column = columnResult.rows[0];
    if (column.data_type !== 'boolean') {
      log(`❌ FALLO: es_prioritario debe ser boolean, es: ${column.data_type}`, COLORS.RED);
      return false;
    }
    
    if (!column.column_default || !column.column_default.includes('false')) {
      log('⚠️  ADVERTENCIA: es_prioritario no tiene default false', COLORS.YELLOW);
    }
    
    log('✅ Columna pedidos.es_prioritario existe y es correcta', COLORS.GREEN);
    
    // Check notificaciones constraint
    const constraintResult = await pool.query(`
      SELECT pg_get_constraintdef(oid) as constraint_def
      FROM pg_constraint
      WHERE conname = 'notificaciones_tipo_check'
    `);
    
    if (constraintResult.rows.length === 0) {
      log('❌ FALLO: Constraint notificaciones_tipo_check no existe', COLORS.RED);
      return false;
    }
    
    const constraintDef = constraintResult.rows[0].constraint_def;
    if (!constraintDef.includes('prioridad_pedido')) {
      log('❌ FALLO: Constraint no incluye tipo prioridad_pedido', COLORS.RED);
      log(`   Constraint actual: ${constraintDef}`, COLORS.YELLOW);
      return false;
    }
    
    log('✅ Constraint notificaciones_tipo_check incluye prioridad_pedido', COLORS.GREEN);
    
    // Check index on administrador_id
    const indexResult = await pool.query(`
      SELECT indexname FROM pg_indexes 
      WHERE tablename = 'notificaciones' 
      AND indexname = 'idx_notificaciones_administrador_id'
    `);
    
    if (indexResult.rows.length > 0) {
      log('✅ Índice idx_notificaciones_administrador_id existe', COLORS.GREEN);
    } else {
      log('⚠️  ADVERTENCIA: Índice idx_notificaciones_administrador_id no existe (performance subóptima)', COLORS.YELLOW);
    }
    
    return true;
  } catch (error) {
    log(`❌ ERROR verificando esquema: ${error.message}`, COLORS.RED);
    return false;
  }
}

async function verifyBackendCode() {
  log('\n🔧 Verificando Código Backend...', COLORS.BLUE);
  
  try {
    // Check controller exists
    const controllerPath = path.join(__dirname, '../controllers/pedidosAdminController.js');
    if (!fs.existsSync(controllerPath)) {
      log('❌ FALLO: pedidosAdminController.js no existe', COLORS.RED);
      return false;
    }
    
    const controllerContent = fs.readFileSync(controllerPath, 'utf8');
    
    // Check setPrioritario function exists
    if (!controllerContent.includes('const setPrioritario')) {
      log('❌ FALLO: Función setPrioritario no existe', COLORS.RED);
      return false;
    }
    log('✅ Función setPrioritario existe', COLORS.GREEN);
    
    // Check transaction usage
    if (!controllerContent.includes('await client.query(\'BEGIN\')')) {
      log('❌ FALLO: setPrioritario no usa transacciones', COLORS.RED);
      return false;
    }
    log('✅ setPrioritario usa transacciones (BEGIN/COMMIT/ROLLBACK)', COLORS.GREEN);
    
    // Check tenant isolation
    const setPrioritarioMatch = controllerContent.match(/const setPrioritario[\s\S]*?^};/m);
    if (!setPrioritarioMatch) {
      log('⚠️  ADVERTENCIA: No se pudo extraer función setPrioritario completa', COLORS.YELLOW);
    } else {
      const functionBody = setPrioritarioMatch[0];
      const tenantChecks = (functionBody.match(/tenant_id/g) || []).length;
      if (tenantChecks < 3) {
        log('❌ FALLO: Verificación de tenant_id insuficiente (encontrados: ' + tenantChecks + ')', COLORS.RED);
        return false;
      }
      log(`✅ Verificación de tenant_id correcta (${tenantChecks} verificaciones)`, COLORS.GREEN);
    }
    
    // Check input validation
    if (!controllerContent.includes('typeof prioritario !== \'boolean\'')) {
      log('❌ FALLO: Falta validación de tipo boolean para prioritario', COLORS.RED);
      return false;
    }
    log('✅ Validación de entrada (boolean) correcta', COLORS.GREEN);
    
    // Check notification creation
    if (!controllerContent.includes('INSERT INTO notificaciones')) {
      log('❌ FALLO: No se crean notificaciones', COLORS.RED);
      return false;
    }
    
    if (!controllerContent.includes('administrador_id')) {
      log('❌ FALLO: Notificaciones no usan administrador_id', COLORS.RED);
      return false;
    }
    log('✅ Creación de notificaciones correcta', COLORS.GREEN);
    
    // Check module exports
    if (!controllerContent.includes('setPrioritario') || 
        !controllerContent.match(/module\.exports[\s\S]*setPrioritario/)) {
      log('❌ FALLO: setPrioritario no está exportado', COLORS.RED);
      return false;
    }
    log('✅ setPrioritario exportado correctamente', COLORS.GREEN);
    
    // Check routes
    const routesPath = path.join(__dirname, '../routes/admin.js');
    if (!fs.existsSync(routesPath)) {
      log('❌ FALLO: routes/admin.js no existe', COLORS.RED);
      return false;
    }
    
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    
    if (!routesContent.includes('/pedidos/:id/prioritario')) {
      log('❌ FALLO: Ruta /pedidos/:id/prioritario no existe', COLORS.RED);
      return false;
    }
    log('✅ Ruta /pedidos/:id/prioritario existe', COLORS.GREEN);
    
    // Check authorization middleware
    const routeMatch = routesContent.match(/router\.post\([\s\S]*?\/pedidos\/:id\/prioritario[\s\S]*?\)/);
    if (!routeMatch) {
      log('⚠️  ADVERTENCIA: No se pudo verificar middleware de la ruta', COLORS.YELLOW);
    } else {
      const routeDef = routeMatch[0];
      if (!routeDef.includes('authenticate')) {
        log('❌ FALLO: Ruta no tiene middleware authenticate', COLORS.RED);
        return false;
      }
      if (!routeDef.includes('authorizeRole')) {
        log('❌ FALLO: Ruta no tiene middleware authorizeRole', COLORS.RED);
        return false;
      }
      if (!routeDef.includes('finanzas')) {
        log('❌ FALLO: Ruta no autoriza rol finanzas', COLORS.RED);
        return false;
      }
      log('✅ Ruta tiene middlewares de autenticación y autorización correctos', COLORS.GREEN);
    }
    
    return true;
  } catch (error) {
    log(`❌ ERROR verificando código backend: ${error.message}`, COLORS.RED);
    return false;
  }
}

async function verifyFrontendCode() {
  log('\n🎨 Verificando Código Frontend...', COLORS.BLUE);
  
  try {
    const htmlPath = path.join(__dirname, '../tenants_views/razo/admin-pedido-detalle.html');
    if (!fs.existsSync(htmlPath)) {
      log('❌ FALLO: admin-pedido-detalle.html no existe', COLORS.RED);
      return false;
    }
    
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Check priority badge
    if (!htmlContent.includes('id="prioridadBadge"')) {
      log('❌ FALLO: Badge de prioridad (prioridadBadge) no existe', COLORS.RED);
      return false;
    }
    log('✅ Badge de prioridad existe', COLORS.GREEN);
    
    // Check priority button
    if (!htmlContent.includes('id="btnTogglePrioridad"')) {
      log('❌ FALLO: Botón de prioridad (btnTogglePrioridad) no existe', COLORS.RED);
      return false;
    }
    
    if (!htmlContent.includes('onclick="togglePrioridad()"')) {
      log('❌ FALLO: Botón no tiene onclick handler togglePrioridad', COLORS.RED);
      return false;
    }
    log('✅ Botón de prioridad existe con handler correcto', COLORS.GREEN);
    
    // Check CSS for bajo pedido items
    if (!htmlContent.includes('.item-bajo-pedido')) {
      log('❌ FALLO: CSS para items bajo pedido no existe', COLORS.RED);
      return false;
    }
    
    if (!htmlContent.includes('opacity: 0.55')) {
      log('❌ FALLO: CSS no aplica opacidad a items bajo pedido', COLORS.RED);
      return false;
    }
    
    if (!htmlContent.includes('BAJO PEDIDO')) {
      log('❌ FALLO: CSS no muestra badge "BAJO PEDIDO"', COLORS.RED);
      return false;
    }
    log('✅ CSS para items bajo pedido correcto (opacidad + badge)', COLORS.GREEN);
    
    // Check togglePrioridad function
    if (!htmlContent.includes('window.togglePrioridad')) {
      log('❌ FALLO: Función window.togglePrioridad no existe', COLORS.RED);
      return false;
    }
    log('✅ Función togglePrioridad existe', COLORS.GREEN);
    
    // Check API call in togglePrioridad
    const toggleMatch = htmlContent.match(/window\.togglePrioridad[\s\S]*?};/);
    if (!toggleMatch) {
      log('⚠️  ADVERTENCIA: No se pudo extraer función togglePrioridad', COLORS.YELLOW);
    } else {
      const funcBody = toggleMatch[0];
      if (!funcBody.includes('/api/admin/pedidos/')) {
        log('❌ FALLO: togglePrioridad no llama al endpoint correcto', COLORS.RED);
        return false;
      }
      if (!funcBody.includes('/prioritario')) {
        log('❌ FALLO: togglePrioridad no llama a /prioritario', COLORS.RED);
        return false;
      }
      if (!funcBody.includes('Authorization')) {
        log('❌ FALLO: togglePrioridad no incluye token de autorización', COLORS.RED);
        return false;
      }
      log('✅ Función togglePrioridad llama correctamente al API', COLORS.GREEN);
    }
    
    // Check reordering logic
    if (!htmlContent.includes('productosConStock') || !htmlContent.includes('productosBajoPedido')) {
      log('❌ FALLO: Lógica de reordenamiento no existe', COLORS.RED);
      return false;
    }
    
    if (!htmlContent.includes('...productosConStock, ...productosBajoPedido')) {
      log('❌ FALLO: Items no se reordenan correctamente', COLORS.RED);
      return false;
    }
    log('✅ Lógica de reordenamiento correcta (stock primero)', COLORS.GREEN);
    
    // Check role-based visibility
    if (!htmlContent.includes('puedeMarcarPrioridad')) {
      log('❌ FALLO: Visibilidad basada en rol no implementada', COLORS.RED);
      return false;
    }
    
    const visibilityMatch = htmlContent.match(/puedeMarcarPrioridad[\s\S]{0,200}finanzas/);
    if (!visibilityMatch) {
      log('❌ FALLO: Verificación de rol finanzas no encontrada', COLORS.RED);
      return false;
    }
    log('✅ Visibilidad basada en rol correcta', COLORS.GREEN);
    
    return true;
  } catch (error) {
    log(`❌ ERROR verificando código frontend: ${error.message}`, COLORS.RED);
    return false;
  }
}

async function verifySecurityMeasures() {
  log('\n🔒 Verificando Medidas de Seguridad...', COLORS.BLUE);
  
  try {
    const controllerPath = path.join(__dirname, '../controllers/pedidosAdminController.js');
    const controllerContent = fs.readFileSync(controllerPath, 'utf8');
    
    // Check SQL injection prevention (parameterized queries)
    const setPrioritarioMatch = controllerContent.match(/const setPrioritario[\s\S]*?^};/m);
    if (setPrioritarioMatch) {
      const funcBody = setPrioritarioMatch[0];
      
      // Should NOT have string concatenation in queries
      if (funcBody.match(/query\(['"]\s*SELECT.*\+/) || 
          funcBody.match(/query\(['"]\s*UPDATE.*\+/) ||
          funcBody.match(/query\(['"]\s*INSERT.*\+/)) {
        log('❌ FALLO CRÍTICO: Posible SQL injection - queries usan concatenación', COLORS.RED);
        return false;
      }
      
      // Should use parameterized queries ($1, $2, etc)
      const paramQueries = (funcBody.match(/\$\d+/g) || []).length;
      if (paramQueries < 5) {
        log(`⚠️  ADVERTENCIA: Pocas queries parametrizadas (${paramQueries})`, COLORS.YELLOW);
      } else {
        log(`✅ Queries parametrizadas correctamente (${paramQueries} parámetros)`, COLORS.GREEN);
      }
    }
    
    // Check error handling
    if (!controllerContent.includes('try {') || 
        !controllerContent.includes('catch (error)')) {
      log('❌ FALLO: Falta manejo de errores try/catch', COLORS.RED);
      return false;
    }
    log('✅ Manejo de errores implementado', COLORS.GREEN);
    
    // Check that errors don't expose sensitive info in production
    if (controllerContent.includes('process.env.NODE_ENV')) {
      log('✅ Errores condicionales según NODE_ENV', COLORS.GREEN);
    } else {
      log('⚠️  ADVERTENCIA: Errores podrían exponer información en producción', COLORS.YELLOW);
    }
    
    // Check logging
    if (!controllerContent.includes('logger.info') && !controllerContent.includes('logger.error')) {
      log('⚠️  ADVERTENCIA: No hay logging implementado', COLORS.YELLOW);
    } else {
      log('✅ Logging implementado', COLORS.GREEN);
    }
    
    return true;
  } catch (error) {
    log(`❌ ERROR verificando seguridad: ${error.message}`, COLORS.RED);
    return false;
  }
}

async function runAllVerifications() {
  log('═══════════════════════════════════════════════════════════', COLORS.BLUE);
  log('   VERIFICACIÓN DE IMPLEMENTACIÓN: PEDIDOS PRIORITARIOS    ', COLORS.BLUE);
  log('═══════════════════════════════════════════════════════════', COLORS.BLUE);
  
  const results = {
    database: await verifyDatabaseSchema(),
    backend: await verifyBackendCode(),
    frontend: await verifyFrontendCode(),
    security: await verifySecurityMeasures()
  };
  
  log('\n═══════════════════════════════════════════════════════════', COLORS.BLUE);
  log('                      RESUMEN FINAL                         ', COLORS.BLUE);
  log('═══════════════════════════════════════════════════════════', COLORS.BLUE);
  
  Object.entries(results).forEach(([key, passed]) => {
    const icon = passed ? '✅' : '❌';
    const color = passed ? COLORS.GREEN : COLORS.RED;
    const label = key.toUpperCase().padEnd(20);
    log(`${icon} ${label}: ${passed ? 'PASÓ' : 'FALLÓ'}`, color);
  });
  
  const allPassed = Object.values(results).every(r => r === true);
  
  log('\n═══════════════════════════════════════════════════════════', COLORS.BLUE);
  if (allPassed) {
    log('   ✅ TODAS LAS VERIFICACIONES PASARON - LISTO PARA DEPLOY   ', COLORS.GREEN);
  } else {
    log('   ❌ ALGUNAS VERIFICACIONES FALLARON - REQUIERE ATENCIÓN    ', COLORS.RED);
  }
  log('═══════════════════════════════════════════════════════════', COLORS.BLUE);
  
  return allPassed;
}

// Run verification
if (require.main === module) {
  runAllVerifications()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      log(`\n❌ ERROR FATAL: ${error.message}`, COLORS.RED);
      console.error(error);
      process.exit(1);
    })
    .finally(() => {
      pool.end();
    });
}

module.exports = { runAllVerifications };
