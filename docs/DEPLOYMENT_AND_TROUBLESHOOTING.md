# Deployment and Troubleshooting Guide

## Purpose

This document provides the minimum operational guidance required to deploy, validate, and troubleshoot RazoConnect in local, container, and Azure environments.
Detailed environment-specific procedures should live in dedicated runbooks as the platform grows.

## Prerequisites

- Node.js 18+
- PostgreSQL 17+
- Redis or a compatible cache/session backend
- Azure App Service for production hosting
- GitHub Actions for CI/CD

## Environment Setup

### Local Development

1. Install dependencies.
2. Configure .env with local database and authentication values.
3. Set FORCE_TENANT_ID for local tenant resolution when needed.
4. Start the application using the development script.

### Production

1. Provision the Azure App Service and PostgreSQL resources.
2. Configure production secrets and connection strings.
3. Verify TLS, domain routing, and tenant resolution.
4. Deploy through the CI/CD pipeline.

## Configuration Areas

- Database connectivity and SSL
- JWT and session secrets
- Redis connectivity and fallback mode
- Cloudinary credentials
- SMTP and payment provider credentials
- FRONTEND_BASE_URL and tenant domain settings

## Operational Checks

Before releasing to production, confirm:

- The application starts without configuration warnings
- The health endpoints return healthy status
- Authentication works for the configured tenant
- Tenant-specific pages resolve to the correct domain
- Redis-backed features behave as expected in the target environment

## Common Issues

### Application does not start

Typical causes:
- Missing environment variables
- Invalid database credentials
- Incorrect Node.js version

### Tenant is not detected

Typical causes:
- Domain not registered in the tenant table
- Incorrect domain mapping
- FORCE_TENANT_ID misconfiguration in local mode

### Session or login issues

Typical causes:
- SESSION_SECRET or JWT secret misconfiguration
- Cookie/domain mismatch
- Session store connectivity issues

### Redis features fail

Typical causes:
- Redis URL not configured in production
- Network or TLS errors
- Cache service not available

## Rollback Principles

- Prefer deployment rollback over ad hoc hotfixes when a release breaks core flows.
- Preserve logs and diagnostics before making corrective changes.
- Verify the previous stable release on a staging slot when available.

## Monitoring

Recommended checks:

- /health
- /api/health
- Application logs
- Database connectivity
- Redis connectivity
- Error rate by tenant

## References

- Architecture: docs/MULTITENANCY.md
- Security: docs/SECURITY.md
- Redis fallback: docs/REDIS_SMART_FALLBACK.md
- Maintenance: docs/MAINTENANCE_CHECKLIST.md

## Notes

This guide is intentionally compact. It is a first-response operational summary, not the full incident or deployment playbook.
