# Learning Route

## Purpose

This document provides a structured onboarding path for engineers working on RazoConnect.

## Stage 1: Platform Fundamentals

- Request lifecycle in Express
- Middleware order and security gates
- Tenant resolution and isolation

## Stage 2: Data and Transactions

- PostgreSQL access patterns
- Tenant-scoped query discipline
- Transaction boundaries and rollback strategy

## Stage 3: Domain Flows

- Order state lifecycle
- FIFO allocation and backorders
- Finance and warehouse confirmation flow

## Stage 4: Reliability and Security

- Health checks and service diagnostics
- Redis fallback behavior
- JWT/session security model

## Stage 5: Testing and Release Quality

- Unit and integration testing strategy
- Regression testing for inventory flows
- Release verification checklist

## Suggested Reading Order

1. docs/MULTITENANCY.md
2. docs/SYSTEM_ROLES.md
3. docs/ORDER_STATE_LIFECYCLE.md
4. docs/FIFO_USE_CASES.md
5. docs/FINANCE_WAREHOUSE.md
6. docs/SECURITY.md
7. docs/OPERATIONS_RUNBOOK.md

## Completion Criteria

- Can explain tenant isolation without ambiguity.
- Can trace one full order lifecycle with services/controllers.
- Can diagnose a failed health check and propose action.
