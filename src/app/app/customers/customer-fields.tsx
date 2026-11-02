import { Checkbox, FieldGrid, TextArea, TextField } from "@/components/form";
import type { CustomerRow } from "@/lib/database.types";

/** Customer detail fields, shared by the add and edit forms. */
export function CustomerFields({ customer }: { customer?: CustomerRow }) {
  return (
    <>
      <TextField name="name" label="Customer name" defaultValue={customer?.name} required />
      <FieldGrid>
        <TextField name="registration_number" label="Company registration no." defaultValue={customer?.registration_number} />
        <TextField name="vat_number" label="VAT no." defaultValue={customer?.vat_number} />
      </FieldGrid>
      <TextArea name="billing_address" label="Billing address" defaultValue={customer?.billing_address} />
      <FieldGrid>
        <TextField name="contact_name" label="Contact person" defaultValue={customer?.contact_name} />
        <TextField name="contact_phone" label="Contact phone" type="tel" defaultValue={customer?.contact_phone} />
        <TextField name="contact_email" label="Contact email" type="email" defaultValue={customer?.contact_email} />
        <TextField
          name="payment_terms_days"
          label="Payment terms (days)"
          inputMode="numeric"
          defaultValue={customer?.payment_terms_days}
          hint="Days from invoice date to due date. Leave empty to use the company default."
        />
      </FieldGrid>
      <TextArea name="notes" label="Notes" defaultValue={customer?.notes} />
      {customer && (
        <Checkbox
          name="is_active"
          label="Active"
          defaultChecked={customer.is_active}
          hint="Inactive customers stay on past records but can't be used for new deliveries."
        />
      )}
    </>
  );
}
