"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  sendChatMessage,
  saveChatContact,
  fetchChatMessages,
} from "@/app/ask/actions";

type Msg = { id?: number; role: "user" | "assistant" | "staff"; content: string };

/** How often an open chat asks for anything new. Closed chats never poll. */
const POLL_MS = 4000;

const GUEST_KEY = "pepperpan_chat_key";

// Mostly English, with one Taglish opener kept on purpose: it is the quickest
// way to show a customer that asking in Filipino will work too.
const OPENERS = [
  "What's your bestseller?",
  "What time do you open?",
  "Magkano ang delivery sa Apalit?",
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
  const [takenOver, setTakenOver] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const keyRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  // Highest message id already on screen, so a poll only asks for what's new.
  const lastIdRef = useRef(0);

  useEffect(() => {
    keyRef.current = readGuestKey();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  // Live updates while the panel is open: the owner can join the conversation
  // from HQ, and their reply should appear here without the visitor
  // refreshing. Polling stops the moment the panel closes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function pull() {
      if (!keyRef.current) return;
      const res = await fetchChatMessages({
        guestKey: keyRef.current,
        sinceId: lastIdRef.current,
      });
      if (cancelled) return;

      setTakenOver(res.takenOver);
      if (res.messages.length === 0) return;

      setMsgs((current) => {
        // Our own optimistic turns have no id yet; anything the server
        // returns is authoritative, so drop the local echo of it.
        const seen = new Set(
          current.map((m) => (m.id ? `#${m.id}` : `${m.role}:${m.content}`))
        );
        const fresh = res.messages.filter(
          (m) => !seen.has(`#${m.id}`) && !seen.has(`${m.role}:${m.content}`)
        );
        return fresh.length === 0 ? current : [...current, ...fresh];
      });

      lastIdRef.current = Math.max(
        lastIdRef.current,
        ...res.messages.map((m) => m.id)
      );
    }

    void pull();
    let timer = setInterval(pull, POLL_MS);

    // A chat left open in a background tab shouldn't keep asking. Polling
    // pauses when the tab is hidden and catches up the moment it's back —
    // which is also the only moment the visitor could see a new message.
    function onVisibility() {
      clearInterval(timer);
      if (document.visibilityState === "visible") {
        void pull();
        timer = setInterval(pull, POLL_MS);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [open]);

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
      if (res.reply) {
        setMsgs((m) => [...m, { role: "assistant", content: res.reply }]);
      } else {
        // The owner has taken this conversation over, so nothing auto-replied.
        setTakenOver(true);
      }
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
      {/* Launcher — offset above the floating cart so the two never overlap.

          A circle at every width now, not just on a phone. The pill was wide
          enough to sit over whatever was behind it, and on the homepage that
          is the carousel controls; on a laptop it covered the "next" arrow,
          which is exactly where a mouse goes. A round button covers almost
          nothing and is still the most recognisable shape on a page for
          "talk to someone".

          The name is not lost: `aria-label` carries it for a screen reader,
          and the tooltip below shows it on hover for anyone who wonders.

          The ring is what makes it noticeable without it being loud — a slow
          pulse that reads as *live*, the way a lit sign does. It is one
          element behind the button rather than an animation on the button
          itself, so nothing under the pointer moves: a target that grows and
          shrinks is a target that is harder to hit. Reduced motion stops it,
          and what remains is a plain gold ring. */}
      <div className="group fixed bottom-24 right-4 z-40 sm:bottom-6">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-gold-400/40 motion-safe:animate-ping"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-gold-400/30"
        />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Ask Pepper Pan"
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-ink-950 text-cream-50 shadow-2xl shadow-ink-950/40 ring-2 ring-gold-400/60 transition-transform hover:scale-105"
        >
          <span className="text-2xl">💬</span>
        </button>

        {/* The name, on hover, for a pointer. Hidden from screen readers
            because the button's own label already says it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 whitespace-nowrap rounded-full bg-ink-950 px-3 py-1.5 text-sm font-bold text-cream-50 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 sm:block"
        >
          Ask Pepper Pan
        </span>
      </div>

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
                  <li key={m.id ?? `local-${i}`} className="flex flex-col">
                    {m.role === "staff" && (
                      <span className="mb-1 self-start rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-950">
                        Pepper Pan · owner
                      </span>
                    )}
                    <span
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.role === "user"
                          ? "self-end bg-brand-600 text-cream-50"
                          : m.role === "staff"
                            ? "self-start bg-ink-950 text-cream-100 ring-2 ring-gold-400/50"
                            : "self-start bg-cream-100 text-ink-800"
                      }`}
                    >
                      {m.content}
                    </span>
                  </li>
                ))}
                {takenOver && !busy && (
                  <li className="self-center rounded-full bg-gold-50 px-3 py-1 text-[11px] font-semibold text-ink-800/70 ring-1 ring-gold-400/40">
                    You&apos;re talking to the owner now
                  </li>
                )}
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
