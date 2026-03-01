require("dotenv").config();

// ============================================================================
// AUDITORÍA DE SEGURIDAD AL INICIO
// ============================================================================
// Validar que todas las variables de entorno críticas estén configuradas
// y que los secretos sean suficientemente fuertes (OWASP Security Misconfiguration)
const { runSecurityAudit } = require("./utils/secretsValidator");
runSecurityAudit();

const express = require("express");
const path = require("path");
const cors = require("cors");
const db = require("./db");
const passport = require("passport");
const configurePassport = require("./config/passport");
const { initRedisClient, closeRedisConnection } = require("./config/redisClient");

// Detectar entorno
const isProduction = process.env.NODE_ENV === 'production';


// Importar rutas
const authRoutes = require("./routes/auth");
const productosRoutes = require("./routes/productos");
const carritoRoutes = require("./routes/carrito");
const pedidosRoutes = require("./routes/pedidos");
const direccionesRoutes = require("./routes/direcciones");
const adminRouter = require("./routes/admin");
const reportesRoutes = require("./routes/reportes");
const publicRoutes = require("./routes/public");
const notificacionesRoutes = require("./routes/notificaciones");
const clientesRoutes = require("./routes/clientes");
const staffRoutes = require("./routes/staff");
const creditosRoutes = require("./routes/creditos");
const { scheduleDailyMaintenance } = require("./cron/dailyMaintenance");
const pagosRoutes = require("./routes/pagos");
const cuponesRoutes = require("./routes/cupones");
const developerRoutes = require("./routes/developer");
const remisionesRoutes = require("./routes/remisiones");
const agenteRoutes = require("./routes/agente");
const inventarioRoutes = require("./routes/inventario");
const devolucionesRoutes = require("./routes/devoluciones");
const favoritosRoutes = require("./routes/favoritos");

// Importar middlewares de seguridad
const tenantGuard = require("./middlewares/tenantGuard");
const validateUserTenant = require("./middlewares/validateUserTenant");
const createDynamicSessionMiddleware = require("./middlewares/dynamicSessionConfig");
const noCacheMiddleware = require("./middlewares/noCacheMiddleware");

// ============================================================================
// MIDDLEWARES DE SEGURIDAD (OWASP Best Practices)
// ============================================================================
const { 
  securityHeaders, 
  preventParameterPollution, 
  limitPayloadSize,
  sanitizeErrors 
} = require("./middlewares/securityHeaders");
const { 
  sanitizeInputs, 
  preventSQLInjection 
} = require("./middlewares/inputValidator");
const { 
  globalLimiter 
} = require("./middlewares/rateLimiter");

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;


// Habilitar proxy (CRÍTICO para Azure - terminación SSL)
app.set('trust proxy', 1);

// ============================================================================
// MIDDLEWARES DE SEGURIDAD GLOBALES
// ============================================================================

// 1. CABECERAS DE SEGURIDAD (OWASP Security Headers)
// Aplica CSP, X-Frame-Options, HSTS, etc.
app.use(securityHeaders);

// 2. PREVENCIÓN DE PARAMETER POLLUTION
// Previene ataques HPP (HTTP Parameter Pollution)
app.use(preventParameterPollution);

// 3. LÍMITE DE TAMAÑO DE PAYLOAD
// Previene ataques DoS mediante payloads masivos
app.use(limitPayloadSize('10mb'));

// 4. CORS CONFIGURADO CON WHITELIST ESTRICTA
// Lista blanca de orígenes permitidos
const allowedOrigins = [
  // Entornos de desarrollo local
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:5500', // Live Server
  
  // Producción Azure
  process.env.FRONTEND_BASE_URL, // URL configurada en .env
  'https://razoconnect-api.azurewebsites.net',
  
  // Dominios personalizados de producción
  'https://razo.com.mx',
  'https://www.razo.com.mx',
  'https://fashionrazo.com.mx',
  'https://www.fashionrazo.com.mx'
].filter(Boolean); // Filtrar valores undefined/null

// Configuración de CORS con validación estricta
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (ej: Postman, herramientas de desarrollo)
    // ✅ ASÍ DEBE QUEDAR
    if (!origin) {
    // Permitimos peticiones sin origen (navegación directa, Postman, etc.)
        return callback(null, true);
    }
    
    // Validar si el origin está en la whitelist
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log(`✅ [CORS] Origin permitido: ${origin}`);
      callback(null, true);
    } else {
      console.error(`❌ [CORS] Origin bloqueado: ${origin}`);
      callback(new Error('Bloqueado por política de CORS'));
    }
  },
  credentials: true, // Habilitar cookies y headers de autenticación
  optionsSuccessStatus: 200 // Compatibilidad con navegadores legacy
};

app.use(cors(corsOptions));

// 5. PARSEO DE JSON Y URL-ENCODED
app.use(express.json({ limit: '10mb' })); // Parsear JSON con límite de tamaño
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parsear datos de formularios

// 6. SANITIZACIÓN DE INPUTS (Previene XSS y SQL Injection básicos)
// Sanitiza req.body, req.query y req.params
app.use(sanitizeInputs);

// 7. DETECCIÓN DE SQL INJECTION
// Capa adicional de protección (las queries parametrizadas son la defensa principal)
app.use(preventSQLInjection);

// 8. RATE LIMITING GLOBAL DISTRIBUIDO CON REDIS
// Protege contra ataques de fuerza bruta y DDoS
// 300 peticiones por 15 minutos (distribuido entre todas las instancias)
app.use('/api', globalLimiter);

// ============================================================================
// CONFIGURACIÓN DE SESIONES CON PERSISTENCIA EN POSTGRESQL Y DOMINIO DINÁMICO
// ============================================================================
// Usar connect-pg-simple para almacenar sesiones en PostgreSQL
// El middleware dinámico configura cookies específicas por dominio para aislamiento total
app.use(createDynamicSessionMiddleware());

console.log(`🔐 Configuración de sesión: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
console.log(`   - Store: PostgreSQL (connect-pg-simple)`);
console.log(`   - Secure cookies: ${isProduction}`);
console.log(`   - SameSite: lax`);
console.log(`   - MaxAge: 7 días`);
console.log(`   - Trust proxy: enabled`);
console.log(`   - Domain isolation: ENABLED (dynamic per request)`);

// ============================================================================
// DEBUG LOGGING: SESIÓN Y AUTENTICACIÓN
// ============================================================================
// Logging detallado de sesiones para debugging de problemas de autenticación
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    // Log completo para rutas de autenticación
    if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin') || req.path.startsWith('/developer')) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🔐 [SESSION DEBUG] ${req.method} ${req.path}`);
      console.log(`   SessionID: ${req.sessionID || 'NONE'}`);
      console.log(`   User: ${req.user ? JSON.stringify(req.user) : 'None'}`);
      console.log(`   Session.user: ${req.session?.user ? JSON.stringify(req.session.user) : 'None'}`);
      console.log(`   Session.userId: ${req.session?.userId || 'None'}`);
      console.log(`   Session.tenant_id: ${req.session?.tenant_id || 'None'}`);
      console.log(`   Tenant: ${req.tenant ? `${req.tenant.nombre_cliente} (ID: ${req.tenant.tenant_id})` : 'None'}`);
      console.log(`   Cookie: ${req.headers.cookie ? 'Present' : 'Missing'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    }
    next();
  });
}

configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session()); // CRÍTICO: Habilitar persistencia de sesión con Passport

// ============================================================================
// SECCIÓN CRÍTICA: RUTAS DE EXCEPCIÓN (ANTES DEL TENANT GUARD)
// ============================================================================

// Rutas de Developer (sin tenantGuard - acceso administrativo siempre disponible)
app.use("/developer", developerRoutes);
app.use("/api/developer", developerRoutes);

// Ruta de servicio suspendido (sin tenantGuard - CRÍTICO para evitar bucle infinito)
app.get("/suspended", (req, res) => {
  res.sendFile(path.join(__dirname, "tenants_views", "suspended.html"));
});

app.get('/suspended.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'tenants_views', 'suspended.html'));
});

// Página de tienda no encontrada (debe estar ANTES del tenantGuard)
app.get('/tienda-no-encontrada', (req, res) => {
  res.sendFile(path.join(__dirname, 'tenants_views', 'tienda-no-encontrada.html'));
});

app.get('/tienda-no-encontrada.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'tenants_views', 'tienda-no-encontrada.html'));
});

// ============================================================================
// HEALTH CHECK — Azure App Service probe
// ============================================================================
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'unknown',
      redis: 'unknown'
    }
  };

  try {
    // Verificar base de datos con query mínima
    await db.query('SELECT 1');
    health.services.database = 'ok';
  } catch (err) {
    health.services.database = 'error';
    health.status = 'degraded';
  }

  try {
    // Verificar Redis si está disponible
    const redisClient = require('./config/redisClient').getRedisClient();
    if (redisClient) {
      await redisClient.ping();
      health.services.redis = 'ok';
    } else {
      health.services.redis = 'not_configured';
    }
  } catch (err) {
    health.services.redis = 'error';
    health.status = 'degraded';
  }

  const httpStatus = health.status === 'ok' ? 200 : 503;
  return res.status(httpStatus).json(health);
});

// ============================================================================
// MIDDLEWARE DE SEGURIDAD: TENANT GUARD
// ============================================================================
// IMPORTANTE: Este middleware se ejecuta ANTES de:
// - Archivos estáticos (login.html, registro.html, etc.)
// - Rutas de API (/api/auth, /api/productos, etc.)
// - Cualquier otra ruta pública
//
// El middleware tiene lógica interna para permitir:
// - /suspended (página de bloqueo)
// - /developer (panel administrativo)
// - /css, /js, /images, /assets (recursos estáticos)
// ============================================================================

app.use(tenantGuard);

// ============================================================================
// VALIDACIÓN DE TENANT PARA USUARIOS AUTENTICADOS
// ============================================================================
// Este middleware valida que usuarios autenticados pertenezcan al tenant correcto
// Se ejecuta DESPUÉS de tenantGuard (que detecta el tenant) y passport.session() (que carga el usuario)
app.use(validateUserTenant);

// ============================================================================
// NO-CACHE MIDDLEWARE PARA PÁGINAS PROTEGIDAS
// ============================================================================
// Aplica headers de no-caché a páginas HTML protegidas para prevenir acceso
// mediante el botón "Atrás" del navegador después de cerrar sesión
app.use((req, res, next) => {
  // Lista de rutas protegidas que requieren no-caché
  const protectedRoutes = [
    '/dashboard.html',
    '/admin-',
    '/agente-',
    '/staff-',
    '/perfil',
    '/carrito.html',
    '/pedidos',
    '/credito'
  ];

  // Verificar si la ruta actual es una página protegida
  const isProtectedPage = protectedRoutes.some(route => req.path.includes(route));

  if (isProtectedPage) {
    noCacheMiddleware(req, res, next);
  } else {
    next();
  }
});

// ============================================================================
// ARCHIVOS ESTÁTICOS (PROTEGIDOS POR TENANT GUARD)
// ============================================================================

// Middleware dinámico de archivos estáticos basado en tenant
app.use((req, res, next) => {
  // Determinar carpeta del tenant dinámicamente desde la base de datos
  // El campo 'tema' en la tabla tenants define qué carpeta usar ('razo' o 'fashion')
  const tenantFolder = req.tenant?.tema || 'razo'; // Default a 'razo' si no hay tema
  const tenantPath = path.join(__dirname, 'tenants_views', tenantFolder);
  
  // DEBUG: Logging para archivos CSS
  if (req.path.includes('.css')) {
    console.log('--- DEBUG ESTÁTICOS ---');
    console.log('Path solicitado:', req.path);
    console.log('Tenant folder:', tenantFolder);
    console.log('Buscando en:', path.join(tenantPath, req.path));
    console.log('Path absoluto completo:', path.resolve(tenantPath, req.path.substring(1)));
  }
  
  // AISLAMIENTO TOTAL: Cada tenant sirve SOLO sus propios archivos
  // Si un archivo no existe, debe dar error 404, NO cargar del otro tenant
  express.static(tenantPath)(req, res, next);
});

// Servir iconos (favicon y otros) desde la carpeta /icon
app.use("/icon", express.static(path.join(__dirname, "icon")));

// ============================================================================
// MIDDLEWARE DE LOGGING
// ============================================================================

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// ENDPOINTS DE UTILIDAD
// ============================================================================

// Endpoint de prueba
app.get("/api", (req, res) => {
  res.json({
    message: "¡Bienvenido a RazoConnect API!",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// Endpoint para verificar la conexión a la base de datos
app.get("/api/health", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.json({
      status: "healthy",
      database: "connected",
      timestamp: result.rows[0].now,
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: error.message,
    });
  }
});

// ============================================================================
// RUTAS DE LA APLICACIÓN (PROTEGIDAS POR TENANT GUARD)
// ============================================================================

app.use("/api", authRoutes);
app.use("/api", productosRoutes);
app.use("/api", carritoRoutes);
app.use("/api", pedidosRoutes);
app.use("/api", direccionesRoutes);
app.use("/api/notificaciones", notificacionesRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/cliente", clientesRoutes);
app.use("/api/admin", adminRouter);
app.use("/api/creditos", creditosRoutes);
app.use("/api/admin/reportes", reportesRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/pagos", pagosRoutes);
app.use("/api/cupones", cuponesRoutes);
// COMENTADO TEMPORALMENTE - Remisiones no se usarán por el momento pero se conservan para uso futuro
// app.use("/api/remisiones", remisionesRoutes);
app.use("/api/agente", agenteRoutes);
app.use("/api/inventario", inventarioRoutes);
app.use("/api", devolucionesRoutes);
app.use("/api/favoritos", favoritosRoutes);

// Manejo de rutas no encontradas solo para API
app.use("/api/*", (req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada",
    path: req.path,
  });
});

// Redirigir rutas no encontradas a index
app.get("*", (req, res) => {
  // Si no hay tenant asignado (bloqueado o no encontrado), redirigir a suspended
  if (!req.tenant) {
    console.warn(`⚠️ [Catch-all] No hay tenant asignado para ${req.path}, redirigiendo a /suspended.html`);
    return res.redirect('/suspended.html');
  }
  
  // Determinar carpeta del tenant dinámicamente desde la base de datos
  // El campo 'tema' en la tabla tenants define qué carpeta usar ('razo' o 'fashion')
  const tenantFolder = req.tenant.tema || 'razo'; // Default a 'razo' si no hay tema
  res.sendFile(path.join(__dirname, "tenants_views", tenantFolder, "index.html"));
});

// ============================================================================
// MANEJO DE ERRORES GLOBAL CON SANITIZACIÓN
// ============================================================================
// Previene exposición de información sensible en errores (OWASP)
app.use(sanitizeErrors);

// Iniciar el servidor
const server = app.listen(PORT, async () => {
  console.log(`Servidor RazoConnect corriendo en puerto ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Endpoint de prueba: http://localhost:${PORT}/api`);

  // Probar conexión a la base de datos
  await db.testConnection();

  // Inicializar Redis para gestión de refresh tokens
  try {
    await initRedisClient();
    console.log("✅ [REDIS] Cliente inicializado correctamente");
  } catch (error) {
    console.error("❌ [REDIS] Error al inicializar cliente:", error.message);
    console.warn("⚠️  [REDIS] El sistema continuará sin Redis (tokens de larga duración)");
  }

  scheduleDailyMaintenance();
  console.log("[CRON] Sistema de mantenimiento diario activado.");
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
// Cerrar conexiones correctamente al detener el servidor
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 [SHUTDOWN] Señal ${signal} recibida, cerrando servidor...`);
  
  server.close(async () => {
    console.log("[SHUTDOWN] Servidor HTTP cerrado");
    
    // Cerrar conexión de Redis
    try {
      await closeRedisConnection();
      console.log("[SHUTDOWN] Redis desconectado");
    } catch (error) {
      console.error("[SHUTDOWN] Error al cerrar Redis:", error);
    }
    
    // Cerrar pool de PostgreSQL
    try {
      await db.pool.end();
      console.log("[SHUTDOWN] PostgreSQL desconectado");
    } catch (error) {
      console.error("[SHUTDOWN] Error al cerrar PostgreSQL:", error);
    }
    
    console.log("[SHUTDOWN] Proceso terminado correctamente");
    process.exit(0);
  });
  
  // Forzar cierre después de 10 segundos
  setTimeout(() => {
    console.error("⚠️  [SHUTDOWN] Forzando cierre después de timeout");
    process.exit(1);
  }, 10000);
};

// Escuchar señales de terminación
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
