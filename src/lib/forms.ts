import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

/** Result returned by every form server action and read by useActionState. */
export type FormState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
};

export const initialFormState: FormState = {};

/** Read a FormData into a plain object of trimmed strings (checkboxes become "on"). */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") values[key] = value.trim();
  }
  return values;
}

/** Parse form values with a schema, returning either data or a FormState with field errors. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): { data: z.infer<S>; error?: undefined } | { data?: undefined; error: FormState } {
  const result = schema.safeParse(formValues(formData));
  if (result.success) return { data: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { error: { ok: false, message: "Please correct the highlighted fields.", fieldErrors } };
}

// Reusable field schemas -----------------------------------------------------

/** Optional text: empty input becomes null. */
export const optionalText = (max = 500) =>
  z
    .string()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => (v === "" ? null : v));

export const requiredText = (label: string, max = 200) =>
  z.string().min(1, `${label} is required.`).max(max, `Keep this under ${max} characters.`);

export const optionalEmail = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address.");

export const optionalWholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d+$/.test(v), `${label} must be a whole number.`)
    .transform((v) => (v === null ? null : Number(v)))
    .refine((v) => v === null || (v >= min && v <= max), `${label} must be between ${min} and ${max}.`);

/** A checkbox: present ("on") means true. */
export const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

/**
 * A rand amount typed by a person, e.g. "652.25", "R 59 000" or "59,000.00".
 * Kept as a decimal string (never a float) and validated to at most 2 decimals.
 */
export const randAmount = (label: string) =>
  z
    .string()
    .transform((v) => v.replace(/^R\s*/i, "").replace(/[\s,]/g, ""))
    .refine((v) => /^\d{1,10}(\.\d{1,2})?$/.test(v), `${label} must be an amount in rand, with at most 2 decimals.`)
    .refine((v) => Number(v) > 0, `${label} must be more than zero.`);

/** "15" or "15.5" (percent, at most 2 decimals) → "0.1500" / "0.1550" (fraction as stored). */
export function percentToFraction(v: string): string {
  const [whole, frac = ""] = v.split(".");
  const hundredths = Number(`${whole}${frac.padEnd(2, "0")}`); // percent × 100, exact integer
  return (hundredths / 10000).toFixed(4);
}

export const isoDate = (label: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date.`);

// Database errors --------------------------------------------------------------

/** Turn a Postgres/PostgREST error into a message a person can act on. */
export function dbErrorMessage(error: PostgrestError | null, fallback = "Could not save. Please try again."): string {
  if (!error) return fallback;
  switch (error.code) {
    case "23505":
      return "That already exists. Use a different name or registration.";
    case "23503":
      return "This record is still in use elsewhere, so it can't be removed. Mark it inactive instead.";
    case "23P01":
      return "That date range overlaps an existing one.";
    case "42501":
      return "You don't have permission to do that.";
    case "P0001":
      return error.message;
    default:
      return fallback;
  }
}
