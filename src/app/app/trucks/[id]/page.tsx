import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateTruck } from "../actions";
import { TruckFields } from "../truck-fields";

export const metadata: Metadata = { title: "Edit truck" };

export default async function EditTruckPage({ params }: PageProps<"/app/trucks/[id]">) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: truck }, { data: drivers }] = await Promise.all([
    supabase.from("trucks").select("*").eq("id", id).maybeSingle(),
    supabase.from("drivers").select("id, full_name, is_active").order("full_name"),
  ]);
  if (!truck) notFound();

  // Keep the current driver selectable even if they've since been made inactive.
  const options = (drivers ?? []).filter((d) => d.is_active || d.id === truck.default_driver_id);

  return (
    <>
      <PageHeader title={truck.registration} back={{ href: "/app/trucks", label: "Trucks" }} />
      <Card>
        <ActionForm action={updateTruck.bind(null, id)}>
          <TruckFields truck={truck} drivers={options} />
          <SubmitButton>Save truck</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
