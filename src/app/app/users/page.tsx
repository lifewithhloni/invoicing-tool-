import type { Metadata } from "next";
import { ActionForm, Checkbox, FieldGrid, Select, SubmitButton, TextField } from "@/components/form";
import { ActiveBadge, Card, EmptyState, Notice, PageHeader, Table, Td } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createUser, updateUser } from "./actions";

export const metadata: Metadata = { title: "Users" };

const roleOptions = [
  { value: "admin", label: "Admin — full access" },
  { value: "finance", label: "Finance — view, invoices and payments" },
];

async function emailsById(): Promise<Map<string, string> | null> {
  if (!process.env.SUPABASE_SECRET_KEY) return null;
  const { data, error } = await createAdminClient().auth.admin.listUsers({ perPage: 1000 });
  if (error) return null;
  return new Map(data.users.map((u) => [u.id, u.email ?? ""]));
}

export default async function UsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const [{ data: profiles }, emails] = await Promise.all([
    supabase.from("profiles").select("*").order("is_active", { ascending: false }).order("full_name"),
    emailsById(),
  ]);

  return (
    <>
      <PageHeader title="Users" description="Office staff who can sign in. Drivers don't need accounts." />
      <div className="flex flex-col gap-6">
        {emails === null && (
          <Notice tone="warning">
            The server&apos;s secret key isn&apos;t set, so emails can&apos;t be shown and new users can&apos;t be created.
            Set <code className="font-mono">SUPABASE_SECRET_KEY</code> on the server.
          </Notice>
        )}

        <Card>
          {profiles && profiles.length > 0 ? (
            <Table head={["Name", "Email", "Role & access"]}>
              {profiles.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <span className="font-medium">{p.full_name}</span>
                    {p.id === me.id && <span className="text-muted"> (you)</span>}
                    <div className="mt-1">
                      <ActiveBadge active={p.is_active} />
                    </div>
                  </Td>
                  <Td className="text-muted">{emails?.get(p.id) ?? "—"}</Td>
                  <Td>
                    {p.id === me.id ? (
                      <span className="text-sm text-muted">Admin. You can&apos;t change your own role.</span>
                    ) : (
                      <ActionForm action={updateUser.bind(null, p.id)} className="max-w-xs gap-2">
                        <Select name="role" label="Role" defaultValue={p.role} options={roleOptions} />
                        <Checkbox name="is_active" label="Can sign in" defaultChecked={p.is_active} />
                        <SubmitButton variant="secondary">Save</SubmitButton>
                      </ActionForm>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState>No users.</EmptyState>
          )}
        </Card>

        {emails !== null && (
          <Card
            title="Add a user"
            description="Set a temporary password and share it privately. They can change it under their name in the menu."
          >
            <ActionForm action={createUser} resetOnSuccess>
              <FieldGrid>
                <TextField name="full_name" label="Full name" required />
                <TextField name="email" label="Email" type="email" autoComplete="off" required />
                <Select name="role" label="Role" placeholder="Choose…" options={roleOptions} />
                <TextField
                  name="password"
                  label="Temporary password"
                  type="password"
                  autoComplete="new-password"
                  hint="At least 12 characters."
                  required
                />
              </FieldGrid>
              <SubmitButton>Add user</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
