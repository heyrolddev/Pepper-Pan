import { can, getViewer } from "@/lib/auth";
import { SHOP_ROLES } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { shiftLength } from "@/lib/shifts-server";
import { drawerFor } from "@/lib/drawer";
import { StaffView, type Person, type ShiftReport } from "@/components/staff-view";
import { DeviceRequests, type DeviceEntry } from "@/components/device-requests";
import { listDevices } from "@/lib/devices-server";
import { hqTitle } from "@/lib/hq-theme";

// Who is on shift right now is the first thing this page answers.
export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  created_at: string;
};

export default async function AdminStaffPage() {
  const viewer = await getViewer();
  if (!can(viewer, "staff.manage")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className={hqTitle}>Owner only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Who works here, what hours they kept and what they rang up is the
          owner&apos;s to see.
        </p>
      </div>
    );
  }

  const supabase = createAdminClient();
  const [{ data: profiles }, { data: shifts }, { data: log }, devices] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, role, created_at")
      .in("role", [...SHOP_ROLES, "customer"])
      .order("created_at", { ascending: false }),
    supabase
      .from("staff_shifts")
      .select("id, staff_id, started_at, ended_at, closing_cash, note, auto_closed")
      .order("started_at", { ascending: false })
      .limit(60),
    supabase
      .from("activity_log")
      .select("id, at, category, description, actor")
      .order("at", { ascending: false })
      .limit(400),
    listDevices(),
  ]);

  const shiftRows = (shifts ?? []) as {
    id: string;
    staff_id: string;
    started_at: string;
    ended_at: string | null;
    closing_cash: number | null;
    note: string | null;
    auto_closed: boolean | null;
  }[];

  // Every sale that belongs to one of these shifts, in one query rather than
  // one per shift.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, shift_id, revenue, status, payment_method")
    .in("shift_id", shiftRows.map((s) => s.id).length ? shiftRows.map((s) => s.id) : ["none"]);

  /* Everything that moved the DRAWER, which is not the same as everything
     that was sold.
  
     The shift report used to check the counted cash against cash sales
     alone. A stall cannot trade without barya, so every shift read as over
     by the float; staff buy the gas and the ice out of the drawer, so every
     one of those read as short by the price of the gas. The shop has
     recorded all of it in `cash_ledger` since 0042 — the report simply
     never looked.
  
     Reaching back to the oldest shift on screen, because the window a
     drawer is checked over runs from the last time somebody counted it,
     which may be several shifts ago. */
  const oldestShift = shiftRows.length
    ? shiftRows[shiftRows.length - 1].started_at
    : new Date().toISOString();
  const { data: cashMoves } = await supabase
    .from("cash_ledger")
    .select("id, type, amount, category, note, created_at, source")
    .eq("account", "cash")
    .gte("created_at", oldestShift)
    .order("created_at", { ascending: false })
    .limit(500);

  const salesByShift = new Map<string, { count: number; total: number; cash: number }>();
  for (const o of (orders ?? []) as {
    shift_id: string | null;
    revenue: number;
    status: string;
    payment_method: string;
  }[]) {
    if (!o.shift_id || o.status === "cancelled") continue;
    const cur = salesByShift.get(o.shift_id) ?? { count: 0, total: 0, cash: 0 };
    cur.count += 1;
    cur.total += Number(o.revenue) || 0;
    // Only cash is expected to be in the drawer; GCash never was.
    if (o.payment_method === "cod") cur.cash += Number(o.revenue) || 0;
    salesByShift.set(o.shift_id, cur);
  }

  const logRows = (log ?? []) as {
    id: string;
    at: string;
    category: string | null;
    description: string;
    actor: string | null;
  }[];

  const nameById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p.full_name ?? "Someone"])
  );

  const moves = ((cashMoves ?? []) as {
    type: string;
    amount: number;
    category: string | null;
    note: string | null;
    created_at: string;
    source: string | null;
  }[]).map((m) => ({
    at: m.created_at,
    type: m.type === "out" ? ("out" as const) : ("in" as const),
    amount: Number(m.amount) || 0,
    label: m.category ?? m.note ?? null,
    source: m.source,
  }));

  /* The last time anybody counted the drawer before this shift started.
  
     That count IS the opening figure — a drawer is continuous, and what is
     in it when a shift begins is whatever was there when it was last
     counted. No setting to maintain, and it bootstraps itself: count once,
     and every shift after it can be checked. Null until that first count,
     and null is then reported as "we do not know" rather than as zero. */
  const counted = shiftRows
    .filter((s) => s.closing_cash !== null && s.ended_at !== null)
    .sort((a, b) => (a.ended_at! < b.ended_at! ? 1 : -1));

  const lastCountBefore = (startedAt: string) => {
    const prior = counted.find((s) => s.ended_at! <= startedAt);
    return prior ? { at: prior.ended_at!, amount: Number(prior.closing_cash) } : null;
  };

  const reports: ShiftReport[] = shiftRows.map((s) => {
    const sales = salesByShift.get(s.id) ?? { count: 0, total: 0, cash: 0 };
    const during = logRows.filter(
      (l) =>
        l.actor === s.staff_id &&
        l.at >= s.started_at &&
        (s.ended_at === null || l.at <= s.ended_at)
    );
    return {
      id: s.id,
      staffId: s.staff_id,
      staffName: nameById.get(s.staff_id) ?? "Someone",
      startedAt: s.started_at,
      endedAt: s.ended_at,
      length: shiftLength(s.started_at, s.ended_at),
      closingCash: s.closing_cash === null ? null : Number(s.closing_cash),
      autoClosed: Boolean(s.auto_closed),
      note: s.note,
      sales: sales.count,
      takings: sales.total,
      drawer: drawerFor({
        lastCount: lastCountBefore(s.started_at),
        cashSales: sales.cash,
        /* Sales are added separately, from `orders`, because nothing
           writes them to `cash_ledger` — the ledger holds what was paid
           out of a pot and what was put into one by hand. The `source`
           filter is therefore a no-op today and kept anyway: the day a
           sale does land in the ledger, this sum would count it twice and
           every drawer would read as double. Filtered on `source` rather
           than the category text, which is a label somebody can retype. */
        moves: moves
          .filter(
            (m) =>
              m.at > (lastCountBefore(s.started_at)?.at ?? s.started_at) &&
              (s.ended_at === null || m.at <= s.ended_at) &&
              m.source !== "sale"
          )
          .map((m) => ({ at: m.at, type: m.type, amount: m.amount, label: m.label })),
        counted: s.closing_cash === null ? null : Number(s.closing_cash),
      }),
      actions: during.map((l) => ({
        at: l.at,
        category: l.category ?? "",
        description: l.description,
      })),
    };
  });

  // Who works here *now*. It used to keep anybody with a line in the
  // activity log, which meant standing somebody down left them sitting in
  // The team reading "No access" — a row the owner cannot act on, next to
  // rows they can. Their history is not lost by leaving: their name still
  // resolves in the shift reports below, because that comes from the whole
  // profile list rather than from this one.
  const people: Person[] = ((profiles ?? []) as ProfileRow[])
    .filter((p) => p.role !== "customer")
    .map((p) => ({
      id: p.id,
      name: p.full_name,
      phone: p.phone,
      role: p.role as Person["role"],
      joined: p.created_at,
      onShift: shiftRows.some((s) => s.staff_id === p.id && s.ended_at === null),
      shiftsWorked: shiftRows.filter((s) => s.staff_id === p.id).length,
    }));

  // Everyone else, so the owner can promote someone who has just signed up.
  const candidates: Person[] = ((profiles ?? []) as ProfileRow[])
    .filter((p) => p.role === "customer" && !people.some((x) => x.id === p.id))
    .map((p) => ({
      id: p.id,
      name: p.full_name,
      phone: p.phone,
      role: "customer",
      joined: p.created_at,
      onShift: false,
      shiftsWorked: 0,
    }));

  // Reusing the map built above rather than joining in SQL: the profiles are
  // already loaded, and a device belonging to an account that has since been
  // deleted should still show, so its access can be taken away.
  const deviceEntries: DeviceEntry[] = devices.map((d) => ({
    id: d.id,
    person: nameById.get(d.user_id) ?? "A former account",
    label: d.label ?? "Unknown device",
    status: d.status,
    firstSeen: d.first_seen,
    lastSeen: d.last_seen,
  }));

  return (
    <div className="flex flex-col gap-8">
      <StaffView
        people={people}
        candidates={candidates}
        reports={reports}
        ownerId={viewer?.profile?.id ?? ""}
      />
      <DeviceRequests devices={deviceEntries} />
    </div>
  );
}
