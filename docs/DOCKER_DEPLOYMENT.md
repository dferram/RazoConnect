# Docker Deployment

## Purpose

This guide defines how to run RazoConnect in containers for local validation and production-style deployment.

## Quick Start

1. Configure environment variables in an .env file.
2. Build and start services.
3. Validate health endpoints.

Example commands:
- docker-compose up -d --build
- docker-compose ps
- curl http://localhost:8080/health
- curl http://localhost:8080/api/health

## Security Baseline

- Run containers as non-root users.
- Keep database service on internal network only.
- Use strong secrets for JWT and session configuration.
- Set resource limits for CPU and memory.

## Health and Monitoring

- /health for container liveness
- /api/health for service-level diagnostics (database, redis, pool)

## Operational Commands

- docker-compose logs -f app
- docker-compose restart app
- docker-compose down
- docker-compose down -v (destructive: removes data volumes)

## Deployment Checklist

1. Confirm secure environment variables are loaded.
2. Confirm health endpoints report ok.
3. Confirm authentication and one protected route.
4. Confirm tenant routing works by expected domain.

## Related Files

- Dockerfile
- docker-compose.yml
- index.js
- docs/DEPLOYMENT_AND_TROUBLESHOOTING.md
