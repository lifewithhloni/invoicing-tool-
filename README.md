# Coal Delivery, Reconciliation & Invoicing System

Web system for a coal haulage business (Arete Conglomerate) that is paid per ton delivered. Office staff upload the collection and destination weighbridge slips for each trip; the system pairs them, records the weights, applies the customer's rate and issues the monthly invoice.

**Status:** Phase 2 (core infrastructure) built — see [Progress](#progress). Design and decisions: [docs/PHASE-1-ARCHITECTURE.md](docs/PHASE-1-ARCHITECTURE.md) (start with §0).

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Anthropic API for slip extraction (Phase 4).

## Set it up

1. **Install:** `npm install` (Node 20.11 or later).
2. **Database:** create a Supabase project (or run one locally), then apply every file in `supabase/migrations` in order — with the Supabase CLI that's `supabase db push` (hosted) or `supabase db reset` (local).
3. **Environment:** copy `.env.example` to `.env.local` and fill in the project URL, publishable key and secret key.
4. **First admin:** public sign-up is disabled, so create the first administrator once:

   ```bash
   node --env-file=.env.local scripts/create-first-admin.mjs "Full Name" you@example.com
   ```

   After that, admins add other users from **Users** in the app.
5. **Run:** `npm run dev`, open http://localhost:3000 and sign in.

Without step 3 the app shows a "not connected" page instead of failing.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests and database tests |

The database tests (`tests/db`) apply the real migrations to an in-memory Postgres (PGlite) with a small stand-in for Supabase's `auth` schema and roles, then check access rules, constraints and functions. They need no Docker and no Supabase project.

## Rules for this codebase

- All schema changes are migrations in `supabase/migrations`. Never edit the database by hand. Update `src/lib/database.types.ts` with each migration.
- Every table has Row Level Security. Admins write; Finance reads; anyone without an active profile sees nothing.
- Money and weights use Postgres `numeric`; the app passes amounts as decimal strings, never floats.
- Rates and deductions are never edited: a change is a new row from a new date. Issued invoices will be immutable; corrections are credit notes.
- Public sign-up is disabled; administrators create users. A user's role lives in Supabase `app_metadata`, which only the secret key can write.
- The secret key is used only on the server, only for creating users, and only after checking the caller is an admin.
- Next.js Cache Components is off: every page is private, per-user data read fresh on each request.

## Progress

| Phase | Status |
| --- | --- |
| 1. Audit & architecture | Approved 2 Nov 2026 |
| 2. Core infrastructure | Built: schema + RLS + audit log, login, Admin/Finance roles, users, company settings, invoice numbering, customers with versioned rates and monthly deductions, sites, coal products with weighbridge names, drivers, trucks. Database-tested in-process; **not yet run against a real Supabase project.** |
| 3. Delivery management | Not started |
| 4. AI extraction | Not started |
| 5. Reconciliation & calculations | Not started |
| 6. Invoicing | Not started |
| 7. Dashboard & reports | Not started |
| 8. Testing & production | Not started |
