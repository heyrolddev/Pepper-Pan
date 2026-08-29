"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { sendChatMessage, saveChatContact } from "@/app/ask/actions";

type Msg = { role: "user" | "assistant"; content: string };

const GUEST_KEY = "pepperpan_chat_key";

const OPENERS = [
  "What's your bestseller?",
  "Magkano ang delivery sa Apalit?",
  "Anong oras kayo bukas?",
];

/** A stable per-browser key so a visitor keeps their own thread. */
function readGuestKey(): string {
  try {
    const existing = localStorage.getItem(GUEST_KEY);
    if (existing && /^[a-z0-9-]{8,64}$/i.test(existing)) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(GUEST_KEY, fresh);
    return fresh;
  } catch {
    // Private mode with storage blocked: the thread just won't persist.
    return crypto.randomUUID();
  }
}

export function AskWidget({ messengerUrl }: { messengerUrl: string | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsHuman, setNeedsHuman] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const keyRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    keyRef.current = readGuestKey();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  // The admin surface is the shop's own workspace — the customer chat has no
  // place on it, and it would sit under the floating cart anyway.
  if (pathname.startsWith("/admin")) return null;

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    setMsgs((m) => [...m, { role: "user", content: message }]);
    setDraft("");
    setBusy(true);
    setError(null);

    try {
      const res = await sendChatMessage({ guestKey: keyRef.current, message });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMsgs((m) => [...m, { role: "assistant", content: res.reply }]);
      if (res.needsHuman) setNeedsHuman(true);
    } catch {
      setError("Couldn't send that. Please try again, or message us on Facebook.");
    } finally {
      setBusy(false);
    }
  }

  async function submitContact() {
    setBusy(true);
    setError(null);
    try {
      const res = await saveChatContact({ guestKey: keyRef.current, name, phone });
      if (res.error) return setError(res.error);
      setContactSent(true);
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher — offset above the floating cart so the two never overlap. */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Ask Pepper Pan"
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-ink-950 py-3 pl-4 pr-5 font-bold text-cream-50 shadow-2xl shadow-ink-950/40 ring-2 ring-gold-400/50 transition-transform hover:scale-105 sm:bottom-6"
      >
        <span className="text-lg">💬</span>
        <span className="text-sm">Ask Pepper Pan</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="fixed inset-x-3 bottom-3 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-3xl bg-cream-50 shadow-2xl shadow-ink-950/50 ring-1 ring-ink-950/15 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-96"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 bg-ink-950 px-5 py-4 text-cream-50">
              <div>
                <p className="font-display font-black">Ask Pepper Pan</p>
                <p className="text-[11px] text-cream-100/60">
                  Menu, prices, delivery — instant answers
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-full px-2 text-cream-100/60 transition-colors hover:text-cream-50"
              >
                ✕
              </button>
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
              {msgs.length === 0 && (
                <div className="flex flex-col gap-3">
                  <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm text-ink-800">
                    Kumusta! 🧡 Ask me anything about the menu, delivery or
                    payment — I&apos;ll answer right away.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {OPENERS.map((o) => (
                      <button
                        key={o}
                        onClick={() => send(o)}
                        className="rounded-full bg-cream-100 px-3 py-1.5 text-xs font-semibold text-ink-800 ring-1 ring-ink-950/10 transition-colors hover:bg-brand-600 hover:text-cream-50"
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <ul className="flex flex-col gap-3">
                {msgs.map((m, i) => (
                  <li
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === "user"
                        ? "self-end bg-brand-600 text-cream-50"
                        : "self-start bg-cream-100 text-ink-800"
                    }`}
                  >
                    {m.content}
                  </li>
                ))}
                {busy && (
                  <li className="self-start rounded-2xl bg-cream-100 px-4 py-2.5 text-sm text-ink-800/60">
                    <span className="inline-flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                          className="text-lg leading-none"
                        >
                          ·
                        </motion.span>
                      ))}
                    </span>
                  </li>
                )}
              </ul>

              {/* When the assistant can't help, collect a callback rather than
                  leaving the person at a dead end. */}
              {needsHuman && !contactSent && (
                <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-gold-50 p-4 ring-1 ring-gold-400/50">
                  <p className="text-sm font-bold text-ink-950">
                    Want the owner to reply?
                  </p>
                  <p className="-mt-1 text-xs text-ink-800/70">
                    Leave your name and number and we&apos;ll get back to you.
                  </p>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm outline-none focus:border-brand-600"
                  />
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="09XX XXX XXXX"
                    className="rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm outline-none focus:border-brand-600"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={submitContact}
                      disabled={busy}
                      className="rounded-full bg-brand-600 px-4 py-2 text-xs font-bold text-cream-50 disabled:opacity-60"
                    >
                      Send to the owner
                    </button>
                    {messengerUrl && (
                      <a
                        href={messengerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50"
                      >
                        Chat on Messenger ↗
                      </a>
                    )}
                  </div>
                </div>
              )}

              {contactSent && (
                <p className="mt-4 rounded-2xl bg-jade-50 px-4 py-3 text-sm font-semibold text-jade-700 ring-1 ring-jade-600/40">
                  ✓ Sent! The owner will message you shortly.
                </p>
              )}

              {error && (
                <p className="mt-3 rounded-xl bg-brand-50 px-4 py-2 text-xs font-semibold text-brand-700">
                  {error}
                </p>
              )}
            </div>

            {/* Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(draft);
              }}
              className="flex items-center gap-2 border-t border-ink-950/10 bg-cream-100 p-3"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type your question…"
                maxLength={1000}
                className="flex-1 rounded-full border-2 border-ink-950/15 bg-cream-50 px-4 py-2.5 text-sm outline-none focus:border-brand-600"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="shrink-0 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-bold text-cream-50 disabled:opacity-50"
              >
                Send
              </button>
            </form>

            <p className="bg-cream-100 px-4 pb-3 text-center text-[10px] text-ink-800/45">
              Automated replies — the owner reads every chat and follows up.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
