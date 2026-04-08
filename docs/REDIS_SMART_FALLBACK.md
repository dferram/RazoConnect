# Redis Smart Fallback

## Purpose

RazoConnect uses a smart Redis fallback so local development can run without a remote Redis service.

In development, the app uses an in-memory mock. In production, it connects to the real Redis provider.

## Behavior

### Development

- `NODE_ENV=development`
- Redis calls use an in-memory Map-based client
- No remote Upstash traffic is generated
- Rate limiting falls back to local memory storage

### Production

- `NODE_ENV=production`
- The app must connect to real Redis
- Tokens, blacklist entries, and shared counters use remote storage
- Rate limiting becomes distributed across instances

## Why It Exists

- reduce local development friction
- avoid paying for Redis commands during development
- keep application code unaware of whether Redis is real or mocked

## Architecture

The application calls a single Redis client wrapper.
That wrapper decides whether to return:
- a mock in-memory client, or
- a real Redis client

The rest of the system does not need to know the difference.

## Features Supported by the Mock

- `get`
- `set`
- `setEx`
- `del`
- `exists`
- `sendCommand` for rate-limiter compatibility
- TTL expiration
- periodic cleanup

## Testing Coverage

The fallback system is covered by tests for:
- mock client behavior
- fallback selection
- rate limiter behavior
- authentication token flows

## Operational Rules

- Never use the mock in production.
- Production must fail fast if Redis is unavailable.
- Development should remain usable even if Redis is offline.

## Related Files

- Redis client: `config/redisClient.js`
- Rate limiter: `middlewares/rateLimiter.js`
- Auth flows: `middlewares/authMiddleware.js`
- Tests: `tests/redis/README.md`

## Notes

This document is intentionally short. It describes the behavior and rules, not the full implementation details.
