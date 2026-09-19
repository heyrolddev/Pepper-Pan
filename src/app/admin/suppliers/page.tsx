import { NotAllowed } from "@/components/not-allowed";
import { SupplierList } from "@/components/supplier-list";
import { listSuppliers } from "@/app/admin/suppliers/actions";
import { can, getViewer } from "@/lib/auth";
import { hqTitle } from "@/lib/hq-theme";

export const dynamic = "force-dynamic";

export default async function AdminSuppliersPage() {
  const viewer = await getViewer();
  // A shift restocks, so a shift needs the list — and the phone number is
  // most useful to whoever is standing at the empty shelf, which is rarely
  // the owner. Curating it stays with the owner and a manager.
  if (!can(viewer, "stock.view")) {
    return <NotAllowed>The supplier list is for the people who do the buying.</NotAllowed>;
  }

  const { rows, error } = await listSuppliers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className={hqTitle}>Suppliers</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Who you buy from, how to reach them, and what you get there. Once
          somebody is on this list, recording a delivery is a tap instead of
          typing their name again — which is how one supplier ended up spelled
          three ways.
        </p>
      </div>

      <SupplierList
        rows={rows}
        canEdit={can(viewer, "business")}
        error={error}
      />
    </div>
  );
}
