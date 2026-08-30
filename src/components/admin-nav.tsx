"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Eleven tabs was a filing cabinet, not a workspace — and on a phone it wrapped
 * to three rows before the owner had done anything.
 *
 * The fix is frequency, not deletion. What a stall touches every day gets the
 * top row; what it touches weekly sits one click in; what it sets once and
 * forgets lives behind the gear. Every page still exists at the same URL — a
 * bookmark from last week still works.
 */

type Section = {
  href: string;
  label: string;
  /** Sibling pages shown as a second row once you're inside this section. */
  children?: { href: string; label: string }[];
  /** Pushed to the right, away from the daily work. */
  aside?: boolean;
};

const SECTIONS: Section[] = [
  { href: "/admin", label: "Today" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/menu", label: "Menu" },
  {
    href: "/admin/inbox",
    label: "Chat",
    children: [
      { href: "/admin/inbox", label: "Inbox" },
      { href: "/admin/faq", label: "Answers" },
    ],
  },
  {
    href: "/admin/analytics",
    label: "Insights",
    aside: true,
    children: [
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/reviews", label: "Reviews" },
      { href: "/admin/customers", label: "Customers" },
    ],
  },
  {
    href: "/admin/hours",
    label: "⚙ Setup",
    aside: true,
    children: [
      { href: "/admin/hours", label: "Hours" },
      { href: "/admin/delivery", label: "Delivery" },
      { href: "/admin/payments", label: "Payments" },
    ],
  },
];

/**
 * Which section owns this path — a child page still lights up its parent.
 *
 * Exported so the route table can be checked without a browser: every admin
 * URL must land in exactly one section, or a page becomes unreachable from the
 * nav while still existing at its old address.
 */
export function activeSection(pathname: string): Section | null {
  for (const section of SECTIONS) {
    const paths = section.children?.map((c) => c.href) ?? [section.href];
    if (paths.some((p) => (p === "/admin" ? pathname === p : pathname.startsWith(p)))) {
      return section;
    }
  }
  return null;
}

function SectionLink({ section, active }: { section: Section; active: boolean }) {
  return (
    <Link
      href={section.href}
      className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
        active
          ? "bg-gold-400 text-ink-950"
          : "bg-cream-50/10 text-cream-100 hover:bg-cream-50/20"
      }`}
    >
      {section.label}
    </Link>
  );
}

export function AdminNav() {
  const pathname = usePathname();
  const current = activeSection(pathname);

  return (
    <nav className="mt-6 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {SECTIONS.filter((s) => !s.aside).map((section) => (
          <SectionLink
            key={section.href}
            section={section}
            active={current?.href === section.href}
          />
        ))}

        {/* Pushed right and kept together: understanding the shop and setting
            it up are both weekly jobs, not the daily queue. */}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {SECTIONS.filter((s) => s.aside).map((section) => (
            <SectionLink
              key={section.href}
              section={section}
              active={current?.href === section.href}
            />
          ))}
        </span>
      </div>

      {/* Only the section you're in opens up, so the second row is never a
          second filing cabinet. */}
      {current?.children && (
        <div className="flex flex-wrap gap-1.5 border-t border-cream-50/10 pt-2">
          {current.children.map((child) => {
            const active = pathname.startsWith(child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? "bg-cream-50 text-ink-950"
                    : "text-cream-100/60 hover:bg-cream-50/10 hover:text-cream-100"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
