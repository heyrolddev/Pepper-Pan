"use client";

import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { savePaymentSettings, uploadGcashQr } from "@/app/admin/payments/actions";
import type { PaymentSettings } from "@/lib/payments";

const fieldClass =
  "w-full rounded-xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";

function MethodToggle({
  on,
  onToggle,
  title,
  blurb,
}: {
  on: boolean;
  onToggle: () => void;
  title: string;
  blurb: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
      <div className="min-w-0">
        <p className="font-display text-lg font-bold text-ink-950">{title}</p>
        <p className="text-sm text-ink-800/60">{blurb}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
          on
            ? "bg-jade-600 text-cream-50 hover:bg-jade-700"
            : "bg-ink-950/10 text-ink-800 hover:bg-ink-950/20"
        }`}
      >
        {on ? "✓ On" : "Off"}
      </button>
    </div>
  );
}

export function PaymentSettingsForm({ initial }: { initial: PaymentSettings }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [codEnabled, setCodEnabled] = useState(initial.cod_enabled);
  const [gcashEnabled, setGcashEnabled] = useState(initial.gcash_enabled);
  const [gcashName, setGcashName] = useState(initial.gcash_name ?? "");
  const [gcashNumber, setGcashNumber] = useState(initial.gcash_number ?? "");
  const [qrUrl, setQrUrl] = useState(initial.gcash_qr_url);
  const [instructions, setInstructions] = useState(initial.instructions ?? "");

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await savePaymentSettings({
        codEnabled,
        gcashEnabled,
        gcashName,
        gcashNumber,
        instructions,
      });
      if (res.error) return setError(res.error);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save those settings.");
    } finally {
      setBusy(false);
    }
  }

  async function handleQr(file: File) {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const res = await uploadGcashQr(fd);
      if (res.error) return setError(res.error);
      if (res.url) setQrUrl(res.url);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <MethodToggle
        on={codEnabled}
        onToggle={() => setCodEnabled((v) => !v)}
        title="Cash"
        blurb="Pay the rider on delivery, or pay at the stall on pickup."
      />

      <MethodToggle
        on={gcashEnabled}
        onToggle={() => setGcashEnabled((v) => !v)}
        title="GCash"
        blurb="Customers send money in the GCash app and give you the reference number to check."
      />

      {gcashEnabled && (
        <section className="flex flex-col gap-4 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
          <div>
            <h3 className="font-display text-lg font-bold text-ink-950">
              Your GCash details
            </h3>
            <p className="mt-1 text-sm text-ink-800/60">
              Shown to customers at checkout so they know where to send the
              money. Double-check the number — it goes straight in front of
              everyone who orders.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-ink-800">
                Account name
              </span>
              <input
                value={gcashName}
                onChange={(e) => setGcashName(e.target.value)}
                placeholder="Juan D."
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-ink-800">
                GCash number
              </span>
              <input
                value={gcashNumber}
                onChange={(e) => setGcashNumber(e.target.value)}
                inputMode="tel"
                placeholder="09XX XXX XXXX"
                className={fieldClass}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-cream-50 ring-1 ring-ink-950/10">
              {qrUrl ? (
                <Image src={qrUrl} alt="GCash QR code" fill sizes="112px" className="object-contain" />
              ) : (
                <span className="grid h-full w-full place-items-center text-xs font-semibold text-ink-800/40">
                  No QR yet
                </span>
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleQr(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="rounded-full bg-ink-950 px-4 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-60"
              >
                {qrUrl ? "Replace QR code" : "Upload QR code"}
              </button>
              <p className="mt-2 max-w-xs text-xs text-ink-800/55">
                Optional, but it saves customers typing your number. Screenshot
                it from GCash → <em>Receive Money</em>.
              </p>
            </div>
          </div>
        </section>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-widest text-ink-800">
          Note shown at checkout (optional)
        </span>
        <input
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="e.g. Send the exact total, then paste your reference number below."
          className={fieldClass}
        />
      </label>

      {error && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={`self-start rounded-full px-7 py-3 font-bold transition-colors disabled:opacity-60 ${
          saved ? "bg-jade-600 text-cream-50" : "bg-brand-600 text-cream-50 hover:bg-brand-700"
        }`}
      >
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save payment settings"}
      </button>
    </form>
  );
}
