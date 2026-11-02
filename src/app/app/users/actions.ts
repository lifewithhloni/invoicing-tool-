"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { checkbox, dbErrorMessage, parseForm, requiredText, type FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const role = z.enum(["admin", "finance"], "Choose a role.");

const newUserSchema = z.object({
  full_name: requiredText("Full name", 120),
  email: z.email("Enter a valid email address."),
  role,
  password: z.string().min(12, "Use at least 12 characters."),
});

/**
 * Creates a login. The role goes in app_metadata, which only the secret key can
 * write; a database trigger turns it into the user's profile.
 */
export async function createUser(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(newUserSchema, formData);
  if (parsed.error) return parsed.error;

  const { full_name, email, role: userRole, password } = parsed.data;
  const { error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: userRole },
    user_metadata: { full_name },
  });
  if (error) {
    return {
      ok: false,
      message: /already/i.test(error.message)
        ? "A user with that email already exists."
        : "Could not create the user. Check the details and try again.",
    };
  }

  revalidatePath("/app/users");
  return { ok: true, message: `${full_name} can now sign in. Share the temporary password with them privately.` };
}

const updateSchema = z.object({ role, is_active: checkbox });

export async function updateUser(userId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(updateSchema, formData);
  if (parsed.error) return parsed.error;

  // Goes through RLS as the signed-in admin; the database stops admins changing their own role.
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", userId);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/users");
  return { ok: true, message: "Saved." };
}
