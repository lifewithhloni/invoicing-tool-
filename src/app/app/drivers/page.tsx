import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { ActiveBadge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createDriver } from "./actions";
import { DriverFields } from "./driver-fields";

export const metadata: Metadata = { title: "Drivers" };

export default async function DriversPage() {
  const user = await requireStaff();
  const supabase = await createClient();
  const { data: drivers } = await supabase
    .from("drivers")
    .select("*")
    .order("is_active", { ascending: false })
    .order("full_name");

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Drivers don't log in. Office staff upload their slips; drivers are recorded here so trips can be identified."
      />
      <div className="flex flex-col gap-6">
        <Card>
          {drivers && drivers.length > 0 ? (
            <Table head={["Name", "On weigh tickets", "Phone", "Status"]}>
              {drivers.map((d) => (
                <tr key={d.id}>
                  <Td>
                    {user.role === "admin" ? (
                      <Link href={`/app/drivers/${d.id}`} className="font-medium hover:underline">
                        {d.full_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{d.full_name}</span>
                    )}
                  </Td>
                  <Td className="text-muted">{d.slip_name ?? "—"}</Td>
                  <Td className="text-muted">{d.phone ?? "—"}</Td>
                  <Td>
                    <ActiveBadge active={d.is_active} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState>No drivers yet.</EmptyState>
          )}
        </Card>

        {user.role === "admin" && (
          <Card title="Add a driver">
            <ActionForm action={createDriver} resetOnSuccess>
              <DriverFields />
              <SubmitButton>Add driver</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
