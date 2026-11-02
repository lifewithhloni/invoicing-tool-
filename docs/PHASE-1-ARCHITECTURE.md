# Coal Delivery, Reconciliation & Invoicing System — Phase 1: Audit & Architecture

Status: **Proposal — awaiting approval.**
Date: 2 November 2026

---

## 1. Repository audit

| Item | Finding |
| --- | --- |
| Project | SeaFresh Travel Agency marketing website (1 commit, 53 files) |
| Stack | Next.js 16 (App Router, static), React 19, TypeScript 6, Tailwind CSS 4, ESLint |
| Database | None |
| Authentication | None |
| File storage | None (static `public/` images only) |
| Backend / API | None — enquiry forms build a WhatsApp / `mailto:` message client-side |
| Reusable code | Nothing domain-relevant. The toolchain choices (Next.js + TS + Tailwind) match the recommended stack. |

**Conclusion:** there is no existing infrastructure to extend or migrate. The coal system shares nothing with the travel site, and putting a financial system with authentication, a database and private documents inside a public marketing site would mix two unrelated products, two clients' deployments and two security profiles.

**Recommendation:** build the coal system as its **own repository and deployment**. **Decided:** this repository (`invoicing-tool-`).

---

## 2. Proposed architecture

```
 Driver phone (mobile web / PWA)        Admin & Finance (desktop / mobile web)
              │                                      │
              └──────────────┬───────────────────────┘
                             ▼
                Next.js 16 app (Vercel or similar)
   ┌───────────────────────────────────────────────────────────┐
   │ /driver/*  mobile-first portal      /app/*  admin/finance  │
   │ Server Actions + Route Handlers (all writes server-side)   │
   │ PDF rendering (@react-pdf/renderer) · Excel export (exceljs)│
   │ Extraction worker → Anthropic API (vision, JSON schema)     │
   └───────────────┬───────────────────────────────┬───────────┘
                   ▼                               ▼
        Supabase Postgres                 Supabase Storage (private buckets)
   - RLS on every table                 - slips/{delivery_id}/{slip_id}.{ext}
   - Financial logic in SQL functions   - documents/invoices/{invoice_no}.pdf
     (approve_delivery, issue_invoice…) - Short-lived signed URLs only
   - Audit triggers, immutability guards
   - Supabase Auth (email for staff; drivers: see Q12)
```

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js 16 + TypeScript + Tailwind 4 | Matches your existing toolchain and the brief |
| Database | Supabase Postgres | Relational, FKs, RLS, `numeric` decimals, SQL functions, migrations via Supabase CLI |
| Auth | Supabase Auth + `profiles.role` | Roles enforced in RLS, not just in the UI |
| Storage | Supabase Storage, private buckets | Originals never public; access via signed URLs checked against RLS |
| Money & weight maths | Postgres `numeric` + SQL functions | One authoritative calculation, transactional, reproducible; JS never does financial arithmetic with floats (`decimal.js` only for display previews) |
| AI extraction | Anthropic API (Claude vision model) with a strict JSON schema, server-side only | Reads photos and PDFs; output is a *suggestion* stored separately from verified data |
| PDF | `@react-pdf/renderer` on the server | Deterministic layout, no headless browser to run in production |
| Excel | `exceljs` | Real `.xlsx` with numeric cells, not CSV-as-text |
| Secrets | Service-role key and AI key only in server env vars | Never imported into client components |

---

## 3. Core design principles

1. **Facts, decisions and money are separate records.** Uploaded files → AI suggestions → human-verified slip data → reconciliation → approved financial snapshot → invoice. Each layer is its own table; later layers reference earlier ones and never overwrite them.
2. **The `deliveries` table contains no money.** All prices and amounts live in tables drivers have no RLS access to, so driver isolation from financials is structural, not cosmetic.
3. **Approval freezes the numbers.** When a delivery is approved, the rate, price-record ID, billing weight and amounts are copied into an immutable *valuation* row. Later price changes cannot affect it.
4. **Nothing is guessed.** No price found → approval is blocked with a clear message. No net weight and no gross/tare pair → slip can't be verified. Unconfirmed business rules are configuration with no default (see §10).
5. **Corrections are new records, never edits.** A wrong approved delivery gets a new valuation version with a reason; a wrong issued invoice gets a credit note. Database triggers reject `UPDATE`/`DELETE` on locked rows.

---

## 4. Database schema

Conventions: `uuid` primary keys; `created_at`, `created_by` on every table; weights stored in **kilograms** as `numeric(12,1)`; tons derived as `kg / 1000` with `numeric(12,3)`; rates `numeric(12,2)` per ton; money `numeric(14,2)`; currency ZAR.

### 4.1 Identity & configuration

| Table | Key columns |
| --- | --- |
| `profiles` | `id` → `auth.users`, `full_name`, `phone`, `role` (`admin` \| `finance` \| `driver`), `is_active` |
| `company_settings` (single row) | Legal name, reg no, VAT no, addresses, bank details, logo path, `vat_registered`, `default_vat_rate`, `default_payment_terms_days`, `default_discrepancy_tolerance_pct` (nullable until confirmed) |
| `document_sequences` | `name` (`delivery`, `invoice`, `credit_note`, `supplier_statement`), `prefix`, `next_value` — row-locked in a transaction, so numbers are gap-free and unique |

### 4.2 Master data

| Table | Key columns |
| --- | --- |
| `customers` | name, reg no, VAT no, billing address, contacts, `payment_terms_days`, `discrepancy_tolerance_pct` (override), `is_active` |
| `customer_sites` | `customer_id`, name, address — the actual destinations/plants |
| `suppliers` | name, reg no, VAT no, contacts, `discrepancy_tolerance_pct`, `settlement_document_type` (`supplier_invoice_captured` \| `statement_only` \| `recipient_created_invoice`) |
| `supplier_sites` | `supplier_id`, name — mines / collection points / weighbridges |
| `coal_products` | code, name, grade/size (e.g. "RB1", "Duff", "Peas"), `is_active` |
| `drivers` | `profile_id` (nullable until login created), full name, phone, ID/licence no, `is_active` |
| `trucks` | `registration` (unique, normalised upper-case without spaces), make/model, `default_driver_id`, `is_active` |

### 4.3 Pricing (versioned)

| Table | Key columns |
| --- | --- |
| `customer_prices` | `customer_id`, `coal_product_id`, `customer_site_id` (nullable = all sites), `rate_per_ton`, `billing_weight_basis`, `effective_from`, `effective_to` (nullable = open), `notes`, `approved_by` |
| `supplier_prices` | `supplier_id`, `coal_product_id`, `supplier_site_id` (nullable), `rate_per_ton`, `billing_weight_basis`, `effective_from`, `effective_to`, `approved_by` |

- `billing_weight_basis` enum: `delivered_net`, `collected_net`, `lower_of_two`. It lives on the price row, so the weight rule is versioned with the price.
- A Postgres **exclusion constraint** (`btree_gist` on the date range) makes overlapping prices for the same customer/product/site impossible.
- Price rows are never edited once used by an approved valuation; changing a price means closing the old row (`effective_to`) and adding a new one.

### 4.4 Deliveries and slips

| Table | Key columns |
| --- | --- |
| `deliveries` | `delivery_number` (e.g. `DL-2026-000123`, unique), `driver_id`, `truck_id`, `supplier_id`, `supplier_site_id`, `customer_id`, `customer_site_id`, `coal_product_id`, `planned_date`, `status`, `cancelled_reason` — **no financial columns** |
| `slip_files` | `delivery_id` (nullable while unmatched), `slip_type` (`collection` \| `delivery`), `storage_path`, `mime_type`, `size_bytes`, `sha256`, `uploaded_by`, `status` (`uploaded` → `extracting` → `extracted` \| `needs_review` → `verified` \| `rejected`), `rejection_reason`, `replaced_by_id` |
| `slip_extractions` | `slip_file_id`, provider, model, prompt version, raw response (`jsonb`), extracted fields (`jsonb`), per-field confidence, quality flags (blurry, cropped, unreadable), `created_at` — **append-only** |
| `slip_verifications` | `slip_file_id`, `extraction_id` used, `ticket_number`, `weighbridge_site`, `ticket_datetime`, `truck_registration`, `gross_kg`, `tare_kg`, `net_kg`, `coal_product_id`, `location_text`, list of fields changed from AI value, `verified_by`, `verified_at`, `is_current` |

Integrity rules:
- `CHECK (net_kg > 0)`; if gross and tare both present, `CHECK (net_kg = gross_kg - tare_kg)`.
- Only one *current, non-rejected* slip per (`delivery_id`, `slip_type`) — partial unique index.
- **Duplicate ticket detection:** partial unique index on (`weighbridge_site`, `ticket_number`) over current verifications of non-rejected slips. Ticket numbers are only unique per weighbridge, not globally.
- **Duplicate file detection:** `sha256` lookup warns when the same image/PDF is uploaded twice.

### 4.5 Reconciliation

| Table | Key columns |
| --- | --- |
| `weight_reconciliations` | `delivery_id`, collected `net_kg`, delivered `net_kg`, `difference_kg` (collected − delivered), `difference_pct`, `tolerance_pct_applied`, `result` (`within_tolerance` \| `discrepancy`), `status` (`open` \| `investigating` \| `resolved`), `resolution` (`accepted_as_weighed` \| `adjusted` \| `reweighed`), notes, `resolved_by` |
| `weight_adjustments` | `delivery_id`, `applies_to` (`customer` \| `supplier`), `original_kg`, `adjusted_kg`, `reason`, evidence file, `requested_by`, `approved_by`, `approved_at` |

### 4.6 Financial snapshot

| Table | Key columns |
| --- | --- |
| `delivery_valuations` | `delivery_id`, `version`, `is_current`; customer: `customer_price_id`, `customer_rate`, `customer_weight_basis`, `customer_billing_kg`, `customer_amount`; supplier: same four fields; `gross_margin`; `rate_override` flag + `override_reason`; `approved_by`, `approved_at`; `supersedes_id`, `correction_reason` |

Immutable after insert (trigger). A correction inserts version *n+1* and marks the previous one not current — only allowed while not yet invoiced, otherwise a credit note is required first.

### 4.7 Customer invoicing & payments

| Table | Key columns |
| --- | --- |
| `invoices` | `invoice_number` (allocated at **issue**, not at draft), `customer_id`, customer details snapshot (`jsonb`: name, address, VAT no), `period_start`, `period_end`, `issue_date`, `due_date`, `subtotal`, `vat_rate`, `vat_amount`, `total`, `status` (`draft` \| `issued` \| `partially_paid` \| `paid` \| `credited`), `pdf_path`, `issued_by` |
| `invoice_lines` | `invoice_id`, `delivery_valuation_id`, delivery number, coal product, `quantity_tons`, `rate_per_ton`, `line_amount` |
| `credit_notes` / `credit_note_lines` | Reference the original invoice and lines; own number sequence; reason; approval |
| `customer_payments` / `payment_allocations` | Amount, date, reference, method; allocations to invoices |

- **Double-invoicing prevention:** unique index on `invoice_lines.delivery_valuation_id` for lines on non-credited invoices.
- After `issued`, header and lines are locked by trigger; only status changes from payments/credit notes are allowed. The issued PDF is stored once and never regenerated.

### 4.8 Supplier side

| Table | Key columns |
| --- | --- |
| `supplier_statements` / `supplier_statement_lines` | Period, supplier, lines referencing supplier side of valuations; totals; document type from supplier setting; PDF |
| `supplier_invoices_received` | Optional: the supplier's own invoice number/amount captured and matched against expected cost |
| `supplier_payments` / `supplier_payment_allocations` | Payments out and what they settle |

### 4.9 Cross-cutting

| Table | Purpose |
| --- | --- |
| `audit_log` | Written by triggers on every financial, pricing, slip-verification and status table: table, record ID, action, old/new `jsonb`, actor, timestamp, reason |
| `delivery_events` | Human-readable timeline per delivery (uploaded, verified, discrepancy, approved, invoiced…) |
| `notifications` | `user_id`, `delivery_id`, type (`slip_missing`, `slip_rejected`…), message, `read_at` |

---

## 5. How the two slips connect to one delivery

**Primary flow — delivery is created first (recommended):**

1. Admin creates a delivery: driver, truck, supplier/mine, customer/destination, coal product, planned date. The system assigns `DL-2026-000123`.
2. The driver's portal shows it as a card. They tap **Upload collection slip**, take a photo; the file is stored against that delivery ID immediately. The link is explicit — no guessing.
3. Later they tap **Upload delivery slip** on the same card.

**Secondary flow — unplanned trip:** if the driver has no assigned delivery, they can tap **New trip**, choose the truck and upload the collection slip. This creates a delivery in `assigned` status with supplier/customer left blank for an admin to complete. (Only if you want this — Q13.)

**Cross-checks after extraction (warnings, never automatic changes):**
- Truck registration on the slip ≠ delivery truck.
- Delivery slip date earlier than collection slip date, or gap longer than a configurable number of hours.
- Coal product on the slip ≠ delivery's product.
- Ticket number already used at that weighbridge.
- Same file hash already uploaded.
- Collection slip location doesn't match the supplier site; destination doesn't match the customer site.

**Status machine** (derived from facts by a single SQL function, so it can't drift):

```
assigned ──► awaiting_collection_slip ──► awaiting_delivery_slip ──► awaiting_verification
                                                                         │
                                       ┌──── discrepancy_detected ◄──────┤ (outside tolerance)
                                       ▼                                 ▼
                                   (resolved) ─────────────────────► approved ──► invoiced ──► completed
Any open state ──► cancelled (with reason)
```

- `assigned` before the planned date; `awaiting_collection_slip` from the planned date onward with no collection slip.
- A rejected slip returns the delivery to the matching "awaiting" state and notifies the driver.
- `completed` = customer invoice paid **and** supplier side settled (Q16).

---

## 6. How pricing works

At approval, `approve_delivery(delivery_id)` runs in one transaction:

1. **Find the customer price**: row matching customer + coal product + (site, else all-sites row) whose date range contains the *pricing date* (Q4). Exactly one row must match — the exclusion constraint guarantees no overlaps; none → approval blocked: *"No customer price for ABC Mining / RB1 on 14 Nov 2026."*
2. **Find the supplier price** the same way.
3. **Choose billing weights** from each price row's `billing_weight_basis`, using verified slip weights or an approved `weight_adjustment` if one exists.
4. **Calculate**: `amount = round(billing_kg / 1000 × rate_per_ton, 2)` (half-up).
5. **Insert the valuation snapshot** with the price row IDs, rates, weights, amounts and margin.

Manual override: an admin can enter a different rate with a mandatory reason. The valuation records `rate_override = true`, the reason, and the price row it would otherwise have used. It's audited and visible on reports.

**Worked example (from the brief), assuming customer basis = delivered, supplier basis = collected:**

| | Weight | Rate | Amount |
| --- | --- | --- | --- |
| Customer — ABC Mining | 32,000 kg = 32.000 t | R1,450.00 | **R46,400.00** |
| Supplier — XYZ Coal | 33,000 kg = 33.000 t | R1,100.00 | **R36,300.00** |
| Gross margin | | | **R10,100.00** |

These basis choices are not assumed in the system — they are set per price row once you confirm them (Q3).

**VAT** is calculated at invoice level: `vat = round(subtotal × vat_rate, 2)`, using the rate stored on `company_settings` at issue time and copied onto the invoice. (Q8 confirms VAT status and whether prices are VAT-exclusive.)

---

## 7. How reconciliation works

When both slips for a delivery are verified, a reconciliation row is calculated:

- `difference_kg = collected_net_kg − delivered_net_kg` (positive = less arrived than left; negative = more arrived)
- `difference_pct = difference_kg / collected_net_kg × 100`, stored to 2 decimals → 33 t vs 32 t = **3.03 %**
- Tolerance: customer override → supplier override → company default. If **no tolerance is configured, every non-zero difference is flagged** (nothing is silently accepted).
- Within tolerance → `within_tolerance`, delivery can go to approval.
- Outside tolerance (either direction) → `discrepancy_detected`. Approval is blocked until an admin resolves it as:
  - **Accepted as weighed** — bill per the configured basis, with a note;
  - **Adjusted** — record a `weight_adjustment` (who, why, evidence) for the customer and/or supplier side;
  - **Re-weighed** — replace a slip with a new verified one.

A discrepancy never deducts money by itself. The flag means *look at this*; any change to billed weight is a separate, approved, audited record.

---

## 8. AI slip extraction

1. Driver uploads (camera photo, gallery image or PDF; HEIC converted to JPEG; max ~15 MB). File stored first, then a job row is created.
2. A server-side worker sends the file to the Anthropic API with a fixed JSON schema: ticket no, weighbridge name, date/time, truck reg, gross/tare/net with units, customer/destination, supplier/location, coal product, plus per-field confidence and quality flags.
3. Server-side validation: units normalised to kg (1 t = 1,000 kg); `net = gross − tare` check; plausible net-weight range (configurable, e.g. 1–60 t); date not in the future; registration normalised.
4. Anything low-confidence, inconsistent, or flagged blurry/cropped → `needs_review` with the reasons shown.
5. Admin reviews side-by-side (original document left, editable fields right, AI value and confidence per field), corrects, and clicks **Verify**. Only `slip_verifications` rows feed calculations; the AI output is kept for audit.

The AI never verifies a slip, approves a delivery or produces an invoice amount. If the AI service is down, uploads still work and admins capture fields manually.

---

## 9. Roles and access (enforced by RLS)

| Area | Admin | Finance | Driver |
| --- | --- | --- | --- |
| Master data (customers, suppliers, products, trucks, drivers) | Full | Read | Own driver & truck only |
| Prices | Full | Read | None |
| Deliveries | Full | Read | Own deliveries only, operational columns |
| Slip files / verification | Full | Read | Upload & view own; no edit after upload |
| Reconciliation / adjustments | Full | Read | None |
| Approve deliveries | Yes | Q14 | No |
| Valuations, invoices, credit notes, payments | Full | Full | None |
| Supplier statements & payments | Full | Full | None |
| Reports & dashboard | All | All | Own delivery history only |
| Users | Full | None | None |

---

## 10. Unresolved business questions

These need answers before the related part is built. Nothing below will be assumed.

**Scope & setup**
- **Q1.** ~~Separate repository?~~ **Answered:** yes, this repository.
- **Q2.** Business details for invoices: legal name, registration no, VAT no, address, bank details, logo.

**Weights & pricing**
- **Q3. Billing weight.** Should customers be billed on **delivered** net weight and suppliers paid on **collected** net weight? Can this differ per customer/supplier?
- **Q4. Pricing date.** Which date picks the price: collection date, delivery date, or the date the order was placed? Same for both sides?
- **Q5. Price granularity.** Does a customer's price depend only on coal product, or also on destination site? Does a supplier's price vary by mine/site?
- **Q6. Transport.** Is the customer price an all-in delivered price? Do you pay transporters/subcontracted trucks per ton or per trip, and should that cost be in the margin calculation (now or later)?
- **Q7. Tolerance.** What weight difference % is acceptable before a delivery is flagged? Who bears in-transit loss — you, the transporter, or nobody (billed as weighed)? What happens when more weight arrives than was collected?

**Tax & documents**
- **Q8. VAT.** Is the business VAT-registered? Are agreed prices quoted excluding VAT? Any zero-rated customers (e.g. exports)?
- **Q9. Rounding.** Round each delivery line to the cent and sum (proposed), or calculate the invoice from total tons?
- **Q10. Supplier side.** Do suppliers invoice you (you capture and match their invoices), or do you issue self-billing / recipient-created tax invoices to them (needs a written agreement under SA VAT rules)? Or statements only?
- **Q11. Invoices.** Number format (e.g. `INV-000001`)? Billing period per customer (per delivery, weekly, monthly)? Payment terms per customer?

**Operations**
- **Q12. Driver login.** Do all drivers have a smartphone and email? Options: phone + SMS OTP (costs per SMS), or username + PIN set by admin.
- **Q13. Who creates deliveries?** Admin pre-assigns every trip, or drivers can start unplanned trips themselves?
- **Q14. Approvals.** Can Finance approve deliveries, or only Admin? Do credit notes and rate overrides need a second person to approve?
- **Q15. Load shape.** Is a trip always one supplier → one customer → one coal product? Can a load be split between customers or topped up at a second mine?
- **Q16. "Completed".** Does completed mean customer paid **and** supplier paid?
- **Q17. Weighbridge slips.** Do both ends always have a weighbridge? Do slips always show net weight, and in kg or tons? Can you share 5–10 real sample slips (both ends) to design and test extraction against?

**Integration & data**
- **Q18. Accounting software.** Do you use Sage, Xero, QuickBooks, Pastel? Should invoices/payments be exported to it, and in what format?
- **Q19. Historical data.** Import past deliveries/invoices, or start fresh from a go-live date?
- **Q20. Privacy & hosting.** Slips include driver names and vehicle details, so they will be processed by the AI provider (POPIA). OK to proceed, and any preference for hosting region?

---

## 11. Implementation roadmap

Each phase ends with a test gate before the next starts.

| Phase | Deliverables | Test gate |
| --- | --- | --- |
| **1. Audit & architecture** | This document | Your approval + answers to blocking questions (Q1, Q3, Q4, Q7, Q8, Q12, Q13) |
| **2. Core infrastructure** | New repo; Supabase project & CLI migrations; auth & roles; RLS; company settings; customers/sites, suppliers/sites, coal products, drivers, trucks; pricing with effective dates & overlap constraint; audit triggers | RLS tests per role (pgTAP); price-overlap and history tests; CRUD screens checked on mobile |
| **3. Delivery management** | Delivery creation & assignment; numbering; driver portal (mobile-first); slip upload to private storage; status function; notifications | Driver can only see/upload own deliveries; file access only via signed URLs; status transitions unit-tested |
| **4. AI extraction** | Extraction worker; schema & validation; review screen; verification; duplicate ticket/file detection; manual-capture fallback | Run against your real sample slips, measure field accuracy; blurry/missing-net cases go to review |
| **5. Reconciliation & calculations** | Reconciliation; tolerances; investigations & adjustments; `approve_delivery`; valuation snapshots; overrides; corrections | Calculation test suite incl. brief example (R46,400 / R36,300 / R10,100), rounding edge cases, missing price, price change after approval |
| **6. Invoicing** | Grouped customer invoices; gap-free numbering; VAT; PDF; credit notes; payments & allocations; supplier statements, captured supplier invoices, supplier payments | Double-invoicing blocked; issued invoice immutable; credit note flow; PDF totals equal DB totals |
| **7. Dashboard & reports** | Dashboard KPIs with date filter; daily/weekly/monthly delivery, reconciliation, customer/supplier statements, outstanding, supplier payments, gross margin; Excel & PDF export | Report totals cross-checked against underlying records |
| **8. Testing & production** | End-to-end tests (Playwright), security review, backups, monitoring, production Supabase, deployment, user guides for drivers and admins | Pilot with real deliveries alongside the current manual process for 2–4 weeks |

**Next step:** confirm Q1 and answer the blocking questions; Phase 2 can start as soon as Q1, Q3, Q4 and Q12 are settled, since master data and pricing tables don't depend on the rest.
