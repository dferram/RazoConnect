/**
 * Script para agregar auth-manager.js y token-validator.js a páginas de admin que no los tienen
 */

const fs = require('fs');
const path = require('path');

const ADMIN_DIR = path.join(__dirname, '..', 'tenants_views', 'razo');

// Páginas que ya tienen auth-manager.js (según grep anterior)
const PAGES_WITH_AUTH = [
  'admin-validar-pagos.html',
  'admin-toma-inventario.html',
  'admin-reportes.html',
  'admin-recepcion-oc.html',
  'admin-recibir-inventario.html',
  'admin-proveedor-detalle.html',
  'admin-proveedores.html',
  'admin-productos-oc.html',
  'admin-pedidos.html',
  'admin-pedido-detalle.html',
  'admin-producto-editar.html',
  'admin-ordenes-compra.html',
  'admin-orden-agrupada-detalle.html',
  'admin-numcuenta.html',
  'admin-movimientos.html',
  'admin-landing-editor.html',
  'admin-inventario.html',
  'admin-grupos-ordenes.html',
  'admin-edocuenta.html',
  'admin-edocuenta-detalle.html',
  'admin-dashboard.html',
  'admin-clientes.html',
  'admin-crear-oc.html',
  'admin-orden-compra-detalle.html',
  'admin-inventario-detalle.html',
  'admin-inventario-reportes.html',
];

function fixAdminPage(filePath) {
  const fileName = path.basename(filePath);
  
  // Si ya tiene auth-manager, skip
  if (PAGES_WITH_AUTH.includes(fileName)) {
    console.log(`✓ ${fileName} - Ya tiene auth-manager.js`);
    return { fixed: false, reason: 'already-has-auth' };
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Verificar si ya tiene auth-manager.js
  if (content.includes('auth-manager.js')) {
    console.log(`✓ ${fileName} - Ya tiene auth-manager.js (verificado)`);
    return { fixed: false, reason: 'already-has-auth' };
  }

  // Buscar el patrón de scripts al final del body
  const scriptPatterns = [
    // Patrón 1: layout.js defer + sidebar-toggle.js defer
    /(<script src="js\/layout\.js" defer><\/script>\s*<script src="js\/sidebar-toggle\.js" defer><\/script>)/,
    // Patrón 2: Solo layout.js
    /(<script src="js\/layout\.js"[^>]*><\/script>)/,
    // Patrón 3: Cualquier script antes de </body>
    /(<script[^>]*src="js\/[^"]*"[^>]*><\/script>)(\s*<\/body>)/,
  ];

  let matched = false;
  let newContent = content;

  for (const pattern of scriptPatterns) {
    if (pattern.test(content)) {
      // Agregar token-validator.js y auth-manager.js ANTES del primer script
      newContent = content.replace(pattern, (match, scriptTag, closingBody) => {
        matched = true;
        if (closingBody) {
          // Patrón 3: Antes de </body>
          return `    <script src="js/token-validator.js"></script>\n    <script src="js/auth-manager.js"></script>\n    <script src="js/api.js"></script>\n    ${scriptTag}${closingBody}`;
        } else {
          // Patrón 1 o 2: Antes de layout.js
          return `    <script src="js/token-validator.js"></script>\n    ${scriptTag}`;
        }
      });
      
      if (matched) break;
    }
  }

  if (!matched) {
    console.log(`⚠ ${fileName} - No se encontró patrón de scripts`);
    return { fixed: false, reason: 'no-pattern-found' };
  }

  // Verificar que se agregó correctamente
  if (!newContent.includes('auth-manager.js')) {
    console.log(`✗ ${fileName} - Error al agregar scripts`);
    return { fixed: false, reason: 'failed-to-add' };
  }

  // Guardar archivo
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`✓ ${fileName} - Scripts agregados correctamente`);
  return { fixed: true };
}

// Obtener todas las páginas admin-*.html
const files = fs.readdirSync(ADMIN_DIR)
  .filter(f => f.startsWith('admin-') && f.endsWith('.html'))
  .map(f => path.join(ADMIN_DIR, f));

console.log(`\nEncontradas ${files.length} páginas de admin\n`);

const results = {
  fixed: 0,
  alreadyHasAuth: 0,
  noPatternFound: 0,
  failedToAdd: 0,
};

files.forEach(file => {
  const result = fixAdminPage(file);
  
  if (result.fixed) {
    results.fixed++;
  } else if (result.reason === 'already-has-auth') {
    results.alreadyHasAuth++;
  } else if (result.reason === 'no-pattern-found') {
    results.noPatternFound++;
  } else if (result.reason === 'failed-to-add') {
    results.failedToAdd++;
  }
});

console.log('\n=== RESUMEN ===');
console.log(`Total páginas: ${files.length}`);
console.log(`✓ Corregidas: ${results.fixed}`);
console.log(`✓ Ya tenían auth-manager: ${results.alreadyHasAuth}`);
console.log(`⚠ Sin patrón encontrado: ${results.noPatternFound}`);
console.log(`✗ Error al agregar: ${results.failedToAdd}`);
