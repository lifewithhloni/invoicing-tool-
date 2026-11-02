import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

export default async function Home() {
  await connection(); // check configuration at request time, not build time
  if (isSupabaseConfigured()) redirect("/app");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-xl font-semibold tracking-tight">Coal Delivery &amp; Invoicing</h1>
      <p className="text-sm text-muted">
        The app isn&apos;t connected to a database yet. Copy <code className="font-mono">.env.example</code> to{" "}
        <code className="font-mono">.env.local</code>, add the Supabase project URL and keys, apply the migrations in{" "}
        <code className="font-mono">supabase/migrations</code>, then restart the app. See the README for the steps.
      </p>
    </main>
  );
}
