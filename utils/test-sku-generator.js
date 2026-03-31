const { generarSkuUnico, skuExiste, generarPrefijo } = require('./skuGenerator');

async function testSkuGenerator() {
  console.log('\nIniciando pruebas del generador de SKU...\n');
  
  try {
    console.log('--- Test 1: Generar SKU para "Torre Love" ---');
    const sku1 = await generarSkuUnico('Torre Love');
    console.log(`Resultado: ${sku1}\n`);
    
    console.log('--- Test 2: Generar SKU para "Cubo Liso" ---');
    const sku2 = await generarSkuUnico('Cubo Liso');
    console.log(`Resultado: ${sku2}\n`);
    
    console.log('--- Test 3: Generar SKU para "Amor Eterno" ---');
    const sku3 = await generarSkuUnico('Amor Eterno');
    console.log(`Resultado: ${sku3}\n`);
    
    console.log('--- Test 4: Verificar si SKU existe ---');
    const existe = await skuExiste('AMO-022');
    console.log(`¿Existe AMO-022?: ${existe}\n`);
    
    console.log('--- Test 5: Generar prefijo sin acentos ---');
    const prefijo = generarPrefijo('Corazón Mágico');
    console.log(`Prefijo de "Corazón Mágico": ${prefijo}\n`);
    
    console.log('Todas las pruebas completadas exitosamente');
    
  } catch (error) {
    console.error('Error en las pruebas:', error.message);
  }
  
  process.exit(0);
}

testSkuGenerator();
