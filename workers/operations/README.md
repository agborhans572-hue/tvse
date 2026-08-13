# TVSE Operations Worker

This Worker is the operational data plane for the zero-downtime v2 rollout. The Sites application remains the public origin and server-side token issuer; browser access tokens are not exposed. This Worker owns sharded operational reads/writes, idempotency, queues, private file delivery, rate limits, retention, and migration tooling.

## Provisioning order

1. Record a D1 Time Travel restore point with `wrangler d1 time-travel info tvse-core` and retain its bookmark in the deployment ticket.
2. Create `tvse-ops-0` through `tvse-ops-3`, `tvse-jobs`, `tvse-jobs-dlq`, `tvse-routing-cache`, and the shared `tvse-uploads` bucket. Point `CORE_DB` at the existing Sites D1 database rather than creating another core database.
3. Add the resulting resource IDs to `wrangler.jsonc` if the account does not resolve resources by name.
4. Apply `../../drizzle` to `CORE_DB` and `migrations/shards` to each `OPS_*` binding. All migrations are additive.
5. Enable D1 read replication for core and every shard in the Cloudflare dashboard. The Worker already uses Sessions API bookmarks for replica-safe reads and primary sessions for post-write consistency tokens.
6. Copy `.dev.vars.example` to an ignored `.dev.vars` for local work. In production, store every secret with `wrangler secret put`; never put secrets in `vars`. Configure matching current/previous `OPERATIONS_SERVICE_*` keys in Sites and this Worker so every `/v2/public/*` call is signed and supports key rotation.
7. Set `ALLOWED_ORIGINS` to the exact Sites production and preview origins, deploy dark, then call `/health/live` and `/health/ready`.
8. Initialize Durable Object sequences with `POST /internal/migrations/initialize-numbers` and `X-Migration-Token` before accepting v2 writes.

## Migration controls

- `POST /internal/migrations/backfill` accepts `{ "table": "trip_requests", "cursor": "", "limit": 1000 }`. Routes are inserted before rows and shard upserts only replace older row versions.
- Backfill root records first, followed by their children: requests/travelers/approvals, quotes/versions/items, bookings/days/segments/assignments, invoices/items/payments, then support/messages/media/notifications/audit.
- `GET /internal/migrations/shadow?table=trip_requests&tenant=org:...` compares count, monetary total where applicable, and a deterministic row digest without serving shard results.
- `POST /internal/migrations/routes` accepts up to 500 explicit tenant keys plus `readMode` and optional `mirrorWrites`. It updates the core flags and invalidates every affected KV entry, so canaries and rollback take effect immediately.
- Additive core triggers capture v1 changes in `core_change_events`; the one-minute cron replays them idempotently. V2 creates use recoverable reverse-mirror outbox jobs while `tenant_routes.mirror_writes=1`.
- `tenant_routes.read_mode` is the rollback/canary flag: `core`, `shadow`, or `shard`. Assignments never change when more shards are added.
- `V2_FORCE_CORE_READS=true` is the global emergency stop. The Sites compatibility layer recognizes `CORE_FALLBACK` and serves the unchanged v1/core read path.

## Rollout gates

Hold 5%, 25%, 50%, and 100% stages for at least one hour. Advance only with read p95 below 500 ms, mutation acknowledgement p95 below one second, 5xx below 0.5%, queue age below 120 seconds, no D1 overloads/DLQ jobs, and shadow mismatches at or below 0.1%. Roll back by setting affected routes to `core`; do not delete shard data.

After 14 stable days at 100%, set `mirror_writes=0` and make legacy operational tables application-read-only. Keep v1 routes for at least 30 stable days. Removing legacy tables is intentionally not part of these migrations and requires separate approval.

## Operations

- Cron `* * * * *` republishes pending jobs, recovers expired five-minute leases, and replays core change events.
- Daily cron deletes at most 500 eligible records per category, redacts payloads, cleans abandoned uploads, and writes gzip archives with SHA-256 metadata to R2.
- Configure an R2 lifecycle rule for `archives/` at 2,557 days (seven years). Legal review may lengthen but not shorten it.
- Create alerts for any D1 overloaded response, any DLQ message, oldest queue age over 120 seconds, shadow mismatch above 0.1%, 5xx over 1% for five minutes, and read p95 over 500 ms for ten minutes.
- Logs are structured and contain request ID, route, tenant/shard, status, duration, retries, and outcomes. Do not add email addresses, bodies, token values, or document contents to logs.
