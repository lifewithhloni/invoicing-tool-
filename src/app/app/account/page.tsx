import type { Metadata } from "next";
import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { Card, Details, PageHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { changePassword } from "./actions";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireStaff();
  return (
    <>
      <PageHeader title="My account" />
      <div className="flex flex-col gap-6">
        <Card>
          <Details
            items={[
              ["Name", user.fullName],
              ["Email", user.email],
              ["Role", user.role === "admin" ? "Admin" : "Finance"],
            ]}
          />
        </Card>
        <Card title="Change password">
          <ActionForm action={changePassword} resetOnSuccess className="max-w-sm">
            <TextField name="password" label="New password" type="password" autoComplete="new-password" required />
            <TextField name="confirm" label="Repeat new password" type="password" autoComplete="new-password" required />
            <SubmitButton>Change password</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
