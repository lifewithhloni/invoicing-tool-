import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateDriver } from "../actions";
import { DriverFields } from "../driver-fields";

export const metadata: Metadata = { title: "Edit driver" };

export default async function EditDriverPage({ params }: PageProps<"/app/drivers/[id]">) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createClient();
  const { data: driver } = await supabase.from("drivers").select("*").eq("id", id).maybeSingle();
  if (!driver) notFound();

  return (
    <>
      <PageHeader title={driver.full_name} back={{ href: "/app/drivers", label: "Drivers" }} />
      <Card>
        <ActionForm action={updateDriver.bind(null, id)}>
          <DriverFields driver={driver} />
          <SubmitButton>Save driver</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
