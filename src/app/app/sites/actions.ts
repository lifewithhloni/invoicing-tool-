"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { checkbox, dbErrorMessage, optionalText, parseForm, requiredText, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const siteSchema = z.object({
  kind: z.enum(["collection", "destination"], "Choose whether coal is collected or delivered here."),
  name: requiredText("Site name"),
  location: optionalText(200),
  notes: optionalText(1000),
});

export async function createSite(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(siteSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.from("sites").insert(parsed.data);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/sites");
  return { ok: true, message: `${parsed.data.name} added.` };
}

export async function updateSite(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(siteSchema.extend({ is_active: checkbox }), formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.from("sites").update(parsed.data).eq("id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/sites");
  redirect("/app/sites");
}
