import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { getStaffUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Sign in · Coal Delivery & Invoicing" };

export default async function LoginPage() {
  await connection(); // check configuration at request time, not build time
  if (!isSupabaseConfigured()) redirect("/");
  if (await getStaffUser()) redirect("/app");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Coal Delivery &amp; Invoicing</p>
        <div className="mt-6">
          <ActionForm action={signIn}>
            <TextField name="email" label="Email" type="email" autoComplete="username" required />
            <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
            <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
          </ActionForm>
        </div>
        <p className="mt-6 text-xs text-muted">Accounts are created by an administrator.</p>
      </div>
    </main>
  );
}
