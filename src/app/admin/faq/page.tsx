import { createClient } from "@/lib/supabase/server";
import { FaqEditor, type FaqRow } from "@/components/faq-editor";
import { GAVE_UP, groupUnanswered, type Unanswered } from "@/lib/faq";
import { hqTitle } from "@/lib/hq-theme";

export default async function AdminFaqPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("faq_entries")
    .select("id, question, answer, triggers, is_active, hits, priority, updated_at")
    .order("priority", { ascending: false })
    .order("hits", { ascending: false })
    .limit(300);

  if (error) {
    return (
      <div className="rounded-3xl bg-gold-50 p-8 ring-1 ring-gold-400/40">
        <h2 className={hqTitle}>Answers</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Run <strong>migration 0012</strong> in the Supabase SQL Editor to switch
          this on. It lets you add or correct any answer Ask Pepper Pan gives.
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
          one it gets wrong.
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
