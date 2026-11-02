import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createTestDb, createUser } from "./harness";

let db: PGlite;
let adminId: string;
let financeId: string;
let customerId: string;

type RateRow = { rate_per_ton: string; effective_from: string; effective_to: string | null };

beforeAll(async () => {
  db = await createTestDb();
  await db.exec("set datestyle = 'ISO'");
  adminId = await createUser(db, "admin");
  financeId = await createUser(db, "finance");
  [{ id: customerId }] = await as<{ id: string }>(db, adminId,
    "insert into public.customers (name) values ('PBSA Logistics') returning id");
});

const rates = () =>
  as<RateRow>(db, adminId,
    `select rate_per_ton::text, effective_from::text, effective_to::text
       from public.customer_rates where customer_id = $1 order by effective_from`,
    [customerId]);

describe("customer rates", () => {
  it("stores the agreed rate exactly", async () => {
    await as(db, adminId, "select public.set_customer_rate($1, 652.25, '2026-10-01', 'October agreement')", [customerId]);
    expect(await rates()).toEqual([{ rate_per_ton: "652.25", effective_from: "2026-10-01", effective_to: null }]);
  });

  it("closes the previous rate the day before a new one starts", async () => {
    await as(db, adminId, "select public.set_customer_rate($1, 680.00, '2027-01-01')", [customerId]);
    expect(await rates()).toEqual([
      { rate_per_ton: "652.25", effective_from: "2026-10-01", effective_to: "2026-12-31" },
      { rate_per_ton: "680.00", effective_from: "2027-01-01", effective_to: null },
    ]);
  });

  it("finds the rate in force on an invoice date", async () => {
    const on = (d: string) =>
      as<{ rate_per_ton: string | null }>(db, financeId,
        "select (public.customer_rate_on($1, $2)).rate_per_ton::text", [customerId, d]);
    expect(await on("2026-10-31")).toEqual([{ rate_per_ton: "652.25" }]);
    expect(await on("2026-12-31")).toEqual([{ rate_per_ton: "652.25" }]);
    expect(await on("2027-01-01")).toEqual([{ rate_per_ton: "680.00" }]);
    expect(await on("2026-09-30")).toEqual([{ rate_per_ton: null }]);
  });

  it("refuses a new rate that starts on or before an existing one", async () => {
    await expect(
      as(db, adminId, "select public.set_customer_rate($1, 700, '2026-11-15')", [customerId]),
    ).rejects.toThrow(/already has a rate starting on or after/);
  });

  it("makes overlapping rates impossible even with direct inserts", async () => {
    await expect(
      as(db, adminId,
        "insert into public.customer_rates (customer_id, rate_per_ton, effective_from) values ($1, 1, '2026-12-01')",
        [customerId]),
    ).rejects.toThrow(/customer_rates_no_overlap/);
  });

  it("never lets a rate amount be edited", async () => {
    await expect(
      as(db, adminId, "update public.customer_rates set rate_per_ton = 1 where customer_id = $1", [customerId]),
    ).rejects.toThrow(/cannot be edited/);
  });

  it("does not delete a rate that has already taken effect", async () => {
    await expect(
      as(db, adminId,
        "delete from public.customer_rates where customer_id = $1 and effective_from = '2026-10-01'",
        [customerId]),
    ).rejects.toThrow(/cannot be deleted/);
  });

  it("rejects zero or negative rates", async () => {
    const [{ id }] = await as<{ id: string }>(db, adminId,
      "insert into public.customers (name) values ('Other') returning id");
    await expect(
      as(db, adminId, "select public.set_customer_rate($1, 0, '2026-10-01')", [id]),
    ).rejects.toThrow(/rate_per_ton_check/);
  });

  it("lets only admins change rates", async () => {
    await expect(
      as(db, financeId, "select public.set_customer_rate($1, 1, '2030-01-01')", [customerId]),
    ).rejects.toThrow(/Only administrators/);
  });

  it("records rate changes in the audit log", async () => {
    const rows = await as<{ n: string }>(db, adminId,
      "select count(*) as n from public.audit_log where table_name = 'customer_rates'");
    // two inserts and one update (closing the October rate)
    expect(Number(rows[0].n)).toBe(3);
  });
});

describe("recurring deductions", () => {
  const deductions = () =>
    as<{ description: string; monthly_amount: string; effective_from: string; effective_to: string | null }>(db, adminId,
      `select description, monthly_amount::text, effective_from::text, effective_to::text
         from public.customer_recurring_deductions where customer_id = $1
        order by description, effective_from`,
      [customerId]);

  it("stores the fixed monthly diesel deduction", async () => {
    await as(db, adminId,
      "select public.set_customer_recurring_deduction($1, 'Monthly diesel deduction', 59000, '2026-10-01')",
      [customerId]);
    expect(await deductions()).toEqual([
      { description: "Monthly diesel deduction", monthly_amount: "59000.00", effective_from: "2026-10-01", effective_to: null },
    ]);
  });

  it("versions a changed amount by date, matching the description case-insensitively", async () => {
    await as(db, adminId,
      "select public.set_customer_recurring_deduction($1, 'monthly  diesel deduction', 61000, '2027-02-01')",
      [customerId]);
    expect(await deductions()).toEqual([
      { description: "Monthly diesel deduction", monthly_amount: "59000.00", effective_from: "2026-10-01", effective_to: "2027-01-31" },
      { description: "monthly  diesel deduction", monthly_amount: "61000.00", effective_from: "2027-02-01", effective_to: null },
    ]);
  });

  it("allows a different deduction to run alongside", async () => {
    await as(db, adminId,
      "select public.set_customer_recurring_deduction($1, 'Tracking fee', 450, '2026-10-01')", [customerId]);
    expect(await deductions()).toHaveLength(3);
  });

  it("ends a deduction on a chosen day", async () => {
    const [{ id }] = await as<{ id: string }>(db, adminId,
      "select id from public.customer_recurring_deductions where description = 'Tracking fee'");
    await as(db, adminId, "select public.end_customer_recurring_deduction($1, '2026-12-31')", [id]);
    const rows = await deductions();
    expect(rows.find((r) => r.description === "Tracking fee")?.effective_to).toBe("2026-12-31");
    await expect(
      as(db, adminId, "select public.end_customer_recurring_deduction($1, '2027-06-30')", [id]),
    ).rejects.toThrow(/already ended earlier/);
  });

  it("lets only admins change deductions", async () => {
    await expect(
      as(db, financeId,
        "select public.set_customer_recurring_deduction($1, 'X', 1, '2030-01-01')", [customerId]),
    ).rejects.toThrow(/Only administrators/);
  });
});
