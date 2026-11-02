import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createTestDb, createUser } from "./harness";

let db: PGlite;
let adminId: string;
let financeId: string;
let noRoleId: string;

beforeAll(async () => {
  db = await createTestDb();
  adminId = await createUser(db, "admin", "Ada Admin");
  financeId = await createUser(db, "finance", "Fin Finance");
  noRoleId = await createUser(db, null);
});

describe("profiles and roles", () => {
  it("creates a profile only for users created with a valid app_metadata role", async () => {
    const { rows } = await db.query<{ id: string; role: string; full_name: string }>(
      "select id, role, full_name from public.profiles order by role",
    );
    expect(rows).toEqual([
      { id: adminId, role: "admin", full_name: "Ada Admin" },
      { id: financeId, role: "finance", full_name: "Fin Finance" },
    ]);
  });

  it("ignores a role supplied in user-editable metadata", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data)
       values ('sneaky@example.test', '{"role":"admin"}') returning id`,
    );
    const profile = await db.query("select 1 from public.profiles where id = $1", [rows[0].id]);
    expect(profile.rows).toHaveLength(0);
  });

  it("reports roles through the helper functions", async () => {
    expect(await as(db, adminId, "select public.is_admin() as a, public.is_staff() as s"))
      .toEqual([{ a: true, s: true }]);
    expect(await as(db, financeId, "select public.is_admin() as a, public.is_staff() as s"))
      .toEqual([{ a: false, s: true }]);
    expect(await as(db, noRoleId, "select public.is_admin() as a, public.is_staff() as s"))
      .toEqual([{ a: false, s: false }]);
  });

  it("lets finance see only their own profile and admins see all", async () => {
    expect(await as(db, financeId, "select id from public.profiles")).toEqual([{ id: financeId }]);
    expect(await as(db, adminId, "select id from public.profiles")).toHaveLength(2);
  });

  it("treats a deactivated user as having no role", async () => {
    const id = await createUser(db, "finance");
    await db.query("update public.profiles set is_active = false where id = $1", [id]);
    expect(await as(db, id, "select public.is_staff() as s")).toEqual([{ s: false }]);
  });

  it("stops an admin from demoting or deactivating themselves", async () => {
    await expect(
      as(db, adminId, "update public.profiles set role = 'finance' where id = $1", [adminId]),
    ).rejects.toThrow(/cannot change your own role/);
    await expect(
      as(db, adminId, "update public.profiles set is_active = false where id = $1", [adminId]),
    ).rejects.toThrow(/cannot change your own role/);
  });

  it("does not let finance change roles", async () => {
    const rows = await as(db, financeId,
      "update public.profiles set role = 'admin' where id = $1 returning id", [financeId]);
    expect(rows).toHaveLength(0);
  });
});

describe("company settings", () => {
  it("has exactly one row, readable by staff and hidden from anonymous visitors", async () => {
    expect(await as(db, financeId, "select id from public.company_settings")).toEqual([{ id: true }]);
    expect(await as(db, null, "select id from public.company_settings").catch(() => [])).toHaveLength(0);
    await expect(db.query("insert into public.company_settings (id) values (false)")).rejects.toThrow();
  });

  it("requires a VAT number and rate when VAT registered is ticked", async () => {
    await expect(
      as(db, adminId, "update public.company_settings set vat_registered = true"),
    ).rejects.toThrow(/vat_details_required/);
    const rows = await as<{ vat_registered: boolean; updated_by: string }>(db, adminId,
      `update public.company_settings
          set vat_registered = true, vat_number = '4000000000', vat_rate = 0.15
        returning vat_registered, updated_by`);
    expect(rows).toEqual([{ vat_registered: true, updated_by: adminId }]);
  });

  it("only lets admins change settings", async () => {
    const rows = await as(db, financeId,
      "update public.company_settings set legal_name = 'X' returning id");
    expect(rows).toHaveLength(0);
  });
});

describe("document numbering", () => {
  it("is not callable directly by signed-in users", async () => {
    await expect(
      as(db, adminId, "select public.allocate_document_number('invoice')"),
    ).rejects.toThrow(/permission denied/);
  });

  it("hands out consecutive numbers starting from the configured value", async () => {
    await db.query("update public.document_sequences set next_value = 6 where name = 'invoice'");
    const a = await db.query<{ n: string }>("select public.allocate_document_number('invoice') as n");
    const b = await db.query<{ n: string }>("select public.allocate_document_number('invoice') as n");
    expect([Number(a.rows[0].n), Number(b.rows[0].n)]).toEqual([6, 7]);
  });

  it("releases the number if the issuing transaction rolls back", async () => {
    await db.exec("begin; select public.allocate_document_number('credit_note'); rollback;");
    const { rows } = await db.query<{ n: string }>("select public.allocate_document_number('credit_note') as n");
    expect(Number(rows[0].n)).toBe(1);
  });
});

describe("audit log", () => {
  it("records who changed what", async () => {
    await as(db, adminId, "update public.company_settings set legal_name = 'Arete Conglomerate'");
    const rows = await as<{ action: string; actor_id: string; legal_name: string }>(db, adminId,
      `select action, actor_id, new_data ->> 'legal_name' as legal_name
         from public.audit_log where table_name = 'company_settings'
        order by id desc limit 1`);
    expect(rows).toEqual([{ action: "UPDATE", actor_id: adminId, legal_name: "Arete Conglomerate" }]);
  });

  it("is readable by admins only", async () => {
    expect(await as(db, financeId, "select id from public.audit_log")).toHaveLength(0);
  });

  it("cannot be altered, even by the database owner", async () => {
    await expect(db.query("update public.audit_log set action = 'DELETE'")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from public.audit_log")).rejects.toThrow(/append-only/);
  });
});
