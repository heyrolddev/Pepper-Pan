"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { decideDevice, revokeDevice } from "@/app/admin/staff/actions";
import type { DeviceStatus } from "@/lib/devices";

export type DeviceEntry = {
  id: string;
  person: string;
  label: string;
  status: DeviceStatus;
  firstSeen: string;
  lastSeen: string;
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));

/**
 * Which browsers can open HQ, and the ones asking to.
 *
 * Managers and staff work from one device. A second one waits here, because
 * the owner is the only person who knows whether it is a new phone or
 * somebody else holding a password.
 *
 * Pending requests sit at the top and stay there: this is not a log to skim,
 * it is a queue with somebody standing at the counter unable to work until
 * it is cleared. The rest of the list exists for the other case — a phone
 * that has been lost, where the useful control is taking access away from a
 * device that is already allowed.
 */
export function DeviceRequests({ devices }: { devices: DeviceEntry[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waiting = devices.filter((d) => d.status === "pending");
  const rest = devices.filter((d) => d.status !== "pending");

  async function act(id: string, fn: () => Promise<{ error: string | null }>) {
    setBusy(id);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (r.error) setError(r.error);
    else router.refresh();
  }

  if (devices.length === 0) return null;

  return (
    <section className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10 sm:p-8">
      <h3 className="font-display text-xl font-black tracking-tight text-ink-950">
        Devices
        {waiting.length > 0 && (
          <span className="ml-3 rounded-full bg-brand-600 px-2.5 py-1 align-middle text-xs font-black text-cream-50">
            {waiting.length} waiting
          </span>
        )}
      </h3>
      <p className="mt-2 max-w-2xl text-sm text-ink-800/70">
        Managers and staff work from one device. Anything else asks you first.
        Your own devices are never held up — if they were, nobody would be
        left who could let anyone in.
      </p>

      {error && (
        <p className="mt-4 rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
          {error}
        </p>
      )}

      {waiting.length > 0 && (
        <ul className="mt-5 flex flex-col gap-3">
          {waiting.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-cream-50 p-4 ring-2 ring-gold-400"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink-950">{d.person}</p>
                <p className="text-sm text-ink-800/70">
                  {d.label} · first seen {when(d.firstSeen)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => act(d.id, () => decideDevice({ deviceRowId: d.id, allow: true }))}
                  disabled={busy === d.id}
                  className="rounded-full bg-ink-950 px-4 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-jade-700 disabled:opacity-60"
                >
                  Allow
                </button>
                <button
                  onClick={() => act(d.id, () => decideDevice({ deviceRowId: d.id, allow: false }))}
                  disabled={busy === d.id}
                  className="rounded-full px-4 py-2 text-sm font-bold text-brand-600 ring-1 ring-brand-600/40 transition-colors hover:bg-brand-600 hover:text-cream-50 disabled:opacity-60"
                >
                  Refuse
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rest.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-semibold text-ink-800/70">
            {rest.length} device{rest.length === 1 ? "" : "s"} already decided
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {rest.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-cream-50 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-950">{d.person}</p>
                  <p className="text-xs text-ink-800/60">
                    {d.label} · last used {when(d.lastSeen)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    d.status === "approved"
                      ? "bg-jade-700 text-cream-50"
                      : "bg-ink-950/10 text-ink-800/70"
                  }`}
                >
                  {d.status === "approved" ? "Allowed" : "Refused"}
                </span>
                {d.status === "approved" && (
                  <button
                    onClick={() => act(d.id, () => revokeDevice(d.id))}
                    disabled={busy === d.id}
                    className="shrink-0 text-xs font-bold text-brand-600 underline-offset-2 transition-colors hover:underline disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
