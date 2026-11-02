# Coal Delivery, Reconciliation & Invoicing System — Phase 1: Audit & Architecture

Status: **Proposal (revision 2) — awaiting approval.**
Date: 2 November 2026

---

## 0. Revision 2 — the business is a coal transporter (read this first)

Answers received on 2 November 2026 change the business model this document was first written for. Where an earlier section disagrees with this one, **this section wins**.

- **What the business does:** it hauls coal and is **paid per ton** by its customer (e.g. Exxaro). It does not buy or sell coal. (Q21)
- **Revenue:** `delivered net tons × agreed haulage rate per ton`, using the rate in force on the invoice date. (Q3, Q4)
- **One rate per customer.** The rate does not vary by route or coal product, only over time (effective dates). Price lookup is customer + invoice date. (Q22)
- **No coal supplier side in the first version.** The mines and weighbridges (Grootegeluk, Exxaro Reductants…) are **collection sites**, not suppliers to be paid. Supplier prices, supplier statements, supplier payments and gross margin against coal cost are removed from scope. If the business pays subcontracted trucks or other per-trip costs, that becomes a later "costs" module (Q6), also on delivered weight (Q3).
- **Drivers do not log in.** Office staff upload both slips. Drivers and trucks are records used to identify trips; the driver portal, driver accounts and driver notifications are removed from scope. (Q12)
- **Roles:** Admin and Finance only.

### 0.1 The current invoice (photo of their spreadsheet template, received 2 Nov 2026)

This settles who is who:

- **The business (issuer):** Arete Conglomerate, "in partnership with MMET Projects", Seleka, Lephalale.
- **The customer:** **PBSA Logistics and Consultants (Pty) Ltd**, the transport company named on every weigh ticket. Arete hauls as a subcontractor to PBSA, which hauls for Exxaro. So the "customer" in this system is PBSA, not Exxaro.

Layout of invoice 5102026 (issued 31/10/2026, due 30/11/2026):

| Description | Rate (R/ton) | Tons | Total (R) |
| --- | --- | --- | --- |
| Grootegeluk Reductant | 652.25 | 34.58 | 22,554.81 |
| Grootegeluk | 652.25 | 34.66 | 22,606.99 |
| Grootegeluk Reductant | 652.25 | 34.92 | 22,776.57 |
| Palabora Mining Company | 652.25 | 34.80 | 22,698.30 |
| Palabora Mining Company | 652.25 | 35.40 | 23,089.65 |
| Grootegeluk | 652.25 | 35.32 | 23,037.47 |
| Grootegeluk Reductant | 652.25 | 35.06 | 22,867.89 |
| **Subtotal** | | | **159,631.67** |
| Monthly diesel deduction | | | −59,000.00 |
| **Total amount payable** | | | **100,631.67** |

Then payment info (bank, account, branch code, reference `INV-05102026`). Bank details belong in company settings in the database, never in this repository.

What it confirms:

- **One rate per customer** (R652.25 on every line) and **delivered weight**: 34.66 t and 34.92 t are exactly the delivered weights on the Rustenburg and Mmamoso sample slips (§8.1).
- **One invoice per month** containing all trips. **Description = collection site** name.
- Tons are shown to **2 decimals** (34,580 kg → 34.58 t). Each line is `tons × rate`, rounded half-up to the cent. All seven lines check out exactly.
- **No VAT** on the invoice, so the "VAT registered" tick box (Q8) starts unticked.
- **No PO number** on the invoice, which answers Q23 (no PO).
- **Deductions exist:** a "monthly diesel deduction" is subtracted after the subtotal. Invoices therefore need **deduction lines** (description + amount) between subtotal and total payable.

**Decided (Q25): the diesel deduction is a fixed monthly amount.** Design:
- `customer_recurring_deductions`: `customer_id`, description ("Monthly diesel deduction"), `amount`, `effective_from`, `effective_to` — versioned like rates, so a changed amount never alters past invoices.
- Each monthly draft invoice is pre-filled with the recurring deductions in force for that month. Finance can remove or change one on a draft only with a reason (audited).
- `invoice_deductions`: `invoice_id`, description, `amount`, `recurring_deduction_id` (nullable for one-off deductions), frozen on issue.
- `total_payable = subtotal + VAT (if registered) − deductions`. A draft whose deductions exceed the subtotal can't be issued.
- Open: whether VAT, if ever registered, applies before or after the deduction. Not relevant while Arete isn't VAT-registered.

**Rounding finding:** the seven rounded lines add up to **R159,631.68**, but the subtotal shows **R159,631.67**. The spreadsheet calculates the subtotal as total tons (244.74) × R652.25 = 159,631.665 → .67, rather than adding the lines. **Decided (Q24):** the subtotal is the **sum of the rounded lines**, so every invoice adds up. On this example the new system would show R159,631.68 (one cent more than the spreadsheet).

What stays the same: two slips per trip, automatic pairing by collection ticket number (§5), AI-assisted reading with human verification (§8), weights in kg with `numeric` maths, versioned prices, immutable issued invoices, credit notes, payments, VAT tick box, audit log.

Simplified flow:

```
Office uploads collection slip ─┐
                                ├─► AI reads both ─► staff verify ─► paired into one trip (delivery)
Office uploads destination slip ┘                                         │
                                                                          ▼
                                    approve (weights locked) ─► invoice to customer at rate on invoice date
```

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
4. **Nothing is guessed.** No price found → approval is blocked with a clear message. No net weight and no gross/tare pair → slip can't be verified. Unconfirmed business rules are configuration with no default (see §11).
5. **Corrections are new records, never edits.** A wrong approved delivery gets a new valuation version with a reason; a wrong issued invoice gets a credit note. Database triggers reject `UPDATE`/`DELETE` on locked rows.

---

## 4. Database schema

Conventions: `uuid` primary keys; `created_at`, `created_by` on every table; weights stored in **kilograms** as `numeric(12,1)`; tons derived as `kg / 1000` with `numeric(12,3)`; rates `numeric(12,2)` per ton; money `numeric(14,2)`; currency ZAR.

### 4.1 Identity & configuration

| Table | Key columns |
| --- | --- |
| `profiles` | `id` → `auth.users`, `full_name`, `phone`, `role` (`admin` \| `finance` \| `driver`), `is_active` |
| `company_settings` (single row) | Legal name, reg no, VAT no, addresses, bank details, logo path, `vat_registered`, `default_vat_rate`, `default_payment_terms_days`, `weight_difference_highlight_pct` (optional, display only) |
| `document_sequences` | `name` (`delivery`, `invoice`, `credit_note`, `supplier_statement`), `prefix`, `next_value` — row-locked in a transaction, so numbers are gap-free and unique |

### 4.2 Master data

| Table | Key columns |
| --- | --- |
| `customers` | name, reg no, VAT no, billing address, contacts, `payment_terms_days`, `is_active` |
| `customer_sites` | `customer_id`, name, address — the actual destinations/plants |
| `suppliers` | name, reg no, VAT no, contacts, `settlement_document_type` (`supplier_invoice_captured` \| `statement_only` \| `recipient_created_invoice`) |
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
| `weight_reconciliations` | `delivery_id`, collected `net_kg`, delivered `net_kg`, `difference_kg` (collected − delivered), `difference_pct`, `highlighted` (display only) — recalculated whenever a slip verification changes |

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
| `delivery_events` | Human-readable timeline per delivery (uploaded, verified, approved, invoiced…) |
| `notifications` | `user_id`, `delivery_id`, type (`slip_missing`, `slip_rejected`…), message, `read_at` |

---

## 5. How the two slips connect to one delivery

**Primary flow — delivery is created first (recommended):**

1. Admin creates a delivery: driver, truck, supplier/mine, customer/destination, coal product, planned date. The system assigns `DL-2026-000123`.
2. The driver's portal shows it as a card. They tap **Upload collection slip**, take a photo; the file is stored against that delivery ID immediately. The link is explicit — no guessing.
3. Later they tap **Upload delivery slip** on the same card.

**Secondary flow — unplanned trip:** if the driver has no assigned delivery, they can tap **New trip**, choose the truck and upload the collection slip. This creates a delivery in `assigned` status with supplier/customer left blank for an admin to complete. (Only if you want this — Q13.)

**Automatic pairing from the slips themselves (found in the sample slips, §8.1):** the destination slip records the collection ticket number — Rustenburg Depot as *External Ref*, Mmamoso as *Order No*. So when slips arrive without a delivery (e.g. office staff upload a batch), the system proposes the pairing: *destination ticket's reference = collection ticket number* **and** same truck registration. An admin confirms the pairing; it's never silently applied.

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
                                                                         ▼
                                                    approved ──► invoiced ──► completed
Any open state ──► cancelled (with reason)
```

- `assigned` before the planned date; `awaiting_collection_slip` from the planned date onward with no collection slip.
- A rejected slip returns the delivery to the matching "awaiting" state and notifies the driver.
- `completed` = customer invoice paid **and** supplier side settled (Q16).

---

## 6. How pricing works

> **Revised after Q3/Q4 answers:** customers are billed on **delivered** net weight, and the price is the one in force on the **invoice date** (defaults to the issue date, editable before issue). So pricing happens at invoicing, not at delivery approval.

**At delivery approval** — `approve_delivery(delivery_id)` locks the *weights only*: it records the verified collected and delivered net weights and the billing weight for each side. No rate is applied yet.

**At invoicing** — when Finance drafts an invoice for a customer and billing period:

1. Pick approved, un-invoiced deliveries; set the **invoice date** (default today, editable while the invoice is a draft — every change is audited).
2. **Find the customer price** for each line: row matching customer + coal product + (site, else all-sites row) whose date range contains the invoice date. Exactly one row must match (the exclusion constraint guarantees no overlaps); none → the draft cannot be issued: *"No customer price for ABC Mining / RB1 on 14 Nov 2026."*
3. **Calculate** each line: `amount = round(delivered_kg / 1000 × rate_per_ton, 2)` (half-up).
4. **On issue**, the invoice number is allocated and the rate, price-row ID, weight and amount are frozen on each line (the valuation snapshot). Later price changes can't affect it.

**Supplier side** works the same way at the supplier statement / settlement date, using the supplier price in force on that date (supplier weight basis to be confirmed — see §11).

Until a delivery is invoiced, the dashboard shows its revenue and margin as an **estimate at today's prices**, clearly labelled.

Manual override: a different rate can be entered on a draft line with a mandatory reason. The line records `rate_override = true`, the reason, and the price row it would otherwise have used. It's audited and visible on reports.

**Worked example (from the brief), customer basis = delivered (confirmed), supplier basis = collected (to be confirmed):**

| | Weight | Rate | Amount |
| --- | --- | --- | --- |
| Customer — ABC Mining | 32,000 kg = 32.000 t | R1,450.00 | **R46,400.00** |
| Supplier — XYZ Coal | 33,000 kg = 33.000 t | R1,100.00 | **R36,300.00** |
| Gross margin | | | **R10,100.00** |

**VAT** is optional: a **"VAT registered"** tick box in company settings. When ticked, invoices add `vat = round(subtotal × vat_rate, 2)` (rate from settings, copied onto the invoice at issue) and show the VAT number; when unticked, no VAT is charged or shown. Agreed prices are treated as VAT-exclusive (to confirm).

---

## 7. How reconciliation works

When both slips for a delivery are verified, a reconciliation row is calculated:

- `difference_kg = collected_net_kg − delivered_net_kg` (positive = less arrived than left; negative = more arrived)
- `difference_pct = difference_kg / collected_net_kg × 100`, stored to 2 decimals → 33 t vs 32 t = **3.03 %**
> **Revised after Q7 answer:** in-transit weight loss is not the business's problem — customers are billed on what was delivered, as weighed.

- The difference and percentage are **shown** on every delivery and in the weight reconciliation report, for information.
- An optional "highlight above X %" setting can mark large differences visually (off by default). It **never blocks approval** and never changes amounts.
- If a slip itself is wrong (misread or wrong ticket), it is corrected by re-verifying or replacing the slip, which is audited.
- The `weight_adjustments` table and the `discrepancy_detected` status are dropped from the first version; they can be added later if the business needs them.

---

## 8. AI slip extraction

1. Driver uploads (camera photo, gallery image or PDF; HEIC converted to JPEG; max ~15 MB). File stored first, then a job row is created.
2. A server-side worker sends the file to the Anthropic API with a fixed JSON schema: ticket no, weighbridge name, date/time, truck reg, gross/tare/net with units, customer/destination, supplier/location, coal product, plus per-field confidence and quality flags.
3. Server-side validation: units normalised to kg (1 t = 1,000 kg); `net = gross − tare` check; plausible net-weight range (configurable, e.g. 1–60 t); date not in the future; registration normalised.
4. Anything low-confidence, inconsistent, or flagged blurry/cropped → `needs_review` with the reasons shown.
5. Admin reviews side-by-side (original document left, editable fields right, AI value and confidence per field), corrects, and clicks **Verify**. Only `slip_verifications` rows feed calculations; the AI output is kept for audit.

The AI never verifies a slip, approves a delivery or produces an invoice amount. If the AI service is down, uploads still work and admins capture fields manually.

### 8.1 What the sample slips show (5 photos received 2 Nov 2026)

| Photo | Weighbridge | Ticket | Date | Truck | Route / product | Tare / Gross / Net (kg) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Exxaro Reductants (collection) | 1156085 | 2026-10-05 | LT48JRGP | Grootegeluk Reductant → Mmamoso Siding, GG-SSCC MET / RB1 | 20,900 / 55,650 / 34,750 |
| 2 left, 3 | Exxaro Reductants (collection) | 1156956 | 2026-10-11 | LT48JRGP | Grootegeluk Reductant → Mmamoso Siding, GG-SSCC MET / RB1 | 20,950 / 56,000 / 35,050 |
| 2 right | Mmamoso Holdings (destination) | T69979.2, Order No **1156956** | 2026-10-11 | LT48JRGP | RB1 | 20,820 / 55,740 / **34,920** |
| 4 | Exxaro Rustenburg Depot (destination) | 21080787, External Ref **32592547** | 2026-10-08 | LT48JRGP | "COAL", Receiving Goods | 20,820 / 55,480 / **34,660** |
| 5 | Grootegeluk Mine (collection) | 32592547 | 2026-10-07 | LT48JRGP | Grootegeluk → Rustenburg Depot, GG-Peas | 21,050 / 55,700 / 34,650 |

Resulting trips:

| Trip | Collected | Delivered | Difference |
| --- | --- | --- | --- |
| 32592547 → 21080787 (Rustenburg) | 34,650 kg | 34,660 kg | −10 kg (−0.03 %, more arrived) |
| 1156956 → T69979.2 (Mmamoso) | 35,050 kg | 34,920 kg | 130 kg (0.37 %) |
| 1156085 → — | 34,750 kg | no destination slip yet | — |

What this changes in the design:

- **Pairing key:** destination slips quote the collection ticket number, so pairing is reliable (§5).
- **Two layouts already:** Exxaro prints *Tare / Gross / Nett* with no unit; Mmamoso prints *First / Second / Total Weight* in kg. Extraction must handle "first/second" (either could be tare) — net is always the positive difference.
- **Duplicates are real:** photos 2 and 3 are the same ticket 1156956, which duplicate-ticket detection must catch.
- **Product names differ per weighbridge** for the same load ("GG - Peas" vs "COAL"; "GG - SSCC MET" + stockpile "RB1" vs "RB1"). Coal products need **aliases** per weighbridge, mapped once by an admin.
- **Extra fields worth capturing:** trailer registrations, transport company, purchase order number (e.g. `G2RPBSA202610`), seal numbers, stockpile ref, date/time in and out.
- **Driver is first name only** ("ENOS"), so the truck registration — not the driver name — is the reliable identifier.
- **Photo quality:** rotated images, low light, a stamp over text, and a partly cut-off ticket are all present. Rotation is fine; a stamp or crop over a weight field must go to manual review.

---

## 9. Roles and access (enforced by RLS)

Revised (§0): drivers have no accounts, so there are two roles.

| Area | Admin | Finance |
| --- | --- | --- |
| Master data (customers, collection/destination sites, products, trucks, drivers) | Full | Read |
| Prices (haulage rates) | Full | Read |
| Deliveries, slip upload & verification | Full | Read |
| Approve deliveries | Yes | Q14 |
| Invoices, credit notes, payments | Full | Full |
| Reports & dashboard | All | All |
| Users | Full | None |

---

## 10. Decisions so far (2 November 2026)

| # | Decision |
| --- | --- |
| Q1 | Separate repository: `lifewithhloni/invoicing-tool-` |
| Q3 | Customers billed on **delivered** net weight |
| Q4 | Price = the one in force on the **invoice date**; invoice date defaults to issue date and is editable on a draft |
| Q7 | Weight loss in transit is not the business's concern: difference is displayed only, never blocks or deducts |
| Q8 | VAT optional: "VAT registered" tick box in company settings drives whether VAT is calculated and shown |
| Q13 | Admin creates deliveries |
| Q3 (other side) | Any payable side also uses **delivered** weight |
| Q12 | Drivers don't log in; office staff upload the slips |
| Q21 | The business is a **transporter paid per ton** to haul coal; no coal purchase side |
| Q22 | **One rate per customer**, versioned by effective date — not per route or product |
| Q25 | Diesel deduction is a **fixed monthly amount** per customer, versioned by effective date and pre-filled on each monthly invoice |
| Q24 | Subtotal = **sum of rounded lines** (each line `round(tons × rate, 2)` half-up) |
| Q23 | No PO on invoices; one invoice per customer per month (from the current template, §0.1) |
| — | Business = Arete Conglomerate; customer = PBSA Logistics; current rate R652.25/t; no VAT (§0.1) |
| — | Single company (one business using the system) for now |

Q17 answered with 5 sample photos (§8.1). Still open: Q26–Q27 (raised by the current invoice), Q6 (other costs to track?).

## 11. Unresolved business questions

These need answers before the related part is built. Nothing below will be assumed.

**Raised by the current invoice (§0.1)**
- **Q24. Rounding.** Lines add up to R159,631.68 but the subtotal shows R159,631.67. Should the subtotal be the **sum of the lines** (recommended: the invoice always adds up), or **total tons × rate** (matches the spreadsheet, but can be a cent off the lines)?
- **Q25. Diesel deduction.** Where does the R59,000 come from: a fixed monthly amount agreed with PBSA, or a statement from PBSA of diesel actually drawn? Are there other deduction types (tolls, fines, advances)?
- **Q26. Invoice numbering.** Is `5102026` = invoice **5**, month **10**, year **2026** (reference `INV-05102026`)? Does the running number continue across months, or restart each month?
- **Q27. Trip details on the invoice.** Lines currently show only the collection site. Keep exactly that, or add **date** and **ticket number** columns so PBSA can match each line to a weigh ticket?

**Raised by the sample slips**
- **Q21. Who is the business?** Every slip names **PBSA Logistics** as the transport company, and the purchase orders contain "PBSA" (`G2RPBSA202610`, `G2MSPBSA202610`). Is the business using this system PBSA Logistics, paid by Exxaro per ton to haul coal? If so, there may be **no coal supplier to pay** — the "supplier side" would instead be things like subcontracted trucks — and the main customer is Exxaro. Or does the business buy coal from Grootegeluk and sell it on?
- **Q22. Price per route?** The samples show two routes (Grootegeluk → Rustenburg Depot, Grootegeluk Reductant → Mmamoso Siding). Is the rate per ton set per **route** (origin → destination), per product, or both?
- **Q23. Purchase orders.** Must each invoice quote the PO number (one PO per route per month, judging by `…202610`)? Should invoices be grouped per PO?

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

## 12. Implementation roadmap

Each phase ends with a test gate before the next starts.

| Phase | Deliverables | Test gate |
| --- | --- | --- |
| **1. Audit & architecture** | This document | Your approval + answers to Q26–Q27 |
| **2. Core infrastructure** | New repo; Supabase project & CLI migrations; auth & roles; RLS; company settings; customers, collection & destination sites, coal products with weighbridge aliases, drivers, trucks; one haulage rate per customer with effective dates & overlap constraint; audit triggers | RLS tests per role (pgTAP); price-overlap and history tests; CRUD screens checked on mobile |
| **3. Delivery management** | Delivery creation; numbering; office slip upload (single and batch) to private storage; pairing by collection ticket number; status function | File access only via signed URLs; pairing and status transitions unit-tested |
| **4. AI extraction** | Extraction worker; schema & validation; review screen; verification; duplicate ticket/file detection; manual-capture fallback | Run against your real sample slips, measure field accuracy; blurry/missing-net cases go to review |
| **5. Reconciliation & calculations** | Weight difference display; `approve_delivery` (weights locked); rate lookup at invoice date; overrides; corrections | Calculation tests using the sample trips (34,660 kg and 34,920 kg delivered), rounding edge cases, missing rate, rate change before/after issue |
| **6. Invoicing** | Grouped customer invoices; gap-free numbering; VAT; PDF; credit notes; payments & allocations | Double-invoicing blocked; issued invoice immutable; credit note flow; PDF totals equal DB totals |
| **7. Dashboard & reports** | Dashboard KPIs with date filter; daily/weekly/monthly delivery, reconciliation, customer statements, outstanding invoices, revenue per route/customer; Excel & PDF export | Report totals cross-checked against underlying records |
| **8. Testing & production** | End-to-end tests (Playwright), security review, backups, monitoring, production Supabase, deployment, user guide for office staff | Pilot with real deliveries alongside the current manual process for 2–4 weeks |

**Next step:** answer Q26–Q27, then Phase 2 starts. (Phase 2 tables don't depend on Q26–Q27, so it can start in parallel if you approve the design.)
