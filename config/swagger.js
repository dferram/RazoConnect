const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'RazoConnect API',
      version: '1.0.0',
      description: 'API multi-tenant para gestión de distribución B2B. Desarrollada por xCore.',
      contact: {
        name: 'xCore',
      },
    },
    servers: [
      {
        url: process.env.FRONTEND_BASE_URL || 'http://localhost:3000',
        description: 'Servidor actual',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token JWT obtenido en /api/auth/login o /api/admin/login',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error interno del servidor' },
          },
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            currentPage: { type: 'integer', example: 1 },
            totalPages: { type: 'integer', example: 10 },
            totalRecords: { type: 'integer', example: 100 },
            limit: { type: 'integer', example: 20 },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  // Escanear todos los archivos de rutas para encontrar anotaciones @swagger
  apis: [
    './routes/*.js',
    './routes/**/*.js',
    './controllers/*.js',
    './controllers/**/*.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
