# Operations Runbook

## Purpose

This runbook defines minimum operational actions for on-call, deployments, and incident response.

## Health Checks

Primary endpoints:
- /health
- /api/health

Check signals:
- database status
- redis status
- process memory and uptime

## Deploy Verification Checklist

1. Confirm app boots without startup security errors.
2. Confirm /health returns status ok.
3. Confirm /api/health shows database ok.
4. Confirm tenant landing pages resolve by domain.
5. Confirm login and one protected endpoint per role.

## Incident Triage

1. Identify scope: single tenant vs global platform.
2. Check database connectivity.
3. Check Redis connectivity/fallback mode.
4. Check recent deploys and config changes.
5. Check logs for request IDs and failing routes.

## High-Risk Failure Modes

- Tenant resolution or domain mapping failures
- Stock inconsistencies after order transitions
- Redis/session instability affecting auth/rate limits
- Long-running endpoints causing memory pressure

## Recovery Actions

- Roll back to last known good deployment
- Disable non-critical jobs temporarily
- Re-run integrity scripts if inventory mismatch confirmed
- Communicate incident state and ETA to stakeholders

## Post-Incident Review

1. Capture root cause and timeline.
2. Define preventive action and owner.
3. Update docs and runbook entries.
4. Add regression test if code defect was involved.

## Related Files

- docs/DEPLOYMENT_AND_TROUBLESHOOTING.md
- docs/MAINTENANCE_CHECKLIST.md
- index.js
- cron/
