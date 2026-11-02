import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, Checkbox, FieldGrid, Select, SubmitButton, TextField } from "@/components/form";
import { ActiveBadge, Card, Details, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addAlias, removeAlias, updateProduct } from "../actions";

export const metadata: Metadata = { title: "Coal product" };

export default async function ProductPage({ params }: PageProps<"/app/products/[id]">) {
  const { id } = await params;
  const user = await requireStaff();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();

  const [{ data: product }, { data: aliases }, { data: sites }] = await Promise.all([
    supabase.from("coal_products").select("*").eq("id", id).maybeSingle(),
    supabase.from("coal_product_aliases").select("id, alias, site_id").eq("coal_product_id", id).order("alias"),
    supabase.from("sites").select("id, name, kind").eq("is_active", true).order("name"),
  ]);
  if (!product) notFound();

  const siteName = new Map((sites ?? []).map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        title={product.name}
        back={{ href: "/app/products", label: "Coal products" }}
        actions={<ActiveBadge active={product.is_active} />}
      />
      <div className="flex flex-col gap-6">
        <Card
          title="Names on weigh tickets"
          description="Add each name a weighbridge prints for this product. Leave the weighbridge empty if the name means this product everywhere."
        >
          {aliases && aliases.length > 0 ? (
            <Table head={["Printed name", "Weighbridge", ""]}>
              {aliases.map((a) => (
                <tr key={a.id}>
                  <Td className="font-medium">{a.alias}</Td>
                  <Td className="text-muted">{a.site_id ? (siteName.get(a.site_id) ?? "Inactive site") : "Any weighbridge"}</Td>
                  <Td>
                    {isAdmin && (
                      <form action={removeAlias.bind(null, id, a.id)}>
                        <button type="submit" className="text-xs text-danger hover:underline">
                          Remove
                        </button>
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState>No printed names mapped yet.</EmptyState>
          )}

          {isAdmin && (
            <div className="mt-5 border-t border-border pt-5">
              <ActionForm action={addAlias.bind(null, id)} resetOnSuccess>
                <FieldGrid>
                  <TextField name="alias" label="Name as printed" placeholder="e.g. GG - Peas" required />
                  <Select
                    name="site_id"
                    label="Weighbridge"
                    placeholder="Any weighbridge"
                    options={(sites ?? []).map((s) => ({
                      value: s.id,
                      label: `${s.name} (${s.kind === "collection" ? "collection" : "destination"})`,
                    }))}
                  />
                </FieldGrid>
                <SubmitButton>Add name</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>

        <Card title="Details">
          {isAdmin ? (
            <ActionForm action={updateProduct.bind(null, id)}>
              <TextField name="name" label="Product name" defaultValue={product.name} required />
              <TextField name="description" label="Description" defaultValue={product.description} />
              <Checkbox name="is_active" label="Active" defaultChecked={product.is_active} />
              <SubmitButton>Save product</SubmitButton>
            </ActionForm>
          ) : (
            <Details items={[["Description", product.description]]} />
          )}
        </Card>
      </div>
    </>
  );
}
