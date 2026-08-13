# TVSE Super Travel Agency

TVSE is a concierge travel platform running on vinext and Cloudflare Workers. The Sites application serves the public experience and compatibility APIs. A standalone Operations Worker provides the sharded v2 data plane for transactional traffic, jobs, uploads, rate limits, retention, and zero-downtime migration.

## Platform capabilities

- Request → approval → versioned quote → booking → itinerary → invoice → payment workflow
- Four permanent operational D1 shards with tenant and anonymous-email routing
- Five-minute bearer tokens issued from the existing HTTP-only Sites session
- Atomic mutations with idempotency, audit records, and recoverable outbox jobs
- Queue-backed email, PDF, receipt, itinerary, webhook, archive, and cleanup work
- Streaming R2 uploads, private signed downloads, and file-signature validation
- Server-side indexed search, signed keyset pagination, SQL finance aggregates, and D1 consistency bookmarks
- Durable Object token buckets and document-number allocation
- Shadow reads, reverse mirroring, canary routes, and an emergency core-read rollback flag

## Local development

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm run operations:dev
npm test
```

Copy `.env.example` and `workers/operations/.dev.vars.example` to ignored local environment files. Without a Resend key, messages remain visible in the staff notification outbox.

Useful verification commands:

```bash
npm run typecheck
npm run lint
npm run operations:check
npm run test:migrations
npm run fixtures:scale
```

The load harness is `tests/load/tvse-1500.k6.js`. Run it against a provisioned environment with `OPERATIONS_API_URL`, `SITES_ORIGIN`, and either `TVSE_SESSION_FILE` (recommended) or `TVSE_SESSION_COOKIES`. The generated `.scale-fixtures/load-session-cookies.json` contains 1,500 local test sessions; import its accompanying databases only into an isolated load-test environment. `TVSE_ACCESS_TOKEN` is supported only for short smoke tests because production tokens expire after five minutes. The harness executes the agreed 100 RPS steady, 250 RPS burst, and 50 RPS soak profile with up to 1,500 VUs.

## Data and hosting

`.openai/hosting.json` retains the Sites `DB` and `UPLOADS` bindings. `workers/operations/wrangler.jsonc` declares `CORE_DB`, four shard databases, R2, KV, Queue/DLQ, Durable Objects, and Cron triggers. Core and shard migrations are additive; no legacy tables are removed by this release.

Apply `drizzle/` to core and `workers/operations/migrations/shards/` to every shard. Before a production migration, record a D1 Time Travel restore point, provision the named resources, enable D1 read replication, store secrets with Wrangler, and follow the staged rollout in `workers/operations/README.md`.

Required Sites settings include:

- `APP_BASE_URL`, `TVSE_ADMIN_EMAILS`
- `OPERATIONS_API_URL`, `OPERATIONS_ALLOWED_ORIGINS`
- `OPERATIONS_TOKEN_KID`, `OPERATIONS_TOKEN_SECRET`
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`
- `TAWK_PROPERTY_ID`, `TAWK_WIDGET_ID` for the public live-chat widget
- Resend settings when email delivery is enabled

The Operations Worker additionally requires cursor, upload, migration, and current/previous token secrets. Never store production secrets in `wrangler.jsonc`.

## Release gates

The repository verifies type safety, lint, production build, Worker bindings, API contracts, migrations, query plans, authentication, tenant isolation, idempotency primitives, and fixture generation in CI. Infrastructure-level latency, queue-lag, memory, DLQ, D1 overload, and Web Vitals thresholds must be validated against the provisioned Cloudflare environment before advancing canaries.

Keep v1 operational endpoints available for at least 30 stable days. Stop reverse mirroring only after 14 stable days at 100% v2. Removing legacy tables requires a separate, explicitly approved migration.
