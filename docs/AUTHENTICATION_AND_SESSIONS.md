# Authentication and Sessions

## Purpose

This document defines authentication, token lifecycle, and session behavior across customer, agent, admin, and developer access flows.

## Main Endpoints

- POST /api/login
- POST /api/registro/cliente
- POST /api/registro/agente
- POST /api/auth/registro-admin
- POST /api/auth/refresh
- POST /api/auth/logout
- GET /api/auth/session-status
- GET /api/auth/me
- GET /api/clientes/verify
- POST /api/auth/forgot-password
- POST /api/auth/reset-password
- GET /api/auth/google
- GET /api/auth/google/callback

## Security Controls

- Authentication routes are rate limited.
- Access tokens are validated by auth middleware.
- Refresh token lifecycle supports renewal and logout invalidation.
- Tenant consistency is enforced after identity resolution.

## Session Model

- Dynamic session middleware supports tenant-aware cookie behavior.
- JWT is used for API authorization.
- Refresh token flow supports long-lived sessions with rotating access tokens.

## Operational Rules

- Never bypass middleware stack for protected routes.
- Always validate tenant context after authentication.
- Treat refresh token store as security-critical state.

## Related Files

- routes/auth.js
- middlewares/authMiddleware.js
- middlewares/rateLimiter.js
- middlewares/dynamicSessionConfig.js
- config/passport.js
- docs/MULTITENANCY.md
- docs/SECURITY.md
