// Test simple para verificar el mock client
process.env.NODE_ENV = 'development';

const redisModule = require('../../config/redisClient');

async function testMock() {
  console.log('Inicializando Redis...');
  await redisModule.initRedisClient();
  
  console.log('Obteniendo cliente...');
  const client = await redisModule.getRedisClient();
  
  console.log('Cliente:', client);
  console.log('Tipo de cliente:', typeof client);
  console.log('Métodos disponibles:', Object.keys(client || {}));
  
  if (client && client.set) {
    console.log('\n✅ Probando SET...');
    await client.set('test', 'value');
    console.log('SET exitoso');
    
    console.log('\n✅ Probando GET...');
    const value = await client.get('test');
    console.log('GET retornó:', value);
  } else {
    console.log('\n❌ Cliente no tiene método set');
  }
}

testMock().catch(console.error);
