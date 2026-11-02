import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createCustomer } from "../actions";
import { CustomerFields } from "../customer-fields";

export const metadata: Metadata = { title: "Add customer" };

export default async function NewCustomerPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Add customer"
        back={{ href: "/app/customers", label: "Customers" }}
        description="You'll set the rate per ton and any monthly deductions on the next page."
      />
      <Card>
        <ActionForm action={createCustomer}>
          <CustomerFields />
          <SubmitButton>Add customer</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
