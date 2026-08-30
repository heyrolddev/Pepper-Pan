"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  setThreadHandled,
  replyToThread,
  teachAnswer,
} from "@/app/admin/inbox/actions";
import { useChatRealtime } from "@/lib/use-chat-realtime";
import { deriveTriggers, GAVE_UP } from "@/lib/faq";
import { formatDateTime } from "@/lib/format-date";
import { AdminSearch } from "@/components/admin-search";
import { ChatSteam, EmptyState } from "@/components/spot-art";

export type InboxMessage = {
  role: "user" | "assistant" | "staff";
  content: string;
  at: string;
};

export type InboxThread = {
  id: string;
  channel: string;
  name: string | null;
  phone: string | null;
  signedIn: boolean;
  needsHuman: boolean;
  handled: boolean;
  takenOver: boolean;
  lastMessageAt: string;
  messages: InboxMessage[];
};

type Filter = "waiting" | "all" | "handled";

/**
 * The customer message worth turning into an answer.
 *
 * The last thing someone types is usually "salamat po" — the question that
 * actually stumped the assistant is the one right before it gave up. Falling
 * back to the longest message beats falling back to the newest, since a real
 * question carries more words than a sign-off.
 */
function questionToTeach(messages: InboxMessage[]): InboxMessage | null {
  for (let i = messages.length - 1; i > 0; i--) {
    const m = messages[i];
    if (
      m.role === "assistant" &&
      GAVE_UP.some((phrase) => m.content.toLowerCase().includes(phrase)) &&
      messages[i - 1]?.role === "user"
    ) {
      return messages[i - 1];
    }
  }

  const asked = messages.filter((m) => m.role === "user");
  if (asked.length === 0) return null;
  return asked.reduce((best, m) => (m.content.length > best.content.length ? m : best));
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "waiting", label: "Needs a reply" },
  { key: "all", label: "All" },
  { key: "handled", label: "Handled" },
];

export function AdminInbox({ threads }: { threads: InboxThread[] }) {
  const [filter, setFilter] = useState<Filter>("waiting");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [teaching, setTeaching] = useState<string | null>(null);

  // The inbox refreshes itself as customers type — staff can read every row,
  // so Supabase Realtime carries this side without any polling.
  const { connected } = useChatRealtime();

  const inFilter = useMemo(
    () =>
      threads.filter((t) => {
        if (filter === "waiting") return t.needsHuman && !t.handled;
        if (filter === "handled") return t.handled;
        return true;
      }),
    [threads, filter],
  );

  // A conversation is findable by who it's from and by anything said in it —
  // "0947 lechon" should surface the thread where someone asked about a tray.
  const searchText = useCallback(
    (t: InboxThread) =>
      [t.name ?? "", t.phone ?? "", ...t.messages.map((m) => m.content)].join(
        " ",
      ),
    [],
  );

  async function send(thread: InboxThread) {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    const res = await replyToThread(thread.id, text);
    setSending(false);
    if (res.error) return setError(res.error);
    setDraft("");
  }

  function toggle(thread: InboxThread) {
    setError(null);
    startTransition(async () => {
      const res = await setThreadHandled(thread.id, !thread.handled);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const count =
              f.key === "waiting"
                ? threads.filter((t) => t.needsHuman && !t.handled).length
                : f.key === "handled"
                  ? threads.filter((t) => t.handled).length
                  : threads.length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                  filter === f.key
                    ? "bg-ink-950 text-cream-50"
                    : "bg-cream-100 text-ink-800 ring-1 ring-ink-950/10 hover:bg-cream-200"
                }`}
              >
                {f.label}
                <span className="ml-1.5 opacity-60">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Stated rather than implied: if the socket dropped, the shop should
            know the list is no longer updating itself. */}
        <span
          className={`ml-auto flex items-center gap-1.5 text-xs font-bold ${
            connected ? "text-jade-700" : "text-ink-800/40"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-jade-600" : "bg-ink-800/30"
            }`}
          />
          {connected ? "Live" : "Reconnecting…"}
        </span>
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      <AdminSearch
        rows={inFilter}
        searchText={searchText}
        placeholder="Search names, numbers, messages…"
        noun="conversation"
      >
        {(shown) =>
          shown.length === 0 ? (
            <EmptyState
              art={<ChatSteam className="h-full w-full" />}
              title={
                filter === "waiting" ? "Nothing waiting on you" : "No conversations yet"
              }
            >
              {filter === "waiting"
                ? "Every customer who needed a person has had one. Nice."
                : "When someone asks Pepper Pan something, it lands here."}
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((t) => {
                const open = openId === t.id;
                const lastUser = [...t.messages]
                  .reverse()
                  .find((m) => m.role === "user");
                // The question worth teaching is the one the assistant
                // fumbled — not "salamat po", which is usually what came
                // last. Fall back to the longest thing they said.
                const stumper = questionToTeach(t.messages) ?? lastUser;
                return (
                  <li
                    key={t.id}
                    className={`overflow-hidden rounded-3xl bg-cream-50 ring-1 transition-shadow ${
                      t.needsHuman && !t.handled
                        ? "ring-2 ring-brand-600/40"
                        : "ring-ink-950/10"
                    }`}
                  >
                    <button
                      onClick={() => {
                        setOpenId(open ? null : t.id);
                        setDraft("");
                        setTeaching(null);
                      }}
                      className="flex w-full items-start gap-4 px-5 py-4 text-left"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink-950 text-sm font-black text-gold-400">
                        {(t.name ?? "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-ink-950">
                            {t.name ?? (t.signedIn ? "Customer" : "Guest")}
                          </span>
                          {t.phone && (
                            <a
                              href={`tel:${t.phone.replace(/\s/g, "")}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs font-bold text-brand-600 hover:underline"
                            >
                              {t.phone}
                            </a>
                          )}
                          {t.channel === "messenger" && (
                            <span className="rounded-full bg-[#0084ff]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0084ff]">
                              Messenger
                            </span>
                          )}
                          {t.needsHuman && !t.handled && (
                            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cream-50">
                              Needs a reply
                            </span>
                          )}
                          {t.handled && (
                            <span className="rounded-full bg-jade-600/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-jade-700">
                              Handled
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-ink-800/70">
                          {lastUser?.content ?? "No messages yet"}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-800/45">
                          {formatDateTime(t.lastMessageAt)} ·{" "}
                          {t.messages.length} messages
                        </span>
                      </span>
                      <span className="shrink-0 text-ink-800/40">
                        {open ? "▲" : "▼"}
                      </span>
                    </button>

                    {open && (
                      <div className="border-t border-ink-950/10 bg-cream-100 px-5 py-4">
                        <ul className="flex flex-col gap-2">
                          {t.messages.map((m, i) => (
                            <li
                              key={i}
                              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                                m.role === "user"
                                  ? "self-start bg-cream-50 text-ink-900 ring-1 ring-ink-950/10"
                                  : "self-end bg-ink-950 text-cream-100"
                              }`}
                            >
                              {m.content}
                              <span className="mt-1 block text-[10px] opacity-50">
                                {m.role === "user" ? "Customer" : "Assistant"} ·{" "}
                                {formatDateTime(m.at)}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {/* Replying takes the conversation over: from the
                            first reply on, the automatic answers stop on this
                            thread so nothing talks over you mid-sentence. */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void send(t);
                          }}
                          className="mt-4 flex flex-col gap-2"
                        >
                          <div className="flex items-end gap-2">
                            <textarea
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              rows={2}
                              maxLength={2000}
                              placeholder={
                                t.takenOver
                                  ? "Reply to the customer…"
                                  : "Reply and take this conversation over…"
                              }
                              className="flex-1 resize-none rounded-2xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2.5 text-sm outline-none focus:border-brand-600"
                            />
                            <button
                              type="submit"
                              disabled={sending || !draft.trim()}
                              className="shrink-0 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 disabled:opacity-50"
                            >
                              {sending ? "Sending…" : "Send"}
                            </button>
                          </div>
                          {!t.takenOver && (
                            <p className="text-[11px] text-ink-800/55">
                              Replying stops the automatic answers on this
                              conversation — from here it&apos;s you talking.
                            </p>
                          )}
                        </form>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggle(t)}
                            disabled={pending}
                            className={`rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${
                              t.handled
                                ? "bg-cream-50 text-ink-800 ring-1 ring-ink-950/15"
                                : "bg-jade-600 text-cream-50"
                            }`}
                          >
                            {t.handled ? "Re-open" : "Mark handled"}
                          </button>
                          {lastUser && (
                            <button
                              type="button"
                              onClick={() =>
                                setTeaching(teaching === t.id ? null : t.id)
                              }
                              className={`rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                                teaching === t.id
                                  ? "bg-ink-950 text-gold-400"
                                  : "bg-gold-400 text-ink-950"
                              }`}
                            >
                              Teach this answer
                            </button>
                          )}
                          {t.phone && (
                            <a
                              href={`sms:${t.phone.replace(/\s/g, "")}`}
                              className="rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50"
                            >
                              Text them
                            </a>
                          )}
                        </div>

                        {teaching === t.id && lastUser && (
                          <TeachPanel
                            question={(stumper ?? lastUser).content}
                            threadId={t.id}
                            onDone={() => setTeaching(null)}
                            onError={setError}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        }
      </AdminSearch>
    </div>
  );
}

/**
 * "Ask Pepper Pan got this wrong — here's the right answer."
 *
 * Pre-filled with what the customer actually typed, because the fastest way
 * to a good answer is the real question. Triggers are derived from it and
 * shown before saving, so the owner can see what will reach this answer
 * without learning any pattern syntax.
 */
function TeachPanel({
  question,
  threadId,
  onDone,
  onError,
}: {
  question: string;
  threadId: string;
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [q, setQ] = useState(question);
  const [answer, setAnswer] = useState("");
  const [triggers, setTriggers] = useState(question);
  const [busy, setBusy] = useState(false);

  const preview = deriveTriggers(triggers || q);

  async function save() {
    setBusy(true);
    const res = await teachAnswer({ question: q, answer, triggers, threadId });
    setBusy(false);
    if (res.error) return onError(res.error);
    onDone();
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-gold-50 p-4 ring-1 ring-gold-400/50">
      <p className="text-sm font-bold text-ink-950">
        Teach Ask Pepper Pan this answer
      </p>
      <p className="-mt-2 text-xs text-ink-800/65">
        Saved once, given every time from now on — including to this customer&apos;s
        next question.
      </p>

      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-ink-800">
        The question
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-brand-600"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-ink-800">
        Your answer
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={3}
          placeholder="Type it the way you'd say it to them."
          className="resize-none rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-brand-600"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-widest text-ink-800">
        Words that should reach it
        <input
          value={triggers}
          onChange={(e) => setTriggers(e.target.value)}
          placeholder="parking, paradahan"
          className="rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-brand-600"
        />
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-ink-800/55">
          Will trigger on:
        </span>
        {preview.length === 0 ? (
          <span className="text-[11px] font-semibold text-brand-700">
            nothing yet — add a word
          </span>
        ) : (
          preview.map((t) => (
            <span
              key={t}
              className="rounded-full bg-ink-950 px-2 py-0.5 font-mono text-[10px] font-bold text-gold-400"
            >
              {t}
            </span>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !answer.trim() || preview.length === 0}
          className="rounded-full bg-brand-600 px-5 py-2 text-xs font-bold text-cream-50 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save answer"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full px-4 py-2 text-xs font-bold text-ink-800 hover:text-brand-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
