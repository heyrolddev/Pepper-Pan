import { getViewer } from "@/lib/auth";
import { MyAccount } from "@/components/my-account";
import { privatePage } from "@/lib/seo";
import type { Role } from "@/lib/permissions";

export const metadata = privatePage("My account");

/**
 * Everybody who works here has one of these, with no capability check.
 *
 * That is the point: it is the only screen in HQ that belongs to the person
 * rather than to the shop, and the thing it exists to carry — a role offer
 * waiting to be accepted — is most likely to arrive for whoever has the
 * least access.
 */
export default async function MyAccountPage() {
  const viewer = await getViewer();
  const p = viewer?.profile;
  if (!p) return null; // the layout has already redirected anyone not signed in

  return (
    <MyAccount
      name={p.full_name}
      email={viewer.email}
      role={p.role as Role}
      phone={p.phone}
      pendingRole={(p.pending_role as Role | null) ?? null}
    />
  );
}
