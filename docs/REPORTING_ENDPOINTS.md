# Reporting Endpoints

## Purpose

This document defines analytics and reporting endpoints exposed for admin and finance operations.

## Main Endpoints

- GET /api/admin/reportes/rentabilidad
- GET /api/admin/reportes/valuacion-inventario
- GET /api/admin/reportes/aging-backorders

## Access and Controls

- All endpoints require authentication.
- Access is role-restricted through role middleware.
- Heavy operations are protected by heavy-operation rate limiting.

## Operational Rules

- Treat reporting endpoints as resource-intensive.
- Keep role scopes aligned with financial and operational responsibilities.
- Monitor latency and query load on report generation.

## Related Files

- routes/reportes.js
- controllers/reportesController.js
- middlewares/roleMiddleware.js
- middlewares/rateLimiter.js
