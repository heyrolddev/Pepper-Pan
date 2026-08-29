import { createClient } from "@/lib/supabase/server";
import { AdminInbox, type InboxThread } from "@/components/admin-inbox";
import { ChatSettingsForm } from "@/components/chat-settings-form";
import { assistantConfigured } from "@/lib/assistant";

type ThreadRow = {
  id: string;
  customer_id: string | null;
  channel: string;
  contact_name: string | null;
  contact_phone: string | null;
  needs_human: boolean;
  handled: boolean;
  last_message_at: string;
  created_at: string;
};

type MessageRow = {
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export default async function AdminInboxPage() {
  const supabase = await createClient();

  const [threadsRes, settingsRes] = await Promise.all([
    supabase
      .from("chat_threads")
      .select(
        "id, customer_id, channel, contact_name, contact_phone, needs_human, handled, last_message_at, created_at"
      )
      .order("last_message_at", { ascending: false })
      .limit(200),
    supabase.from("chat_settings").select("messenger_url, page_id").eq("id", 1).maybeSingle(),
  ]);

  // Before migration 0011 the tables don't exist; say so rather than 500.
  if (threadsRes.error) {
    return (
      <div className="rounded-3xl bg-gold-50 p-8 ring-1 ring-gold-400/40">
        <h2 className="font-display text-2xl font-black text-ink-950">Inbox</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-800/70">
          Run <strong>migration 0011</strong> in the Supabase SQL Editor to
          switch on &ldquo;Ask Pepper Pan&rdquo;. Every chat a customer has with
          the assistant will land here.
        </p>
        <p className="mt-3 rounded-xl bg-cream-50 px-4 py-2 font-mono text-xs text-ink-800/70">
          {threadsRes.error.message}
        </p>
      </div>
    );
  }

  const rows = (threadsRes.data ?? []) as ThreadRow[];
  const ids = rows.map((r) => r.id);

  const { data: msgData } = ids.length
    ? await supabase
        .from("chat_messages")
        .select("thread_id, role, content, created_at")
        .in("thread_id", ids)
        .order("id", { ascending: true })
    : { data: [] as MessageRow[] };

  const byThread = new Map<string, MessageRow[]>();
  for (const m of (msgData ?? []) as MessageRow[]) {
    const list = byThread.get(m.thread_id);
    if (list) list.push(m);
    else byThread.set(m.thread_id, [m]);
  }

  // Name the signed-in customers, so a lead isn't just a random key.
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  const { data: profileData } = customerIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", customerIds)
    : { data: [] as { id: string; full_name: string | null; phone: string | null }[] };

  const profiles = new Map(
    (
      (profileData ?? []) as { id: string; full_name: string | null; phone: string | null }[]
    ).map((p) => [p.id, p])
  );

  const threads: InboxThread[] = rows.map((r) => {
    const profile = r.customer_id ? profiles.get(r.customer_id) : undefined;
    return {
      id: r.id,
      channel: r.channel,
      name: r.contact_name ?? profile?.full_name ?? null,
      phone: r.contact_phone ?? profile?.phone ?? null,
      signedIn: Boolean(r.customer_id),
      needsHuman: r.needs_human,
      handled: r.handled,
      lastMessageAt: r.last_message_at,
      messages: (byThread.get(r.id) ?? []).map((m) => ({
        role: m.role,
        content: m.content,
        at: m.created_at,
      })),
    };
  });

  const waiting = threads.filter((t) => t.needsHuman && !t.handled).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-2xl font-black text-ink-950">Inbox</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-800/60">
          Every &ldquo;Ask Pepper Pan&rdquo; conversation. The assistant answers
          menu, delivery and payment questions on its own, and raises a
          <strong> Needs a reply</strong> flag the moment someone wants a person
          — a complaint, a cancellation, a bulk order, or anything it couldn&apos;t
          answer.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-6 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
            Needs a reply
          </p>
          <p
            className={`font-display text-3xl font-black ${
              waiting > 0 ? "text-brand-600" : "text-ink-950"
            }`}
          >
            {waiting}
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
            Conversations
          </p>
          <p className="font-display text-3xl font-black text-ink-950">{threads.length}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ink-800/55">
            Assistant
          </p>
          <p
            className={`font-display text-lg font-black ${
              assistantConfigured() ? "text-jade-600" : "text-brand-600"
            }`}
          >
            {assistantConfigured() ? "Live" : "Needs API key"}
          </p>
        </div>
      </div>

      {!assistantConfigured() && (
        <p className="rounded-2xl bg-gold-50 px-5 py-3 text-sm text-ink-800 ring-1 ring-gold-400/40">
          Add <code className="font-mono text-xs">ANTHROPIC_API_KEY</code> to your
          Vercel environment variables to switch the assistant on. Until then the
          chat still opens, but it points people straight at you instead of
          answering.
        </p>
      )}

      <ChatSettingsForm
        initial={{
          messengerUrl: settingsRes.data?.messenger_url ?? "",
          pageId: settingsRes.data?.page_id ?? "",
        }}
      />

      <AdminInbox threads={threads} />
    </div>
  );
}
