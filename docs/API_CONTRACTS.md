# API Contracts

## Purpose

This document defines how to discover and consume RazoConnect API contracts.

## Contract Sources

- Swagger UI (non-production): /api/docs
- OpenAPI JSON spec: /api/docs.json
- Route-level annotations in routes and controllers

## Authentication

Most protected endpoints use Bearer JWT.

Security scheme:
- bearerAuth (HTTP bearer token)

## Environments

- Development/Staging: Swagger UI enabled
- Production: Swagger UI disabled by default for security hardening
- Production tooling can still consume /api/docs.json when exposed by policy

## Domain Route Groups

- /api/auth and /api/admin/login
- /api/admin/*
- /api/agente/*
- /api/cliente/*
- /api/inventario/*
- /api/public/*
- /api/pagos/*

## Versioning and Change Policy

- Backward-compatible additions: new optional fields and endpoints
- Breaking changes: require release notes and coordinated rollout
- Deprecated endpoints should include migration notes in docs

## Validation and Error Shape

Common response envelopes:
- success + data for positive responses
- success=false + message/error for failures

## Related Files

- config/swagger.js
- index.js
- routes/
- controllers/
