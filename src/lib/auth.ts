import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { AppRole } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type StaffUser = {
  id: string;
  email: string | null;
  fullName: string;
  role: AppRole;
};

/**
 * The signed-in staff member, or null. A user without an active profile
 * (no role assigned, or deactivated) counts as signed out.
 * Cached per request, so layouts and pages can both call it.
 */
export const getStaffUser = cache(async (): Promise<StaffUser | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile || !profile.is_active) return null;
  return {
    id: profile.id,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: profile.full_name,
    role: profile.role,
  };
});

/** For pages and actions that any staff member may use. */
export async function requireStaff(): Promise<StaffUser> {
  const user = await getStaffUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages and actions restricted to administrators. */
export async function requireAdmin(): Promise<StaffUser> {
  const user = await requireStaff();
  if (user.role !== "admin") redirect("/app?denied=1");
  return user;
}
