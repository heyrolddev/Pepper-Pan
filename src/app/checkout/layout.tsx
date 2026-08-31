import { redirectStaffToHQ } from "@/lib/auth";

/** Customers only — the owner has HQ for this. See `redirectStaffToHQ`. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await redirectStaffToHQ();
  return <>{children}</>;
}
