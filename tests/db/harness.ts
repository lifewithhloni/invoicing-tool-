import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

const root = join(import.meta.dirname, "..", "..");
const migrationsDir = join(root, "supabase", "migrations");

/** A fresh in-memory Postgres with the Supabase stand-in and every migration applied. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readFileSync(join(import.meta.dirname, "supabase-stub.sql"), "utf8"));
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }
  return db;
}

export type Role = "admin" | "finance" | null;

/** Create an auth user the way an administrator would (role in app_metadata). */
export async function createUser(db: PGlite, role: Role, fullName = "Test User"): Promise<string> {
  const appMeta = role ? { role } : {};
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_app_meta_data, raw_user_meta_data)
     values ($1, $2, $3) returning id`,
    [`${crypto.randomUUID()}@example.test`, appMeta, { full_name: fullName }],
  );
  return rows[0].id;
}

/**
 * Run a query as a signed-in user (role "authenticated", RLS enforced), or as an
 * anonymous visitor when userId is null. Always restores the superuser role.
 */
export async function as<T>(
  db: PGlite,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec(`set role ${userId ? "authenticated" : "anon"}`);
  try {
    const { rows } = await db.query<T>(sql, params);
    return rows;
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
