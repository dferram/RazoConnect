require("dotenv").config();
console.log('--- DEBUG DE VARIABLES ---');
console.log('1. Valor crudo de NODE_ENV:', process.env.NODE_ENV);
console.log('2. Tipo de dato:', typeof process.env.NODE_ENV);
console.log('3. ¿Es production?:', process.env.NODE_ENV === 'production');
console.log('--------------------------');

const express = require("express");
const path = require("path");
const cors = require("cors");
const session = require("express-session");
const db = require("./db");
const passport = require("passport");
const configurePassport = require("./config/passport");

// Habilitar proxy (CRÍTICO para Azure - terminación SSL)
app.set('trust proxy', 1);
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

// Importar middlewares
const tenantGuard = require("./middlewares/tenantGuard");

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors({
  origin: true,
  credentials: true
})); // Habilitar CORS con credenciales
app.use(express.json()); // Parsear JSON en el body de las peticiones
app.use(express.urlencoded({ extended: true })); // Parsear datos de formularios

// Habilitar proxy (CRÍTICO para Azure - terminación SSL)
app.set('trust proxy', 1);

// Configurar sesiones con configuración dinámica según entorno
app.use(session({
  secret: process.env.SESSION_SECRET || 'razoconnect-dev-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'razoconnect.sid',
  proxy: true, // <--- Importante forzar esto para Azure
  cookie: {
    secure: isProduction, // TRUE en Azure (HTTPS), FALSE en Localhost (HTTP)
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax', // 'none' para dominios diferentes en producción, 'lax' para local
    maxAge: 1000 * 60 * 60 * 24 // 1 día (24 horas)
  }
}));

app.use(session({
    secret: process.env.SESSION_SECRET || 'super_secreto_razo',
    resave: false,
    saveUninitialized: false,
    proxy: true, // <--- Importante forzar esto para Azure
    cookie: {
        secure: isProduction, // TRUE en Azure (HTTPS), FALSE en Localhost
        httpOnly: true,       // Evita robo de cookies por JS
        sameSite: isProduction ? 'none' : 'lax', // 'none' es vital para cross-site en la nube
        maxAge: 1000 * 60 * 60 * 24 // 1 día
    }
}));

console.log(`🔐 Configuración de sesión: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
console.log(`   - Secure cookies: ${isProduction}`);
console.log(`   - SameSite: ${isProduction ? 'none' : 'lax'}`);
console.log(`   - Trust proxy: enabled`);

// Logging de sesiones en desarrollo
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (req.path.startsWith('/developer') || req.path.startsWith('/api/developer')) {
      console.log('🔐 [Session Middleware] Path:', req.path, 'SessionID:', req.sessionID, 'Session:', req.session);
    }
    next();
  });
}

configurePassport(passport);
app.use(passport.initialize());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, "public")));

// Servir iconos (favicon y otros) desde la carpeta /icon
app.use("/icon", express.static(path.join(__dirname, "icon")));

// Middleware de logging simple
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

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

// Rutas de Developer (sin tenantGuard)
app.use("/developer", developerRoutes);
app.use("/api/developer", developerRoutes);

// Ruta de servicio suspendido (sin tenantGuard - CRÍTICO para evitar bucle infinito)
app.get("/suspended", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "suspended.html"));
});

// Aplicar tenantGuard a todas las rutas públicas
app.use(tenantGuard);

// Rutas de la API
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

// Manejo de rutas no encontradas solo para API
app.use("/api/*", (req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada",
    path: req.path,
  });
});

// Redirigir rutas no encontradas a index
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(500).json({
    error: "Error interno del servidor",
    message: err.message,
  });
});

// Iniciar el servidor
app.listen(PORT, async () => {
  console.log(`Servidor RazoConnect corriendo en puerto ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Endpoint de prueba: http://localhost:${PORT}/api`);

  // Probar conexión a la base de datos
  await db.testConnection();

  scheduleDailyMaintenance();
  console.log("[CRON] Sistema de mantenimiento diario activado.");
});

module.exports = app;
