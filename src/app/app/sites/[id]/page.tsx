import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateSite } from "../actions";
import { SiteFields } from "../site-fields";

export const metadata: Metadata = { title: "Edit site" };

export default async function EditSitePage({ params }: PageProps<"/app/sites/[id]">) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createClient();
  const { data: site } = await supabase.from("sites").select("*").eq("id", id).maybeSingle();
  if (!site) notFound();

  return (
    <>
      <PageHeader title={site.name} back={{ href: "/app/sites", label: "Sites" }} />
      <Card>
        <ActionForm action={updateSite.bind(null, id)}>
          <SiteFields site={site} />
          <SubmitButton>Save site</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
