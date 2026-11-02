"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { checkbox, dbErrorMessage, optionalText, parseForm, requiredText, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const productSchema = z.object({
  name: requiredText("Product name", 120),
  description: optionalText(500),
});

export async function createProduct(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(productSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { data, error } = await supabase.from("coal_products").insert(parsed.data).select("id").single();
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/products");
  redirect(`/app/products/${data.id}`);
}

export async function updateProduct(id: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(productSchema.extend({ is_active: checkbox }), formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase.from("coal_products").update(parsed.data).eq("id", id);
  if (error) return { ok: false, message: dbErrorMessage(error) };

  revalidatePath("/app/products");
  revalidatePath(`/app/products/${id}`);
  return { ok: true, message: "Product saved." };
}

const aliasSchema = z.object({
  alias: requiredText("Name on the weigh ticket", 120),
  site_id: z.string().transform((v) => (v === "" ? null : v)),
});

export async function addAlias(productId: string, _: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseForm(aliasSchema, formData);
  if (parsed.error) return parsed.error;

  const supabase = await createClient();
  const { error } = await supabase
    .from("coal_product_aliases")
    .insert({ coal_product_id: productId, ...parsed.data });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "That name is already mapped to a product for this weighbridge."
          : dbErrorMessage(error),
    };
  }

  revalidatePath(`/app/products/${productId}`);
  return { ok: true, message: "Name added." };
}

export async function removeAlias(productId: string, aliasId: string): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("coal_product_aliases").delete().eq("id", aliasId).eq("coal_product_id", productId);
  revalidatePath(`/app/products/${productId}`);
}
