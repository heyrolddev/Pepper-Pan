import { redirectStaffToHQ } from "@/lib/auth";

import { privatePage } from "@/lib/seo";

export const metadata = privatePage("Cart");

/** Customers only — the owner has HQ for this. See `redirectStaffToHQ`. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await redirectStaffToHQ();
  return <>{children}</>;
}
