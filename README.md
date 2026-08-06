# TVSE Super Travel Agency

TVSE is a concierge travel platform running on vinext and Cloudflare Workers. It combines the public TVSE marketing experience with destination and package discovery, multi-step travel requests, protected traveler/company/partner workspaces, and a complete staff operations console.

## Platform capabilities

- 12 seeded destinations and eight editable travel packages
- Request → approval → versioned quote → booking → itinerary → invoice → payment record workflow
- Email magic-link sessions for travelers, corporate users and partners
- Sign in with ChatGPT for TVSE staff, with owner, administrator, agent, finance and content permissions
- Private PDF documents and uploads in R2, with ownership checks and a 10 MB allowlist
- D1-backed CRM, content, finance, support, notifications and audit history
- Resend-compatible transactional email outbox and idempotent webhooks
- KES and USD minor-unit accounting with immutable exchange-rate snapshots

## Local development

Use Node.js 22.13 or newer.

```bash
npm install
npm run dev
npm test
```

Copy `.env.example` to an ignored local environment file when configuring email. Without a Resend key, messages remain safely visible in the staff notification outbox.

## Data and hosting

`.openai/hosting.json` declares the logical `DB` D1 binding and `UPLOADS` R2 binding. The generated migration in `drizzle/` creates the complete operational schema and seeds public catalog content only.

Required production settings:

- `APP_BASE_URL`
- `TVSE_ADMIN_EMAILS`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `RESEND_WEBHOOK_SECRET`

Generate a new migration after schema changes with `npm run db:generate`. Money is always stored as integer minor units; historical quote and invoice exchange rates must never be recalculated.

## Authentication model

External users receive single-use 15-minute email links and 30-day opaque sessions. TVSE staff use the platform sign-in flow. Every operational handler repeats role and ownership checks on the server; hiding a button is never treated as authorization.
