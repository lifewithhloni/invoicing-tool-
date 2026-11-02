import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { signOut } from "./actions";
import { Nav } from "./nav";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  if (!isSupabaseConfigured()) redirect("/");
  const user = await requireStaff();

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="border-b border-border bg-surface px-4 pt-4 pb-3 lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-6">
        <div className="mb-3 flex items-center justify-between gap-3 lg:mb-6 lg:block">
          <Link href="/app" className="text-sm font-semibold tracking-tight">
            Coal Delivery &amp; Invoicing
          </Link>
          <div className="flex items-center gap-3 text-xs text-muted lg:mt-4 lg:block">
            <Link href="/app/account" className="truncate hover:text-foreground lg:block">
              {user.fullName} · {user.role === "admin" ? "Admin" : "Finance"}
            </Link>
            <form action={signOut} className="lg:mt-1">
              <button type="submit" className="hover:text-foreground">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <Nav role={user.role} />
      </aside>
      <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
