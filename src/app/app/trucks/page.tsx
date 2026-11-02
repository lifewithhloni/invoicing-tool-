import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { ActiveBadge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createTruck } from "./actions";
import { TruckFields } from "./truck-fields";

export const metadata: Metadata = { title: "Trucks" };

export default async function TrucksPage() {
  const user = await requireStaff();
  const supabase = await createClient();
  const [{ data: trucks }, { data: drivers }] = await Promise.all([
    supabase.from("trucks").select("*").order("is_active", { ascending: false }).order("registration"),
    supabase.from("drivers").select("id, full_name, is_active").order("full_name"),
  ]);

  const driverName = new Map((drivers ?? []).map((d) => [d.id, d.full_name]));

  return (
    <>
      <PageHeader
        title="Trucks"
        description="The truck registration is how slips are matched to a trip, so keep these accurate."
      />
      <div className="flex flex-col gap-6">
        <Card>
          {trucks && trucks.length > 0 ? (
            <Table head={["Registration", "Trailers", "Usual driver", "Status"]}>
              {trucks.map((t) => (
                <tr key={t.id}>
                  <Td>
                    {user.role === "admin" ? (
                      <Link href={`/app/trucks/${t.id}`} className="font-mono font-medium hover:underline">
                        {t.registration}
                      </Link>
                    ) : (
                      <span className="font-mono font-medium">{t.registration}</span>
                    )}
                  </Td>
                  <Td className="font-mono text-muted">{t.trailer_registrations.join(", ") || "—"}</Td>
                  <Td className="text-muted">{t.default_driver_id ? driverName.get(t.default_driver_id) : "—"}</Td>
                  <Td>
                    <ActiveBadge active={t.is_active} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState>No trucks yet.</EmptyState>
          )}
        </Card>

        {user.role === "admin" && (
          <Card title="Add a truck">
            <ActionForm action={createTruck} resetOnSuccess>
              <TruckFields drivers={(drivers ?? []).filter((d) => d.is_active)} />
              <SubmitButton>Add truck</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
