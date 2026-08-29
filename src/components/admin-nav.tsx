"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/menu", label: "Menu" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/delivery", label: "Delivery" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/reviews", label: "Reviews" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-6 flex flex-wrap gap-2">
      {links.map((link) => {
        const active =
          link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              active
                ? "bg-gold-400 text-ink-950"
                : "bg-cream-50/10 text-cream-100 hover:bg-cream-50/20"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
