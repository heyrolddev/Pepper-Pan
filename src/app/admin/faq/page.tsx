import { createClient } from "@/lib/supabase/server";
import { can, getViewer } from "@/lib/auth";
import { FaqEditor, type FaqRow } from "@/components/faq-editor";
import { GAVE_UP, groupUnanswered, type Unanswered } from "@/lib/faq";
import { hqTitle } from "@/lib/hq-theme";

export default async function AdminFaqPage() {
  // "faq", not "chat". Since migration 0026 these answers are also printed on
  // the homepage, which puts them with promos rather than with replying to
  // one customer in the inbox.
  const viewer = await getViewer();
  if (!can(viewer, "faq")) {
    return (
      <div className="rounded-3xl bg-cream-100 p-8 ring-1 ring-ink-950/10">
        <h2 className={hqTitle}>Owner and manager only</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          These are the answers the shop gives every customer, and five of them
          are printed on the homepage — so they are kept to the people who
          answer for them. Replying to somebody in the Inbox is unaffected.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("faq_entries")
    .select("id, question, answer, triggers, is_active, hits, priority, updated_at, show_on_site, site_order")
    .order("priority", { ascending: false })
    .order("hits", { ascending: false })
    .limit(300);

  if (error) {
    return (
      <div className="rounded-3xl bg-gold-50 p-8 ring-1 ring-gold-400/40">
        <h2 className={hqTitle}>Answers</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Run <strong>migrations 0012 and 0026</strong> in the Supabase SQL
          Editor to switch this on. They let you add or correct any answer Ask
          Pepper Pan gives — and choose which of them the homepage prints.
        </p>
        <p className="mt-3 rounded-xl bg-cream-50 px-4 py-2 font-mono text-xs text-ink-800/70">
          {error.message}
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as FaqRow[];

  // What people asked that nothing could answer. Read in thread order so a
  // question can be paired with the reply it drew.
  const { data: msgData } = await supabase
    .from("chat_messages")
    .select("thread_id, role, content")
    .order("id", { ascending: true })
    .limit(1000);

  const byThread = new Map<string, { role: string; content: string }[]>();
  for (const m of (msgData ?? []) as {
    thread_id: string;
    role: string;
    content: string;
  }[]) {
    const list = byThread.get(m.thread_id);
    if (list) list.push(m);
    else byThread.set(m.thread_id, [m]);
  }

  const stumpers: string[] = [];
  for (const messages of byThread.values()) {
    for (let i = 1; i < messages.length; i++) {
      const reply = messages[i];
      const asked = messages[i - 1];
      if (
        reply.role === "assistant" &&
        asked.role === "user" &&
        GAVE_UP.some((phrase) => reply.content.toLowerCase().includes(phrase))
      ) {
        stumpers.push(asked.content);
      }
    }
  }

  // Anything already covered by a live answer isn't a gap any more.
  const covered = new Set(
    rows.filter((r) => r.is_active).flatMap((r) => r.triggers)
  );
  const gaps: Unanswered[] = groupUnanswered(stumpers).filter(
    (g) => !covered.has(g.topic)
  );
  const live = rows.filter((r) => r.is_active).length;
  const used = rows.reduce((sum, r) => sum + (r.hits ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className={hqTitle}>Answers</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Anything you write here, Ask Pepper Pan says word for word — and it
          says it <strong>before</strong> its own built-in answers. So this is
          both how you add a question it doesn&apos;t know, and how you correct
          one it gets wrong. Tick <strong>Show on the homepage</strong> on an
          answer and it is also printed in the FAQ at the bottom of the
          homepage — one answer, two places, so they can never disagree.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
            Live answers
          </p>
          <p className="font-display text-3xl font-black text-ink-950">{live}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
            Times used
          </p>
          <p className="font-display text-3xl font-black text-ink-950">{used}</p>
        </div>
        <p className="min-w-48 flex-1 text-sm text-ink-800/60">
          An answer with zero uses after a few weeks usually means its trigger
          words are wrong — not that nobody asks.
        </p>
      </div>

      <FaqEditor rows={rows} gaps={gaps} />
    </div>
  );
}
