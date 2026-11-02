import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, FieldGrid, SubmitButton, TextField } from "@/components/form";
import { ActiveBadge, Badge, Card, Details, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatRand, todayInSouthAfrica } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  endRecurringDeduction,
  removeFutureRate,
  setCustomerRate,
  setRecurringDeduction,
  updateCustomer,
} from "../actions";
import { CustomerFields } from "../customer-fields";

export const metadata: Metadata = { title: "Customer" };

function periodStatus(from: string, to: string | null, today: string) {
  if (from > today) return <Badge tone="warning">Starts {formatDate(from)}</Badge>;
  if (to !== null && to < today) return <Badge>Ended</Badge>;
  return <Badge tone="success">In force</Badge>;
}

export default async function CustomerPage({ params }: PageProps<"/app/customers/[id]">) {
  const { id } = await params;
  const user = await requireStaff();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();
  const today = todayInSouthAfrica();

  const [{ data: customer }, { data: rates }, { data: deductions }] = await Promise.all([
    supabase.from("customers").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("customer_rates")
      .select("id, rate_per_ton::text, effective_from, effective_to, reason, created_at")
      .eq("customer_id", id)
      .order("effective_from", { ascending: false }),
    supabase
      .from("customer_recurring_deductions")
      .select("id, description, monthly_amount::text, effective_from, effective_to, reason")
      .eq("customer_id", id)
      .order("effective_from", { ascending: false }),
  ]);

  if (!customer) notFound();

  return (
    <>
      <PageHeader
        title={customer.name}
        back={{ href: "/app/customers", label: "Customers" }}
        actions={<ActiveBadge active={customer.is_active} />}
      />

      <div className="flex flex-col gap-6">
        <Card
          title="Rate per ton"
          description="One rate per customer. Invoices use the rate in force on the invoice date. A rate can't be edited once added: add a new rate from a new start date, and the previous one ends the day before."
        >
          {rates && rates.length > 0 ? (
            <Table head={["Rate", "From", "To", "Status", "Reason", ""]}>
              {rates.map((r) => (
                <tr key={r.id}>
                  <Td className="tabular font-medium">{formatRand(r.rate_per_ton)} / t</Td>
                  <Td className="tabular">{formatDate(r.effective_from)}</Td>
                  <Td className="tabular">{r.effective_to ? formatDate(r.effective_to) : "Open"}</Td>
                  <Td>{periodStatus(r.effective_from, r.effective_to, today)}</Td>
                  <Td className="text-muted">{r.reason ?? "—"}</Td>
                  <Td>
                    {isAdmin && r.effective_from > today && (
                      <form action={removeFutureRate.bind(null, id, r.id)}>
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
            <EmptyState>No rate yet. Invoices can&apos;t be issued for this customer until one is added.</EmptyState>
          )}

          {isAdmin && (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="mb-3 text-sm font-semibold">Add a rate</h3>
              <ActionForm action={setCustomerRate.bind(null, id)} resetOnSuccess>
                <FieldGrid>
                  <TextField name="rate_per_ton" label="Rate per ton (R)" inputMode="decimal" placeholder="652.25" required />
                  <TextField name="effective_from" label="Starts on" type="date" defaultValue={today} required />
                </FieldGrid>
                <TextField name="reason" label="Reason" placeholder="e.g. 2027 rate agreed with PBSA" />
                <SubmitButton>Save rate</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>

        <Card
          title="Fixed monthly deductions"
          description="Amounts taken off every monthly invoice, such as the diesel deduction. A changed amount is added from a new start date; past invoices keep the amount they used."
        >
          {deductions && deductions.length > 0 ? (
            <Table head={["Description", "Per month", "From", "To", "Status", ""]}>
              {deductions.map((d) => {
                const running = d.effective_to === null || d.effective_to >= today;
                return (
                  <tr key={d.id}>
                    <Td className="font-medium">{d.description}</Td>
                    <Td className="tabular">{formatRand(d.monthly_amount)}</Td>
                    <Td className="tabular">{formatDate(d.effective_from)}</Td>
                    <Td className="tabular">{d.effective_to ? formatDate(d.effective_to) : "Open"}</Td>
                    <Td>{periodStatus(d.effective_from, d.effective_to, today)}</Td>
                    <Td>
                      {isAdmin && running && d.effective_from <= today && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted hover:text-foreground">End…</summary>
                          <div className="mt-2 w-56">
                            <ActionForm action={endRecurringDeduction.bind(null, id, d.id)}>
                              <TextField name="last_day" label="Last day it applies" type="date" defaultValue={today} required />
                              <SubmitButton variant="secondary">End deduction</SubmitButton>
                            </ActionForm>
                          </div>
                        </details>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <EmptyState>No monthly deductions.</EmptyState>
          )}

          {isAdmin && (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="mb-3 text-sm font-semibold">Add or change a deduction</h3>
              <ActionForm action={setRecurringDeduction.bind(null, id)} resetOnSuccess>
                <FieldGrid>
                  <TextField
                    name="description"
                    label="Description"
                    placeholder="Monthly diesel deduction"
                    hint="Use the same description to change an existing deduction's amount."
                    required
                  />
                  <TextField name="monthly_amount" label="Amount per month (R)" inputMode="decimal" placeholder="59000.00" required />
                  <TextField name="effective_from" label="Starts on" type="date" defaultValue={today} required />
                  <TextField name="reason" label="Reason" />
                </FieldGrid>
                <SubmitButton>Save deduction</SubmitButton>
              </ActionForm>
            </div>
          )}
        </Card>

        <Card title="Details">
          {isAdmin ? (
            <ActionForm action={updateCustomer.bind(null, id)}>
              <CustomerFields customer={customer} />
              <SubmitButton>Save details</SubmitButton>
            </ActionForm>
          ) : (
            <Details
              items={[
                ["Registration no.", customer.registration_number],
                ["VAT no.", customer.vat_number],
                ["Billing address", customer.billing_address],
                ["Contact", [customer.contact_name, customer.contact_phone, customer.contact_email].filter(Boolean).join(" · ")],
                ["Payment terms", customer.payment_terms_days !== null ? `${customer.payment_terms_days} days` : "Company default"],
                ["Notes", customer.notes],
              ]}
            />
          )}
        </Card>
      </div>
    </>
  );
}

