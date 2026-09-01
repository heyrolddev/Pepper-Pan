import { can, getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { countRows } from "@/lib/backup";
import { runHealthCheck } from "@/lib/inventory-insight";
import { BackupPanel, type BackupFile } from "@/components/backup-panel";

// Row counts and the last-backup date are the two things this page exists to
// report. Both are worthless cached.
export const dynamic = "force-dynamic";

/**
 * How the files are described to the person downloading them.
 *
 * Every line answers the same question — "if I click this, what do I get, and
 * when would I want it?" — because a backup screen full of unexplained
 * filenames gets used once and never again.
 */
const FILES: BackupFile[] = [
  {
    kind: "orders.csv",
    label: "Sales",
    what: "Every order with its total, how it was paid, and who placed it.",
    when: "Hand this to an accountant, or add up a month in Sheets.",
    tables: ["orders"],
  },
  {
    kind: "order-lines.csv",
    label: "What sold",
    what: "One row per dish sold, with quantity and price.",
    when: "Work out your best sellers, or what to prep more of.",
    tables: ["order_lines"],
  },
  {
    kind: "customers.csv",
    label: "Customers",
    what: "Names, numbers, addresses, and what each one has spent.",
    when: "For your own records. Keep it private — this is personal data.",
    tables: ["profiles"],
    sensitive: true,
  },
  {
    kind: "dish-costs.csv",
    label: "Dish costs",
    what: "Price, ingredient cost, profit and food cost % for every dish.",
    when: "Deciding what to reprice, push, or take off the menu.",
    tables: ["meals", "meal_ingredients"],
  },
  {
    kind: "inventory.csv",
    label: "Inventory",
    what: "Every ingredient, what it costs, and how much is left.",
    when: "Stock-taking, or working out how much money is sitting in the store room.",
    tables: ["ingredients"],
  },
  {
    kind: "recipes.csv",
    label: "Recipes",
    what: "Every dish and batch broken down into what goes into it.",
    when: "The hardest thing here to rebuild from memory. Keep a copy.",
    tables: ["meal_ingredients", "batch_ingredients"],
  },
];

export default async function AdminBackupPage() {
  const viewer = await getViewer();

  // Same gate as the download route, said out loud. Staff run the shop; the
  // shop's entire history leaving the building is the owner's call.
  if (!can(viewer, "settings")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className="font-display text-2xl font-black text-ink-950">Owner only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Downloading a copy of the shop&apos;s records — including every
          customer&apos;s name, number and address — is the owner&apos;s
          decision alone.
        </p>
      </div>
    );
  }

  const supabase = createAdminClient();
  const [counts, { data: settings }, health] = await Promise.all([
    countRows(),
    supabase.from("settings").select("last_backup_date").eq("id", 1).maybeSingle(),
    // Checked here rather than on its own screen: this is already the page
    // about whether the data is sound, and a health check nobody visits is a
    // health check that never runs.
    runHealthCheck(),
  ]);

  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const broken = counts.filter((c) => c.error);
  const byTable = Object.fromEntries(counts.map((c) => [c.table, c.count]));

  return (
    <BackupPanel
      files={FILES}
      counts={counts}
      byTable={byTable}
      totalRows={total}
      brokenTables={broken.map((b) => b.table)}
      lastBackup={settings?.last_backup_date ?? null}
      health={health}
    />
  );
}
