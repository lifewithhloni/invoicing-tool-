import Link from "next/link";
import { Card, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { todayInSouthAfrica } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Step = { label: string; done: boolean; href: string; detail?: string };

export default async function OverviewPage({ searchParams }: PageProps<"/app">) {
  const user = await requireStaff();
  const { denied } = await searchParams;
  const supabase = await createClient();
  const today = todayInSouthAfrica();

  const [settings, customers, currentRates, collectionSites, trucks, drivers, invoiceSeq] = await Promise.all([
    supabase.from("company_settings").select("legal_name, default_payment_terms_days").maybeSingle(),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("customer_rates")
      .select("customer_id")
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`),
    supabase.from("sites").select("id", { count: "exact", head: true }).eq("kind", "collection").eq("is_active", true),
    supabase.from("trucks").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("drivers").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("document_sequences").select("next_value, updated_at").eq("name", "invoice").maybeSingle(),
  ]);

  const customerCount = customers.count ?? 0;
  const customersWithRate = new Set((currentRates.data ?? []).map((r) => r.customer_id)).size;

  const steps: Step[] = [
    {
      label: "Company details for invoices",
      done: Boolean(settings.data?.legal_name),
      href: "/app/settings",
    },
    {
      label: "Invoice starting number",
      done: (invoiceSeq.data?.next_value ?? 1) > 1,
      href: "/app/settings",
      detail: "The next number after your last spreadsheet invoice.",
    },
    { label: "At least one customer", done: customerCount > 0, href: "/app/customers" },
    {
      label: "A current rate for every active customer",
      done: customerCount > 0 && customersWithRate >= customerCount,
      href: "/app/customers",
      detail: customerCount > 0 ? `${customersWithRate} of ${customerCount} customers have a rate in force today.` : undefined,
    },
    { label: "Collection sites", done: (collectionSites.count ?? 0) > 0, href: "/app/sites" },
    { label: "Trucks", done: (trucks.count ?? 0) > 0, href: "/app/trucks" },
    { label: "Drivers", done: (drivers.count ?? 0) > 0, href: "/app/drivers" },
  ];

  const remaining = steps.filter((s) => !s.done).length;

  return (
    <>
      <PageHeader
        title={`Hello, ${user.fullName.split(" ")[0]}`}
        description="Deliveries, slips and invoices arrive in the next phases. For now, set up the details they depend on."
      />
      {denied && (
        <div className="mb-6">
          <Notice tone="warning">That page is for administrators only.</Notice>
        </div>
      )}
      <Card
        title="Setup checklist"
        description={remaining === 0 ? "Everything needed for invoicing is in place." : `${remaining} of ${steps.length} still to do.`}
      >
        <ul className="divide-y divide-border">
          {steps.map((step) => (
            <li key={step.label} className="flex items-start gap-3 py-2.5">
              <span
                aria-hidden
                className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs ${
                  step.done ? "bg-success/15 text-success" : "border border-border text-transparent"
                }`}
              >
                ✓
              </span>
              <div className="min-w-0 flex-1">
                <Link href={step.href} className="text-sm font-medium hover:underline">
                  {step.label}
                </Link>
                <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                {step.detail && <p className="text-xs text-muted">{step.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
