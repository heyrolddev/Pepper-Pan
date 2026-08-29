"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveProfile } from "@/app/account/actions";
import { MapPicker, type Pin } from "@/components/map-picker";
import { AddressField } from "@/components/address-field";

const fieldClass =
  "rounded-2xl border-2 border-ink-950/15 bg-cream-100 px-5 py-3 font-normal text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600";
const labelClass =
  "flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-ink-800";

export function AccountForm({
  initial,
  shop,
}: {
  initial: {
    fullName: string;
    phone: string;
    address: string;
    lat: number | null;
    lng: number | null;
  };
  shop: Pin;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [phone, setPhone] = useState(initial.phone);
  const [address, setAddress] = useState(initial.address);
  const [pin, setPin] = useState<Pin | null>(
    initial.lat != null && initial.lng != null
      ? { lat: initial.lat, lng: initial.lng }
      : null
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const result = await saveProfile({
        fullName,
        phone,
        address,
        lat: pin?.lat ?? null,
        lng: pin?.lng ?? null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className={labelClass}>
        Full name
        <input
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Juan dela Cruz"
          className={fieldClass}
        />
      </label>

      <label className={labelClass}>
        Mobile number
        <input
          required
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="09XX XXX XXXX"
          className={fieldClass}
        />
      </label>

      <AddressField
        value={address}
        onChange={setAddress}
        onPick={(picked) => setPin(picked)}
      />

      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-ink-800">
          Pin your location
        </p>
        <p className="-mt-1 text-[11px] font-medium text-ink-800/50">
          Saving a pin means your delivery fee is calculated instantly at
          checkout, and the rider knows exactly where to go.
        </p>
        <MapPicker value={pin} onChange={setPin} shop={shop} height={230} />
      </div>

      {error && (
        <p className="rounded-2xl bg-brand-50 px-5 py-3 text-sm font-semibold text-brand-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className={`rounded-full px-7 py-4 font-bold transition-all disabled:opacity-60 ${
          saved ? "bg-jade-600 text-cream-50" : "bg-brand-600 text-cream-50 hover:scale-[1.02]"
        }`}
      >
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save details"}
      </button>
    </form>
  );
}
