# Maintenance Checklist

## Purpose

This checklist defines recurring operational tasks to keep RazoConnect stable and secure.

## Daily

- Check application health endpoints.
- Review critical errors in logs.
- Confirm database availability.

## Weekly

- Run security audit: npm run security:audit
- Review failed CI workflows.
- Review storage growth and log retention.

## Monthly

- Review dependency updates.
- Validate backup and restore process.
- Review slow queries and high-latency endpoints.
- Update runbook entries if process changed.

## Before Release

1. Run tests.
2. Verify environment variables and secrets.
3. Validate health checks in target environment.
4. Verify one critical flow per role.

## Incident Follow-Up

1. Capture root cause and timeline.
2. Register corrective actions and owners.
3. Add or update regression tests.
4. Update docs affected by the incident.

## Related Files

- docs/OPERATIONS_RUNBOOK.md
- docs/DEPLOYMENT_AND_TROUBLESHOOTING.md
- docs/SECURITY.md
