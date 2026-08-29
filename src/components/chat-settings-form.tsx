"use client";

import { useState, type FormEvent } from "react";
import { saveChatSettings } from "@/app/admin/inbox/actions";

export function ChatSettingsForm({
  initial,
}: {
  initial: { messengerUrl: string; pageId: string };
}) {
  const [open, setOpen] = useState(false);
  const [messengerUrl, setMessengerUrl] = useState(initial.messengerUrl);
  const [pageId, setPageId] = useState(initial.pageId);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await saveChatSettings({ messengerUrl, pageId });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block font-bold text-ink-950">Messenger link</span>
          <span className="block text-xs text-ink-800/60">
            {initial.messengerUrl
              ? initial.messengerUrl
              : "Not set — visitors who need a person only get the phone number."}
          </span>
        </span>
        <span className="shrink-0 text-ink-800/40">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-widest text-ink-800">
            Messenger link
            <input
              value={messengerUrl}
              onChange={(e) => setMessengerUrl(e.target.value)}
              placeholder="https://m.me/yourpage"
              className="rounded-2xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2.5 text-sm font-normal outline-none focus:border-brand-600"
            />
            <span className="text-[11px] font-medium normal-case tracking-normal text-ink-800/55">
              Shown as &ldquo;Chat on Messenger&rdquo; whenever the assistant
              hands someone over to you.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-bold uppercase tracking-widest text-ink-800">
            Facebook Page ID
            <input
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="Optional — only needed for auto-replies on Messenger"
              className="rounded-2xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2.5 text-sm font-normal outline-none focus:border-brand-600"
            />
            <span className="text-[11px] font-medium normal-case tracking-normal text-ink-800/55">
              Auto-replies on Facebook also need a Meta app with{" "}
              <code className="font-mono">MESSENGER_PAGE_TOKEN</code> and{" "}
              <code className="font-mono">MESSENGER_VERIFY_TOKEN</code> set in
              Vercel.
            </span>
          </label>

          {error && (
            <p className="rounded-2xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`self-start rounded-full px-6 py-2.5 text-sm font-bold transition-colors disabled:opacity-60 ${
              saved ? "bg-jade-600 text-cream-50" : "bg-brand-600 text-cream-50"
            }`}
          >
            {busy ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </form>
      )}
    </div>
  );
}
