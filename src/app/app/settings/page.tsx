import type { Metadata } from "next";
import { ActionForm, Checkbox, FieldGrid, SubmitButton, TextArea, TextField } from "@/components/form";
import { Card, Details, Notice, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setNextInvoiceNumber, updateCompanySettings } from "./actions";

export const metadata: Metadata = { title: "Company settings" };

function fractionToPercent(v: string | null): string | null {
  if (!v) return null;
  return String(Number((Number(v) * 100).toFixed(2)));
}

/** Example invoice number for a running number, in the format decided in Q26: {n}{MM}{YYYY}. */
function exampleInvoiceNumber(n: number): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${n}${mm}${now.getFullYear()}`;
}

export default async function SettingsPage() {
  const user = await requireStaff();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();

  const [{ data: s }, { data: seq }] = await Promise.all([
    supabase
      .from("company_settings")
      .select("*, vat_rate::text, weight_difference_highlight_pct::text")
      .maybeSingle(),
    supabase.from("document_sequences").select("next_value").eq("name", "invoice").maybeSingle(),
  ]);

  if (!s) {
    return (
      <>
        <PageHeader title="Company settings" />
        <Notice tone="warning">Company settings couldn&apos;t be loaded. Check the database migrations have been applied.</Notice>
      </>
    );
  }

  const nextInvoice = seq?.next_value ?? 1;

  return (
    <>
      <PageHeader title="Company settings" description="Your business details as they appear on invoices." />
      <div className="flex flex-col gap-6">
        <Card title="Business details">
          {isAdmin ? (
            <ActionForm action={updateCompanySettings}>
              <FieldGrid>
                <TextField name="legal_name" label="Business name" defaultValue={s.legal_name} placeholder="Arete Conglomerate" />
                <TextField
                  name="letterhead_note"
                  label="Line under the name"
                  defaultValue={s.letterhead_note}
                  placeholder="In partnership with MMET Projects"
                />
                <TextField name="registration_number" label="Company registration no." defaultValue={s.registration_number} />
                <TextField name="phone" label="Phone" type="tel" defaultValue={s.phone} />
                <TextField name="email" label="Email" type="email" defaultValue={s.email} />
                <TextField
                  name="default_payment_terms_days"
                  label="Default payment terms (days)"
                  inputMode="numeric"
                  defaultValue={s.default_payment_terms_days}
                  hint="Used when a customer has no terms of their own."
                />
              </FieldGrid>
              <TextArea name="physical_address" label="Address" defaultValue={s.physical_address} rows={2} />

              <fieldset className="flex flex-col gap-4 border-t border-border pt-4">
                <legend className="text-sm font-semibold">VAT</legend>
                <Checkbox
                  name="vat_registered"
                  label="VAT registered"
                  defaultChecked={s.vat_registered}
                  hint="When ticked, invoices add VAT and show your VAT number. Leave unticked if the business isn't registered."
                />
                <FieldGrid>
                  <TextField name="vat_number" label="VAT no." defaultValue={s.vat_number} />
                  <TextField
                    name="vat_rate_percent"
                    label="VAT rate (%)"
                    inputMode="decimal"
                    defaultValue={fractionToPercent(s.vat_rate)}
                    placeholder="15"
                  />
                </FieldGrid>
              </fieldset>

              <fieldset className="flex flex-col gap-4 border-t border-border pt-4">
                <legend className="text-sm font-semibold">Payment details on invoices</legend>
                <FieldGrid>
                  <TextField name="bank_name" label="Bank" defaultValue={s.bank_name} />
                  <TextField name="bank_account_name" label="Account name" defaultValue={s.bank_account_name} />
                  <TextField name="bank_account_number" label="Account no." inputMode="numeric" defaultValue={s.bank_account_number} />
                  <TextField name="bank_branch_code" label="Branch code" inputMode="numeric" defaultValue={s.bank_branch_code} />
                </FieldGrid>
              </fieldset>

              <fieldset className="flex flex-col gap-4 border-t border-border pt-4">
                <legend className="text-sm font-semibold">Weight differences</legend>
                <TextField
                  name="weight_difference_highlight_pct"
                  label="Highlight differences above (%)"
                  inputMode="decimal"
                  defaultValue={s.weight_difference_highlight_pct}
                  hint="Display only. A difference between collected and delivered weight never blocks approval or changes amounts."
                />
              </fieldset>

              <SubmitButton>Save settings</SubmitButton>
            </ActionForm>
          ) : (
            <Details
              items={[
                ["Business name", s.legal_name],
                ["Line under the name", s.letterhead_note],
                ["Registration no.", s.registration_number],
                ["Address", s.physical_address],
                ["Phone", s.phone],
                ["Email", s.email],
                ["VAT", s.vat_registered ? `Registered · ${s.vat_number} · ${fractionToPercent(s.vat_rate)}%` : "Not registered"],
                ["Default payment terms", s.default_payment_terms_days !== null ? `${s.default_payment_terms_days} days` : null],
                ["Bank", [s.bank_name, s.bank_account_name, s.bank_account_number, s.bank_branch_code].filter(Boolean).join(" · ")],
              ]}
            />
          )}
        </Card>

        <Card
          title="Invoice numbering"
          description={
            <>
              Invoice numbers are the running number followed by the month and year of issue, so running number{" "}
              {nextInvoice} issued this month would be <span className="font-mono">{exampleInvoiceNumber(nextInvoice)}</span>.
              Numbers are only taken when an invoice is issued.
            </>
          }
        >
          {isAdmin ? (
            <ActionForm action={setNextInvoiceNumber}>
              <TextField
                name="next_value"
                label="Next running number"
                inputMode="numeric"
                defaultValue={nextInvoice}
                hint="Set this once at go-live to the number after your last spreadsheet invoice (e.g. 6 if the last was 5102026)."
                required
              />
              <SubmitButton>Save number</SubmitButton>
            </ActionForm>
          ) : (
            <Details items={[["Next running number", String(nextInvoice)]]} />
          )}
        </Card>
      </div>
    </>
  );
}
