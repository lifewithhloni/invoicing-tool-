"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { checkbox, dbErrorMessage, optionalText, parseForm, requiredText, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const driverSchema = z.object({
  full_name: requiredText("Full name", 120),
  slip_name: optionalText(60),
  phone: optionalText(40),
  notes: optionalText(1000),
});

export async function createDriver(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(driverSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.from("drivers").insert(parsed.data);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/drivers");
  return { ok: true, message: `${parsed.data.full_name} added.` };
}

export async function updateDriver(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(driverSchema.extend({ is_active: checkbox }), formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.from("drivers").update(parsed.data).eq("id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/drivers");
  redirect("/app/drivers");
}
