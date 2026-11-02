"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { checkbox, dbErrorMessage, optionalText, parseForm, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const registration = z
  .string()
  .transform((v) => v.toUpperCase().replace(/\s+/g, ""))
  .refine((v) => /^[A-Z0-9-]{2,20}$/.test(v), "Enter a registration using letters and numbers, e.g. LT48JRGP.");

const truckSchema = z.object({
  registration,
  trailer_registrations: z
    .string()
    .transform((v) =>
      v
        .split(/[,\n]/)
        .map((t) => t.trim().toUpperCase().replace(/\s+/g, ""))
        .filter(Boolean),
    )
    .refine((list) => list.every((t) => /^[A-Z0-9-]{2,20}$/.test(t)), "Separate trailer registrations with commas.")
    .refine((list) => list.length <= 4, "A truck can have at most 4 trailers."),
  description: optionalText(200),
  default_driver_id: z.string().transform((v) => (v === "" ? null : v)),
});

export async function createTruck(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(truckSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.from("trucks").insert(parsed.data);
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "A truck with that registration already exists." : dbErrorMessage(error),
    };
  }

  revalidatePath("/app/trucks");
  return { ok: true, message: `${parsed.data.registration} added.` };
}

export async function updateTruck(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(truckSchema.extend({ is_active: checkbox }), formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.from("trucks").update(parsed.data).eq("id", id);
  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "A truck with that registration already exists." : dbErrorMessage(error),
    };
  }

  revalidatePath("/app/trucks");
  redirect("/app/trucks");
}
