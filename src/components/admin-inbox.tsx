"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { setThreadHandled } from "@/app/admin/inbox/actions";
import { formatDateTime } from "@/lib/format-date";
import { AdminSearch } from "@/components/admin-search";

export type InboxMessage = {
  role: "user" | "assistant";
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
  lastMessageAt: string;
  messages: InboxMessage[];
};

type Filter = "waiting" | "all" | "handled";

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
            <p className="rounded-3xl bg-cream-100 px-6 py-10 text-center text-sm text-ink-800/60 ring-1 ring-ink-950/10">
              {filter === "waiting"
                ? "Nothing waiting on you. 🎉"
                : "No conversations here yet."}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((t) => {
                const open = openId === t.id;
                const lastUser = [...t.messages]
                  .reverse()
                  .find((m) => m.role === "user");
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
                      onClick={() => setOpenId(open ? null : t.id)}
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

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
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
                          {t.phone && (
                            <a
                              href={`sms:${t.phone.replace(/\s/g, "")}`}
                              className="rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50"
                            >
                              Text them
                            </a>
                          )}
                        </div>
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
