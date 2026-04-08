# Agent Inventory Sessions

## Purpose

This module allows inventory sessions to be assigned and executed by specific agents under admin supervision.

## Main Capabilities

- Create inventory sessions
- Assign one or more agents
- Restrict visibility to assigned sessions
- Track execution and completion status

## Access Model

- Admin and super admin can create and assign sessions.
- Agents can only view and execute sessions assigned to them.
- Tenant scope is mandatory for all operations.

## Core Workflow

1. Admin creates session.
2. Admin assigns responsible agents.
3. Agent performs counting tasks.
4. Admin reviews and closes session.

## Operational Rules

- Session ownership and assignment must be explicit.
- Unassigned agents must not see session details.
- Every count action must remain attributable.

## Related Files

- controllers/auditController.js
- routes/admin.js
- docs/MONTHLY_INVENTORY_AUDIT.md
