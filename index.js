const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();
const db = require("./db");
const passport = require("passport");
const configurePassport = require("./config/passport");

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

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors()); // Habilitar CORS
app.use(express.json()); // Parsear JSON en el body de las peticiones
app.use(express.urlencoded({ extended: true })); // Parsear datos de formularios
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
