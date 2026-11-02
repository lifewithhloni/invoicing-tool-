"use server";

import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { parseForm, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const schema = z
  .object({
    password: z.string().min(12, "Use at least 12 characters."),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  await requireStaff();
  const parsed = parseForm(schema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: "Could not change the password. Try a different one." };

  return { ok: true, message: "Password changed." };
}
