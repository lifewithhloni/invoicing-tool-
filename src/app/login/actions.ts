"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaffUser } from "@/lib/auth";
import { parseForm, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  email: z.email("Enter your email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function signIn(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseForm(schema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, message: "Email or password is incorrect." };
  }

  // A valid login without an active profile (no role, or deactivated) gets no access.
  if (!(await getStaffUser())) {
    await supabase.auth.signOut();
    return { ok: false, message: "Your account doesn't have access. Ask an administrator to check it." };
  }

  redirect("/app");
}
