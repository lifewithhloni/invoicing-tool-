"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  checkbox,
  dbErrorMessage,
  optionalEmail,
  optionalText,
  optionalWholeNumber,
  parseForm,
  percentToFraction,
  type FormState,
} from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const optionalPercent = (label: string, max: number) =>
  z
    .string()
    .transform((v) => v.replace(/\s|%/g, ""))
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{1,2}(\.\d{1,2})?$/.test(v), `${label} must be a percentage like 15 or 2.5.`)
    .refine((v) => v === null || (Number(v) > 0 && Number(v) < max), `${label} must be between 0 and ${max}.`);

const settingsSchema = z
  .object({
    legal_name: optionalText(200),
    letterhead_note: optionalText(200),
    registration_number: optionalText(50),
    physical_address: optionalText(500),
    phone: optionalText(40),
    email: optionalEmail,
    vat_registered: checkbox,
    vat_number: optionalText(30),
    vat_rate_percent: optionalPercent("VAT rate", 100),
    bank_name: optionalText(100),
    bank_account_name: optionalText(120),
    bank_account_number: optionalText(30),
    bank_branch_code: optionalText(20),
    default_payment_terms_days: optionalWholeNumber("Payment terms", 0, 365),
    weight_difference_highlight_pct: optionalPercent("Highlight threshold", 100),
  })
  .superRefine((v, ctx) => {
    if (v.vat_registered && !v.vat_number) {
      ctx.addIssue({ code: "custom", path: ["vat_number"], message: "Enter the VAT number, or untick VAT registered." });
    }
    if (v.vat_registered && !v.vat_rate_percent) {
      ctx.addIssue({ code: "custom", path: ["vat_rate_percent"], message: "Enter the VAT rate, or untick VAT registered." });
    }
  });

export async function updateCompanySettings(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(settingsSchema, formData);
  if (parsed.error) return parsed.error;

  const { vat_rate_percent, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("company_settings")
    .update({ ...rest, vat_rate: vat_rate_percent ? percentToFraction(vat_rate_percent) : null })
    .eq("id", true);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { ok: true, message: "Company settings saved." };
}

const sequenceSchema = z.object({
  next_value: z
    .string()
    .refine((v) => /^\d{1,9}$/.test(v) && Number(v) >= 1, "Enter a whole number of 1 or more.")
    .transform(Number),
});

export async function setNextInvoiceNumber(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(sequenceSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("document_sequences")
    .update({ next_value: parsed.data.next_value })
    .eq("name", "invoice");
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { ok: true, message: `The next invoice will use running number ${parsed.data.next_value}.` };
}
