import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, createTestDb, createUser } from "./harness";

let db: PGlite;
let adminId: string;
let financeId: string;
let noRoleId: string;

beforeAll(async () => {
  db = await createTestDb();
  adminId = await createUser(db, "admin");
  financeId = await createUser(db, "finance");
  noRoleId = await createUser(db, null);
});

describe("access", () => {
  it("lets admins create master data and stamps the creator", async () => {
    const rows = await as<{ created_by: string }>(db, adminId,
      "insert into public.customers (name) values ('PBSA Logistics and Consultants (Pty) Ltd') returning created_by");
    expect(rows).toEqual([{ created_by: adminId }]);
  });

  it("lets finance read but not write", async () => {
    expect(await as(db, financeId, "select name from public.customers")).toHaveLength(1);
    await expect(
      as(db, financeId, "insert into public.customers (name) values ('Other')"),
    ).rejects.toThrow(/row-level security/);
    expect(await as(db, financeId, "update public.customers set notes = 'x' returning id")).toHaveLength(0);
    expect(await as(db, financeId, "delete from public.customers returning id")).toHaveLength(0);
  });

  it("hides everything from users without a role and from anonymous visitors", async () => {
    expect(await as(db, noRoleId, "select id from public.customers")).toHaveLength(0);
    expect(await as(db, null, "select id from public.customers")).toHaveLength(0);
  });

  it("audits master-data changes", async () => {
    const rows = await as<{ n: string }>(db, adminId,
      "select count(*) as n from public.audit_log where table_name = 'customers'");
    expect(Number(rows[0].n)).toBe(1);
  });
});

describe("uniqueness and normalisation", () => {
  it("treats customer names case-insensitively", async () => {
    await expect(
      as(db, adminId, "insert into public.customers (name) values ('  pbsa logistics and consultants (pty) ltd ')"),
    ).rejects.toThrow(/customers_name_key/);
  });

  it("allows the same name as a collection and a destination site, but not twice of one kind", async () => {
    await as(db, adminId, `insert into public.sites (kind, name) values
      ('collection', 'Grootegeluk'), ('destination', 'Grootegeluk')`);
    await expect(
      as(db, adminId, "insert into public.sites (kind, name) values ('collection', 'GROOTEGELUK')"),
    ).rejects.toThrow(/sites_kind_name_key/);
  });

  it("matches truck registrations regardless of spaces, dashes and case", async () => {
    const rows = await as<{ registration_key: string }>(db, adminId,
      `insert into public.trucks (registration, trailer_registrations)
       values ('LT48JRGP', array['MJ21SWGP', 'MJ21SXGP']) returning registration_key`);
    expect(rows).toEqual([{ registration_key: "LT48JRGP" }]);
    await expect(
      as(db, adminId, "insert into public.trucks (registration) values ('lt 48-jr gp')"),
    ).rejects.toThrow(/trucks_registration_key_unique/);
  });

  it("keeps coal product aliases unique per weighbridge, including the any-weighbridge alias", async () => {
    const [{ id: productId }] = await as<{ id: string }>(db, adminId,
      "insert into public.coal_products (name) values ('Peas') returning id");
    const [{ id: siteId }] = await as<{ id: string }>(db, adminId,
      "select id from public.sites where kind = 'collection' and name = 'Grootegeluk'");

    await as(db, adminId,
      "insert into public.coal_product_aliases (coal_product_id, site_id, alias) values ($1, $2, 'GG - Peas')",
      [productId, siteId]);
    await expect(
      as(db, adminId,
        "insert into public.coal_product_aliases (coal_product_id, site_id, alias) values ($1, $2, 'gg  -  peas')",
        [productId, siteId]),
    ).rejects.toThrow(/coal_product_aliases_unique/);

    await as(db, adminId,
      "insert into public.coal_product_aliases (coal_product_id, site_id, alias) values ($1, null, 'Peas')",
      [productId]);
    await expect(
      as(db, adminId,
        "insert into public.coal_product_aliases (coal_product_id, site_id, alias) values ($1, null, 'PEAS')",
        [productId]),
    ).rejects.toThrow(/coal_product_aliases_unique/);
  });

  it("links a truck to its usual driver", async () => {
    const [{ id: driverId }] = await as<{ id: string }>(db, adminId,
      "insert into public.drivers (full_name, slip_name) values ('Enos Mokoena', 'ENOS') returning id");
    const rows = await as<{ default_driver_id: string }>(db, adminId,
      "update public.trucks set default_driver_id = $1 where registration_key = 'LT48JRGP' returning default_driver_id",
      [driverId]);
    expect(rows).toEqual([{ default_driver_id: driverId }]);
  });
});
