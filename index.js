const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

// Importar rutas
const authRoutes = require('./routes/auth');

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors()); // Habilitar CORS
app.use(express.json()); // Parsear JSON en el body de las peticiones
app.use(express.urlencoded({ extended: true })); // Parsear datos de formularios

// Middleware de logging simple
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Endpoint de prueba
app.get('/api', (req, res) => {
  res.json({
    message: '¡Bienvenido a RazoConnect API!',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para verificar la conexión a la base de datos
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Rutas de la API
app.use('/api', authRoutes);

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message
  });
});

// Iniciar el servidor
app.listen(PORT, async () => {
  console.log(`🚀 Servidor RazoConnect corriendo en puerto ${PORT}`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔗 Endpoint de prueba: http://localhost:${PORT}/api`);
  
  // Probar conexión a la base de datos
  await db.testConnection();
});

module.exports = app;
