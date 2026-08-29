"use client";

import Image from "next/image";
import { useState } from "react";
import {
  downpaymentFor,
  type PaymentMethod,
  type PaymentPlan,
  type PaymentSettings,
} from "@/lib/payments";

const peso = (n: number) => "₱" + n.toFixed(2);

const fieldClass =
  "rounded-2xl border-2 border-ink-950/15 bg-cream-100 px-5 py-3 font-normal text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600";

function CopyableRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-cream-50 px-4 py-2.5">
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-800/50">
          {label}
        </span>
        <span className="block truncate font-bold text-ink-950">{value}</span>
      </span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* clipboard blocked — the number is on screen to read anyway */
          }
        }}
        className="shrink-0 rounded-full bg-ink-950/10 px-3 py-1.5 text-xs font-bold text-ink-950 transition-colors hover:bg-ink-950 hover:text-cream-50"
      >
        {copied ? "Copied ✓" : "Copy"}
      </button>
    </div>
  );
}

export function PaymentPicker({
  settings,
  method,
  onMethodChange,
  plan,
  onPlanChange,
  reference,
  onReferenceChange,
  total,
}: {
  settings: PaymentSettings;
  method: PaymentMethod;
  onMethodChange: (m: PaymentMethod) => void;
  plan: PaymentPlan;
  onPlanChange: (p: PaymentPlan) => void;
  reference: string;
  onReferenceChange: (v: string) => void;
  total: number;
}) {
  const percent = settings.downpayment_percent;
  const downNow = downpaymentFor(total, percent);
  const balance = total - downNow;
  const offersDownpayment = settings.gcash_enabled && settings.downpayment_enabled;
  const dueNow = plan === "downpayment" ? downNow : total;
  const options: { id: PaymentMethod; label: string; blurb: string; on: boolean }[] = [
    {
      id: "cod",
      label: "Cash",
      blurb: "Pay on delivery or at the stall",
      on: settings.cod_enabled,
    },
    {
      id: "gcash",
      label: "GCash",
      blurb: "Send now, we confirm it",
      on: settings.gcash_enabled,
    },
  ];
  const available = options.filter((o) => o.on);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-800">
        How are you paying?
      </legend>

      <div className={`grid gap-3 ${available.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {available.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onMethodChange(o.id)}
            className={`rounded-2xl border-2 px-4 py-3 text-left transition-colors ${
              method === o.id
                ? "border-brand-600 bg-brand-600 text-cream-50"
                : "border-ink-950/15 bg-cream-100 text-ink-800 hover:border-brand-600"
            }`}
          >
            <span className="block font-bold">{o.label}</span>
            <span
              className={`block text-xs ${
                method === o.id ? "text-cream-100/75" : "text-ink-800/55"
              }`}
            >
              {o.blurb}
            </span>
          </button>
        ))}
      </div>

      {method === "gcash" && settings.gcash_enabled && (
        <div className="flex flex-col gap-3 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
          {offersDownpayment && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-800">
                How much are you sending now?
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  {
                    id: "full" as PaymentPlan,
                    title: "Pay in full",
                    amount: total,
                    note: "Nothing left to pay on handover",
                  },
                  {
                    id: "downpayment" as PaymentPlan,
                    title: `${percent}% down payment`,
                    amount: downNow,
                    note: `${peso(balance)} in cash on handover`,
                  },
                ]).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onPlanChange(o.id)}
                    className={`rounded-2xl border-2 p-4 text-left transition-colors ${
                      plan === o.id
                        ? "border-brand-600 bg-brand-600 text-cream-50"
                        : "border-ink-950/15 bg-cream-50 text-ink-800 hover:border-brand-600"
                    }`}
                  >
                    <span className="block text-xs font-bold uppercase tracking-wide opacity-70">
                      {o.title}
                    </span>
                    <span className="block font-display text-2xl font-black">
                      {peso(o.amount)}
                    </span>
                    <span
                      className={`block text-xs ${
                        plan === o.id ? "text-cream-100/75" : "text-ink-800/55"
                      }`}
                    >
                      {o.note}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="text-sm font-semibold text-ink-950">
            Send {peso(dueNow)} to this GCash account, then paste your reference
            number below.
          </p>

          {plan === "downpayment" && offersDownpayment && (
            <p className="rounded-xl bg-gold-50 px-4 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-gold-400/50">
              Pay {peso(downNow)} now · {peso(balance)} in cash when you get
              your order.
            </p>
          )}

          {settings.gcash_number && (
            <CopyableRow label="GCash number" value={settings.gcash_number} />
          )}
          {settings.gcash_name && (
            <CopyableRow label="Account name" value={settings.gcash_name} />
          )}

          {settings.gcash_qr_url && (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-cream-50 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-800/50">
                Or scan this QR
              </span>
              <div className="relative h-44 w-44">
                <Image
                  src={settings.gcash_qr_url}
                  alt="Pepper Pan GCash QR code"
                  fill
                  sizes="176px"
                  className="object-contain"
                />
              </div>
            </div>
          )}

          <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-ink-800">
            GCash reference number <span className="text-brand-600">*required</span>
            <input
              value={reference}
              onChange={(e) => onReferenceChange(e.target.value)}
              placeholder="e.g. 0053 1234 5678"
              className={fieldClass}
            />
            <span className="text-[11px] font-medium normal-case tracking-normal text-ink-800/50">
              It&apos;s on your GCash receipt. We check it against our account
              before cooking — you can also add a screenshot afterwards from
              your orders page.
            </span>
          </label>

          {settings.instructions && (
            <p className="text-xs text-ink-800/60">{settings.instructions}</p>
          )}
        </div>
      )}

      {method === "cod" && settings.instructions && (
        <p className="text-xs text-ink-800/60">{settings.instructions}</p>
      )}
    </fieldset>
  );
}
