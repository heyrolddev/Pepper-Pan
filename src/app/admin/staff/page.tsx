import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { shiftLength } from "@/lib/shifts-server";
import { StaffView, type Person, type ShiftReport } from "@/components/staff-view";

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
  if (viewer?.profile?.role !== "owner") {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className="font-display text-2xl font-black text-ink-950">Owner only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Who works here, what hours they kept and what they rang up is the
          owner&apos;s to see.
        </p>
      </div>
    );
  }

  const supabase = createAdminClient();
  const [{ data: profiles }, { data: shifts }, { data: log }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, role, created_at")
      .in("role", ["owner", "staff", "customer"])
      .order("created_at", { ascending: false }),
    supabase
      .from("staff_shifts")
      .select("id, staff_id, started_at, ended_at, closing_cash, note")
      .order("started_at", { ascending: false })
      .limit(60),
    supabase
      .from("activity_log")
      .select("id, at, category, description, actor")
      .order("at", { ascending: false })
      .limit(400),
  ]);

  const shiftRows = (shifts ?? []) as {
    id: string;
    staff_id: string;
    started_at: string;
    ended_at: string | null;
    closing_cash: number | null;
    note: string | null;
  }[];

  // Every sale that belongs to one of these shifts, in one query rather than
  // one per shift.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, shift_id, revenue, status, payment_method")
    .in("shift_id", shiftRows.map((s) => s.id).length ? shiftRows.map((s) => s.id) : ["none"]);

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
      note: s.note,
      sales: sales.count,
      takings: sales.total,
      cashExpected: sales.cash,
      actions: during.map((l) => ({
        at: l.at,
        category: l.category ?? "",
        description: l.description,
      })),
    };
  });

  const people: Person[] = ((profiles ?? []) as ProfileRow[])
    .filter((p) => p.role !== "customer" || logRows.some((l) => l.actor === p.id))
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

  return (
    <StaffView
      people={people}
      candidates={candidates}
      reports={reports}
      ownerId={viewer.profile?.id ?? ""}
    />
  );
}
