/**
 * TEST SCRIPT: Redis Smart Fallback System
 * 
 * Verifica que el sistema funcione correctamente en modo desarrollo y producción.
 * 
 * Uso:
 *   NODE_ENV=development node scripts/test-redis-fallback.js
 *   NODE_ENV=production node scripts/test-redis-fallback.js
 */

require('dotenv').config();

const {
  initRedisClient,
  isRedisConnected,
  isUsingMock,
  saveRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  blacklistAccessToken,
  isTokenBlacklisted,
  closeRedisConnection
} = require('../config/redisClient');

async function testRedisSmartFallback() {
  console.log('\n🧪 ========================================');
  console.log('   REDIS SMART FALLBACK - TEST SUITE');
  console.log('========================================\n');

  const nodeEnv = process.env.NODE_ENV || 'development';
  console.log(`📋 Entorno: ${nodeEnv}`);
  console.log(`🔍 Esperado: ${nodeEnv === 'development' ? 'Mock en RAM' : 'Redis Real'}\n`);

  try {
    // 1. Inicializar cliente
    console.log('1️⃣ Inicializando cliente Redis...');
    await initRedisClient();
    
    const connected = isRedisConnected();
    const usingMock = isUsingMock();
    
    console.log(`   ✅ Conectado: ${connected}`);
    console.log(`   ✅ Usando Mock: ${usingMock}`);
    
    if (nodeEnv === 'development' && !usingMock) {
      console.error('   ❌ ERROR: Debería usar mock en desarrollo');
      process.exit(1);
    }
    
    if (nodeEnv === 'production' && usingMock) {
      console.error('   ❌ ERROR: No debería usar mock en producción');
      process.exit(1);
    }
    
    console.log('   ✅ Modo correcto detectado\n');

    // 2. Test: Guardar y obtener refresh token
    console.log('2️⃣ Test: Refresh Tokens');
    const userId = 123;
    const rol = 'cliente';
    const token = 'test_token_abc123';
    
    const saved = await saveRefreshToken(userId, rol, token, 60);
    console.log(`   ✅ Token guardado: ${saved}`);
    
    const retrieved = await getRefreshToken(userId, rol);
    console.log(`   ✅ Token recuperado: ${retrieved === token}`);
    
    if (retrieved !== token) {
      console.error(`   ❌ ERROR: Token no coincide. Esperado: ${token}, Obtenido: ${retrieved}`);
      process.exit(1);
    }
    
    const deleted = await deleteRefreshToken(userId, rol);
    console.log(`   ✅ Token eliminado: ${deleted}`);
    
    const afterDelete = await getRefreshToken(userId, rol);
    console.log(`   ✅ Token después de eliminar: ${afterDelete === null}\n`);

    // 3. Test: Blacklist de access tokens
    console.log('3️⃣ Test: Blacklist de Access Tokens');
    const tokenId = 'jti_test_xyz789';
    
    const blacklisted = await blacklistAccessToken(tokenId, 60);
    console.log(`   ✅ Token agregado a blacklist: ${blacklisted}`);
    
    const isBlacklisted = await isTokenBlacklisted(tokenId);
    console.log(`   ✅ Token está en blacklist: ${isBlacklisted}`);
    
    if (!isBlacklisted) {
      console.error('   ❌ ERROR: Token debería estar en blacklist');
      process.exit(1);
    }
    
    console.log('   ✅ Blacklist funciona correctamente\n');

    // 4. Test: TTL (Time To Live)
    console.log('4️⃣ Test: Expiración de Claves (TTL)');
    const shortLivedToken = 'short_lived_token';
    await saveRefreshToken(999, 'agente', shortLivedToken, 2); // 2 segundos
    
    const immediate = await getRefreshToken(999, 'agente');
    console.log(`   ✅ Token inmediato: ${immediate === shortLivedToken}`);
    
    console.log('   ⏳ Esperando 3 segundos para expiración...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const afterExpiry = await getRefreshToken(999, 'agente');
    console.log(`   ✅ Token después de expirar: ${afterExpiry === null}`);
    
    if (afterExpiry !== null) {
      console.error('   ❌ ERROR: Token debería haber expirado');
      process.exit(1);
    }
    
    console.log('   ✅ TTL funciona correctamente\n');

    // 5. Resumen
    console.log('✅ ========================================');
    console.log('   TODOS LOS TESTS PASARON');
    console.log('========================================\n');
    
    console.log('📊 Resumen:');
    console.log(`   - Entorno: ${nodeEnv}`);
    console.log(`   - Modo: ${usingMock ? 'Mock (RAM Local)' : 'Redis Real'}`);
    console.log(`   - Refresh Tokens: ✅`);
    console.log(`   - Blacklist: ✅`);
    console.log(`   - TTL: ✅`);
    console.log('');

    // Cerrar conexión
    await closeRedisConnection();
    console.log('🔒 Conexión cerrada correctamente\n');
    
    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR EN TEST:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar tests
testRedisSmartFallback();
