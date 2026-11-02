"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import {
  checkbox,
  dbErrorMessage,
  isoDate,
  optionalEmail,
  optionalText,
  optionalWholeNumber,
  parseForm,
  randAmount,
  requiredText,
  type FormState,
} from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const customerSchema = z.object({
  name: requiredText("Customer name"),
  registration_number: optionalText(50),
  vat_number: optionalText(30),
  billing_address: optionalText(500),
  contact_name: optionalText(120),
  contact_phone: optionalText(40),
  contact_email: optionalEmail,
  payment_terms_days: optionalWholeNumber("Payment terms", 0, 365),
  notes: optionalText(1000),
});

export async function createCustomer(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(customerSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").insert(parsed.data).select("id").single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/customers");
  redirect(`/app/customers/${data.id}`);
}

export async function updateCustomer(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(customerSchema.extend({ is_active: checkbox }), formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.from("customers").update(parsed.data).eq("id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/customers");
  revalidatePath(`/app/customers/${id}`);
  return { ok: true, message: "Customer details saved." };
}

const rateSchema = z.object({
  rate_per_ton: randAmount("Rate per ton"),
  effective_from: isoDate("Start date"),
  reason: optionalText(300),
});

export async function setCustomerRate(customerId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(rateSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_rate", {
    p_customer_id: customerId,
    p_rate_per_ton: parsed.data.rate_per_ton,
    p_effective_from: parsed.data.effective_from,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/app/customers/${customerId}`);
  revalidatePath("/app/customers");
  return { ok: true, message: "Rate saved. The previous rate now ends the day before." };
}

export async function removeFutureRate(customerId: string, rateId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  // The database refuses this for rates that have already taken effect.
  await supabase.from("customer_rates").delete().eq("id", rateId).eq("customer_id", customerId);
  revalidatePath(`/app/customers/${customerId}`);
}

const deductionSchema = z.object({
  description: requiredText("Description", 120),
  monthly_amount: randAmount("Monthly amount"),
  effective_from: isoDate("Start date"),
  reason: optionalText(300),
});

export async function setRecurringDeduction(customerId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(deductionSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_customer_recurring_deduction", {
    p_customer_id: customerId,
    p_description: parsed.data.description,
    p_monthly_amount: parsed.data.monthly_amount,
    p_effective_from: parsed.data.effective_from,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/app/customers/${customerId}`);
  return { ok: true, message: "Deduction saved." };
}

const endDeductionSchema = z.object({ last_day: isoDate("Last day") });

export async function endRecurringDeduction(
  customerId: string,
  deductionId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(endDeductionSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.rpc("end_customer_recurring_deduction", {
    p_deduction_id: deductionId,
    p_last_day: parsed.data.last_day,
  });
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath(`/app/customers/${customerId}`);
  return { ok: true, message: "Deduction ended." };
}
