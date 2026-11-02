import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { ActiveBadge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createProduct } from "./actions";

export const metadata: Metadata = { title: "Coal products" };

export default async function ProductsPage() {
  const user = await requireStaff();
  const supabase = await createClient();
  const [{ data: products }, { data: aliases }] = await Promise.all([
    supabase.from("coal_products").select("*").order("is_active", { ascending: false }).order("name"),
    supabase.from("coal_product_aliases").select("coal_product_id, alias").order("alias"),
  ]);

  const aliasesByProduct = new Map<string, string[]>();
  for (const a of aliases ?? []) {
    aliasesByProduct.set(a.coal_product_id, [...(aliasesByProduct.get(a.coal_product_id) ?? []), a.alias]);
  }

  return (
    <>
      <PageHeader
        title="Coal products"
        description="Weighbridges print different names for the same load (e.g. “GG - Peas” and “COAL”). Map each printed name to one product so slips can be matched."
      />
      <div className="flex flex-col gap-6">
        <Card>
          {products && products.length > 0 ? (
            <Table head={["Product", "Names on weigh tickets", "Status"]}>
              {products.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/app/products/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </Td>
                  <Td className="text-muted">{aliasesByProduct.get(p.id)?.join(", ") ?? "—"}</Td>
                  <Td>
                    <ActiveBadge active={p.is_active} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState>No coal products yet.</EmptyState>
          )}
        </Card>

        {user.role === "admin" && (
          <Card title="Add a product">
            <ActionForm action={createProduct}>
              <TextField name="name" label="Product name" placeholder="e.g. Peas, RB1, SSCC Met" required />
              <TextField name="description" label="Description" />
              <SubmitButton>Add product</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
