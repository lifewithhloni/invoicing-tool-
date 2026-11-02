import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { ActiveBadge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import type { SiteKind } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { createSite } from "./actions";
import { SiteFields } from "./site-fields";

export const metadata: Metadata = { title: "Sites" };

const sections: { kind: SiteKind; title: string; description: string }[] = [
  {
    kind: "collection",
    title: "Collection sites",
    description: "Mines and loading weighbridges where coal is collected. Invoice lines show this name.",
  },
  {
    kind: "destination",
    title: "Destinations",
    description: "Where coal is delivered and weighed again, e.g. Rustenburg Depot or Mmamoso Siding.",
  },
];

export default async function SitesPage() {
  const user = await requireStaff();
  const supabase = await createClient();
  const { data: sites } = await supabase.from("sites").select("*").order("is_active", { ascending: false }).order("name");

  return (
    <>
      <PageHeader title="Sites" description="The weighbridges at each end of a trip." />
      <div className="flex flex-col gap-6">
        {sections.map((section) => {
          const rows = (sites ?? []).filter((s) => s.kind === section.kind);
          return (
            <Card key={section.kind} title={section.title} description={section.description}>
              {rows.length > 0 ? (
                <Table head={["Name", "Location", "Status"]}>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <Td>
                        {user.role === "admin" ? (
                          <Link href={`/app/sites/${s.id}`} className="font-medium hover:underline">
                            {s.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{s.name}</span>
                        )}
                      </Td>
                      <Td className="text-muted">{s.location ?? "—"}</Td>
                      <Td>
                        <ActiveBadge active={s.is_active} />
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <EmptyState>None yet.</EmptyState>
              )}
            </Card>
          );
        })}

        {user.role === "admin" && (
          <Card title="Add a site">
            <ActionForm action={createSite} resetOnSuccess>
              <SiteFields />
              <SubmitButton>Add site</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
