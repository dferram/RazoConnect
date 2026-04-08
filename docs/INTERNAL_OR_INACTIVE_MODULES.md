# Internal or Inactive Modules

## Purpose

This document tracks route modules present in the repository that are not currently mounted in the main application entrypoint.

## Why This Exists

It avoids confusion between available code artifacts and publicly active API surfaces.

## Current Status Snapshot

Based on route inventory and index wiring:

- routes/compras.js: present in repository, not mounted in index.js
- routes/solicitudesCredito.js: present in repository, not mounted in index.js
- routes/remisionSequence.js: present in repository, not mounted in index.js
- routes/remisiones.js: present but main mounting line is currently commented in index.js

## Operational Guidance

- Do not document these modules as active public API until mounting and authorization are validated.
- If a module is activated, update API contracts and audience docs in the same change.
- Keep this file synchronized with index.js route wiring.

## Related Files

- index.js
- routes/compras.js
- routes/solicitudesCredito.js
- routes/remisionSequence.js
- routes/remisiones.js
- docs/API_CONTRACTS.md
