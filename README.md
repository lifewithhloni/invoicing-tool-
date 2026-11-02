# Coal Delivery, Reconciliation & Invoicing System

Web system for a coal transport and trading business: drivers upload collection and delivery weighbridge slips, the system reconciles weights, applies customer and supplier pricing, and finance issues invoices and supplier statements.

**Status:** Phase 1 (architecture) proposed — see [docs/PHASE-1-ARCHITECTURE.md](docs/PHASE-1-ARCHITECTURE.md). Repository scaffold only; no business features yet.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Anthropic API for slip extraction.

## Run it locally

Requires Node 20+ and Docker (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local   # then paste the keys printed by `npm run db:start`
npm run db:start             # local Postgres, Auth and Storage in Docker
npm run dev                  # http://localhost:3000
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm run db:start` | Start local Supabase |
| `npm run db:reset` | Recreate the local database from `supabase/migrations` |
| `npm run db:test` | Run database tests (pgTAP) in `supabase/tests` |

## Rules for this codebase

- All schema changes are migrations in `supabase/migrations`. Never edit the database by hand.
- Financial calculations run in Postgres functions using `numeric`, never JavaScript floats.
- Approved valuations and issued invoices are immutable; corrections are new records.
- Public sign-up is disabled; administrators create users.
- Secret keys stay server-side.

## Progress

| Phase | Status |
| --- | --- |
| 1. Audit & architecture | Proposed, awaiting approval and answers to business questions |
| 2. Core infrastructure | Not started |
| 3. Delivery management | Not started |
| 4. AI extraction | Not started |
| 5. Reconciliation & calculations | Not started |
| 6. Invoicing | Not started |
| 7. Dashboard & reports | Not started |
| 8. Testing & production | Not started |
