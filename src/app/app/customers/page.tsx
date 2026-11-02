import type { Metadata } from "next";
import Link from "next/link";
import { ActiveBadge, Card, EmptyState, LinkButton, PageHeader, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatRand, todayInSouthAfrica } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customers & rates" };

export default async function CustomersPage() {
  const user = await requireStaff();
  const supabase = await createClient();
  const today = todayInSouthAfrica();

  const [{ data: customers }, { data: rates }, { data: deductions }] = await Promise.all([
    supabase.from("customers").select("*").order("is_active", { ascending: false }).order("name"),
    supabase
      .from("customer_rates")
      .select("customer_id, rate_per_ton::text")
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`),
    supabase
      .from("customer_recurring_deductions")
      .select("customer_id, monthly_amount::text")
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`),
  ]);

  const rateByCustomer = new Map((rates ?? []).map((r) => [r.customer_id, r.rate_per_ton]));
  const deductionCount = new Map<string, number>();
  for (const d of deductions ?? []) deductionCount.set(d.customer_id, (deductionCount.get(d.customer_id) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Customers & rates"
        description="Who you invoice, the haulage rate per ton in force today, and any fixed monthly deductions."
        actions={user.role === "admin" && <LinkButton href="/app/customers/new">Add customer</LinkButton>}
      />
      <Card>
        {customers && customers.length > 0 ? (
          <Table head={["Customer", "Rate today", "Monthly deductions", "Status"]}>
            {customers.map((c) => {
              const rate = rateByCustomer.get(c.id);
              return (
                <tr key={c.id}>
                  <Td>
                    <Link href={`/app/customers/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </Td>
                  <Td className="tabular">
                    {rate ? `${formatRand(rate)} / t` : <span className="text-warning">No rate in force</span>}
                  </Td>
                  <Td className="tabular">{deductionCount.get(c.id) ?? 0}</Td>
                  <Td>
                    <ActiveBadge active={c.is_active} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <EmptyState>No customers yet.</EmptyState>
        )}
      </Card>
    </>
  );
}
