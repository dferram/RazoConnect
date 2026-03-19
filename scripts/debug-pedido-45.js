const db = require('../db');

async function debugPedido() {
  const client = await db.getClient();
  
  try {
    const pedidoId = 45;
    
    console.log(`🔍 Debuggeando Pedido #${pedidoId}...\n`);
    
    // Get pedido info
    const pedidoQuery = `
      SELECT pedidoid, estatus, montototal, completamente_surtido
      FROM pedidos
      WHERE pedidoid = $1
    `;
    const pedidoResult = await client.query(pedidoQuery, [pedidoId]);
    
    if (pedidoResult.rows.length === 0) {
      console.log('❌ Pedido no encontrado');
      return;
    }
    
    console.log('📦 Información del Pedido:');
    console.log(pedidoResult.rows[0]);
    console.log('');
    
    // Get all products
    const productosQuery = `
      SELECT 
        detalleid,
        cantidadpaquetes,
        cantidadsurtida,
        esbackorder,
        precioporpaquete,
        piezastotales
      FROM detallesdelpedido
      WHERE pedidoid = $1
      ORDER BY detalleid
    `;
    
    const productosResult = await client.query(productosQuery, [pedidoId]);
    
    console.log(`📊 Productos del pedido (${productosResult.rows.length} total):\n`);
    
    let conStock = 0;
    let backorder = 0;
    let surtidos = 0;
    let disponiblesParaSurtir = 0;
    
    productosResult.rows.forEach(p => {
      const status = p.cantidadsurtida > 0 ? '✅ SURTIDO' : 
                     p.esbackorder ? '📦 BACKORDER' : 
                     '🟢 CON STOCK';
      
      const subtotal = (p.cantidadpaquetes * parseFloat(p.precioporpaquete)).toFixed(2);
      console.log(`DetalleID: ${p.detalleid} | ${status}`);
      console.log(`  Cantidad: ${p.cantidadpaquetes} paquetes`);
      console.log(`  Surtida: ${p.cantidadsurtida}`);
      console.log(`  esBackorder: ${p.esbackorder}`);
      console.log(`  Subtotal: $${subtotal}`);
      console.log('');
      
      if (p.cantidadsurtida > 0) {
        surtidos++;
      } else if (p.esbackorder) {
        backorder++;
      } else {
        conStock++;
        if (p.cantidadsurtida === 0) {
          disponiblesParaSurtir++;
        }
      }
    });
    
    console.log('📈 Resumen:');
    console.log(`  Total productos: ${productosResult.rows.length}`);
    console.log(`  Con stock (no backorder): ${conStock}`);
    console.log(`  Backorder: ${backorder}`);
    console.log(`  Ya surtidos: ${surtidos}`);
    console.log(`  Disponibles para surtir: ${disponiblesParaSurtir}`);
    console.log('');
    
    // Show which detalleIds would be valid for surtir
    const validIds = productosResult.rows
      .filter(p => p.cantidadsurtida === 0 && !p.esbackorder)
      .map(p => p.detalleid);
    
    console.log('✅ DetalleIDs válidos para surtir (cantidadsurtida=0 AND esbackorder=false):');
    console.log(validIds);
    console.log('');
    
    // Show which detalleIds would be valid with new logic (no esbackorder filter)
    const validIdsNew = productosResult.rows
      .filter(p => p.cantidadsurtida === 0)
      .map(p => p.detalleid);
    
    console.log('✅ DetalleIDs válidos con nueva lógica (cantidadsurtida=0, sin filtro esbackorder):');
    console.log(validIdsNew);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

debugPedido();
