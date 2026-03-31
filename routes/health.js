/**
 * HEALTH CHECK ENDPOINT
 * Para monitoreo básico del sistema
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

// Health check básico
router.get('/', async (req, res) => {
    const healthCheck = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        version: '1.0.0',
        checks: {
            database: 'unknown',
            memory: 'unknown',
            disk: 'unknown'
        }
    };

    try {
        // Verificar conexión a base de datos
        const client = await db.pool.connect();
        await client.query('SELECT 1');
        client.release();
        healthCheck.checks.database = 'OK';
        healthCheck.status = 'OK';
    } catch (error) {
        healthCheck.checks.database = 'ERROR';
        healthCheck.status = 'ERROR';
        healthCheck.error = 'Database connection failed';
    }

    // Verificar uso de memoria
    const memUsage = process.memoryUsage();
    const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    healthCheck.checks.memory = memUsageMB < 500 ? 'OK' : 'WARNING';
    healthCheck.memory = {
        used: `${memUsageMB}MB`,
        total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
    };

    // Determinar código de estado
    const statusCode = healthCheck.status === 'OK' ? 200 : 503;
    
    res.status(statusCode).json(healthCheck);
});

// Health check simple (sin DB)
router.get('/simple', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Ready check (para Kubernetes/Docker)
router.get('/ready', async (req, res) => {
    try {
        // Verificar que la base de datos esté lista
        const client = await db.pool.connect();
        await client.query('SELECT 1');
        client.release();
        
        res.json({
            status: 'READY',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'NOT_READY',
            timestamp: new Date().toISOString(),
            error: 'Database not ready'
        });
    }
});

// Live check (para Kubernetes/Docker)
router.get('/live', (req, res) => {
    res.json({
        status: 'ALIVE',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

module.exports = router;
