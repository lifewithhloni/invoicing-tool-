"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppRole } from "@/lib/database.types";

const items: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/app", label: "Overview" },
  { href: "/app/customers", label: "Customers & rates" },
  { href: "/app/sites", label: "Sites" },
  { href: "/app/products", label: "Coal products" },
  { href: "/app/drivers", label: "Drivers" },
  { href: "/app/trucks", label: "Trucks" },
  { href: "/app/settings", label: "Company settings" },
  { href: "/app/users", label: "Users", adminOnly: true },
];

export function Nav({ role }: { role: AppRole }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <nav aria-label="Main" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {items
          .filter((item) => !item.adminOnly || role === "admin")
          .map((item) => (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className="block rounded-md px-3 py-1.5 text-sm text-muted hover:bg-subtle hover:text-foreground aria-[current=page]:bg-subtle aria-[current=page]:font-medium aria-[current=page]:text-foreground"
              >
                {item.label}
              </Link>
            </li>
          ))}
      </ul>
    </nav>
  );
}
