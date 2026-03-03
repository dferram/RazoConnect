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
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const logger = require('./utils/logger');

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
  globalLimiter,
  tenantRateLimiter,
  heavyOperationLimiter
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

console.log(`[INFO] Configuracion de sesion: ${isProduction ? 'PRODUCCION' : 'DESARROLLO'}`);

// Session debug logging disabled - only errors are logged

configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session()); // CRÍTICO: Habilitar persistencia de sesión con Passport

// ============================================================================
// REQUEST ID MIDDLEWARE — Para tracking de logs
// ============================================================================
const crypto = require('crypto');

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

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
  const { getPoolMetrics } = require('./db');
  
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'unknown',
      redis: 'unknown'
    },
    pool: getPoolMetrics()
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
// RATE LIMITING POR TENANT
// ============================================================================
// Aplica rate limiting por combinación de IP + tenant_id
// Evita que un tenant abusivo afecte a otros en el SaaS
// Se ejecuta DESPUÉS de tenantGuard para tener acceso a req.tenantId
app.use('/api', tenantRateLimiter);

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
  
  // Archivos estáticos servidos desde carpeta del tenant
  
  // AISLAMIENTO TOTAL: Cada tenant sirve SOLO sus propios archivos
  // Si un archivo no existe, debe dar error 404, NO cargar del otro tenant
  express.static(tenantPath)(req, res, next);
});

// Servir iconos (favicon y otros) desde la carpeta /icon
app.use("/icon", express.static(path.join(__dirname, "icon")));

// Request logging disabled - only errors are logged

// ============================================================================
// API DOCUMENTATION — Swagger UI
// Solo disponible en desarrollo y staging, NO en producción pública
// ============================================================================
if (process.env.NODE_ENV !== 'production') {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'RazoConnect API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
    },
  }));
  console.log('[INFO] Swagger UI disponible en /api/docs');
}

// Endpoint JSON del spec (siempre disponible para herramientas)
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
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

// Redirigir rutas no encontradas a index o 404
app.get("*", (req, res) => {
  // Si no hay tenant asignado (bloqueado o no encontrado), redirigir a suspended
  if (!req.tenant) {
    console.warn(`⚠️ [Catch-all] No hay tenant asignado para ${req.path}, redirigiendo a /suspended.html`);
    return res.redirect('/suspended.html');
  }
  
  // Determinar carpeta del tenant dinámicamente desde la base de datos
  const tenantFolder = req.tenant.tema || 'razo';
  
  const fs = require('fs');
  const requestedPath = req.path.substring(1) || 'index.html';
  
  // Rutas especiales que siempre deben servir index.html (SPA)
  const spaRoutes = ['', 'inicio', 'productos', 'carrito', 'pedidos'];
  
  // Si es la raíz o una ruta SPA conocida, servir index.html
  if (requestedPath === '' || spaRoutes.includes(requestedPath)) {
    return res.sendFile(path.join(__dirname, "tenants_views", tenantFolder, "index.html"));
  }
  
  // Determinar el archivo a buscar
  let fileToServe = requestedPath;
  
  // Si no tiene extensión, asumir que es .html
  if (!requestedPath.includes('.')) {
    fileToServe = requestedPath + '.html';
  }
  
  const filePath = path.join(__dirname, "tenants_views", tenantFolder, fileToServe);
  
  // Verificar si el archivo existe
  if (fs.existsSync(filePath)) {
    // Archivo existe, servirlo
    return res.sendFile(filePath);
  }
  
  // Archivo no existe - mostrar 404
  console.log(`⚠️ [404] Archivo no encontrado: ${fileToServe}`);
  return res.status(404).sendFile(
    path.join(__dirname, "tenants_views", tenantFolder, "404.html")
  );
});

// ============================================================================
// MANEJO DE ERRORES HTTP CON PÁGINAS PERSONALIZADAS
// ============================================================================
// Middleware para servir páginas de error personalizadas
app.use((err, req, res, next) => {
  const tenantFolder = req.tenant?.tema || 'razo';
  const errorPage = path.join(__dirname, "tenants_views", tenantFolder);
  
  // Determinar qué página de error servir según el status code
  if (err.status === 401 || res.statusCode === 401) {
    return res.status(401).sendFile(path.join(errorPage, "401.html"));
  }
  
  if (err.status === 403 || res.statusCode === 403) {
    return res.status(403).sendFile(path.join(errorPage, "403.html"));
  }
  
  if (err.status === 429 || res.statusCode === 429) {
    return res.status(429).sendFile(path.join(errorPage, "429.html"));
  }
  
  if (err.status === 503 || res.statusCode === 503) {
    return res.status(503).sendFile(path.join(errorPage, "503.html"));
  }
  
  // Para cualquier otro error 5xx, servir 500.html
  if (err.status >= 500 || res.statusCode >= 500) {
    return res.status(500).sendFile(path.join(errorPage, "500.html"));
  }
  
  next(err);
});

// ============================================================================
// MANEJO DE ERRORES GLOBAL CON SANITIZACIÓN
// ============================================================================
// Previene exposición de información sensible en errores (OWASP)
app.use(sanitizeErrors);

// Iniciar el servidor
const server = app.listen(PORT, async () => {
  logger.info('Servidor iniciado', { port: PORT });

  // Probar conexión a la base de datos
  await db.testConnection();

  // Inicializar Redis para gestión de refresh tokens
  try {
    await initRedisClient();
    logger.info('Redis cliente inicializado');
  } catch (error) {
    logger.error('Redis inicialización fallida', { error: error.message });
    logger.warn('Sistema continuará sin Redis');
  }

  scheduleDailyMaintenance();
  logger.info('Sistema de mantenimiento diario activado');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
// Cerrar conexiones correctamente al detener el servidor
const gracefulShutdown = async (signal) => {
  logger.info('Shutdown iniciado', { signal });
  
  server.close(async () => {
    logger.info('Servidor HTTP cerrado');
    
    // Cerrar conexión de Redis
    try {
      await closeRedisConnection();
      logger.info('Redis desconectado');
    } catch (error) {
      logger.error('Error al cerrar Redis', { error: error.message });
    }
    
    // Cerrar pool de PostgreSQL
    try {
      await db.pool.end();
      logger.info('PostgreSQL desconectado');
    } catch (error) {
      logger.error('Error al cerrar PostgreSQL', { error: error.message });
    }
    
    logger.info('Proceso terminado correctamente');
    process.exit(0);
  });
  
  // Forzar cierre después de 10 segundos
  setTimeout(() => {
    logger.error('Forzando cierre después de timeout');
    process.exit(1);
  }, 10000);
};

// Escuchar señales de terminación
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
