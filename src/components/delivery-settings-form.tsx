"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveDeliverySettings } from "@/app/admin/delivery/actions";
import { MapPicker, type Pin } from "@/components/map-picker";
import { quoteDelivery, type DeliverySettings } from "@/lib/delivery";

const fieldClass =
  "w-full rounded-xl border-2 border-ink-950/15 bg-cream-50 px-4 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";

function NumberField({
  label,
  hint,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-widest text-ink-800">
        {label}
      </span>
      <span className="flex items-center gap-2">
        {prefix && <span className="font-bold text-ink-800/60">{prefix}</span>}
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
        />
        {suffix && (
          <span className="whitespace-nowrap text-sm font-semibold text-ink-800/60">
            {suffix}
          </span>
        )}
      </span>
      {hint && <span className="text-[11px] text-ink-800/50">{hint}</span>}
    </label>
  );
}

export function DeliverySettingsForm({ initial }: { initial: DeliverySettings }) {
  const router = useRouter();

  const [isEnabled, setIsEnabled] = useState(initial.is_enabled);
  const [shopPin, setShopPin] = useState<Pin>({
    lat: initial.shop_lat,
    lng: initial.shop_lng,
  });
  const [baseFee, setBaseFee] = useState(String(initial.base_fee));
  const [baseKm, setBaseKm] = useState(String(initial.base_km));
  const [perKmFee, setPerKmFee] = useState(String(initial.per_km_fee));
  const [minFee, setMinFee] = useState(String(initial.min_fee));
  const [maxKm, setMaxKm] = useState(String(initial.max_km));
  const [freeOver, setFreeOver] = useState(String(initial.free_over));
  const [notice, setNotice] = useState(initial.notice ?? "");

  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A live worked example, so the owner can see what the numbers actually
  // charge before saving them rather than guessing.
  const preview = useMemo(() => {
    const settings: DeliverySettings = {
      is_enabled: true,
      shop_lat: shopPin.lat,
      shop_lng: shopPin.lng,
      base_fee: Number(baseFee) || 0,
      base_km: Number(baseKm) || 0,
      per_km_fee: Number(perKmFee) || 0,
      min_fee: Number(minFee) || 0,
      max_km: Number(maxKm) || 0,
      free_over: Number(freeOver) || 0,
      notice: null,
    };
    // Distances are approximated by offsetting latitude: ~0.009° ≈ 1 km.
    return [1, 3, 5, 8].map((km) => {
      const offset = (km / 1.3) * 0.009;
      const q = quoteDelivery(settings, shopPin.lat + offset, shopPin.lng, 300);
      return { km, quote: q };
    });
  }, [shopPin, baseFee, baseKm, perKmFee, minFee, maxKm, freeOver]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await saveDeliverySettings({
        isEnabled,
        shopLat: shopPin.lat,
        shopLng: shopPin.lng,
        baseFee: Number(baseFee),
        baseKm: Number(baseKm),
        perKmFee: Number(perKmFee),
        minFee: Number(minFee),
        maxKm: Number(maxKm),
        freeOver: Number(freeOver),
        notice,
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {/* On/off */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
        <div>
          <p className="font-display text-lg font-bold text-ink-950">
            Delivery is {isEnabled ? "on" : "paused"}
          </p>
          <p className="text-sm text-ink-800/60">
            {isEnabled
              ? "Customers can choose delivery at checkout."
              : "Customers can only choose pickup."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsEnabled((v) => !v)}
          className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
            isEnabled
              ? "bg-jade-600 text-cream-50 hover:bg-jade-700"
              : "bg-ink-950/10 text-ink-800 hover:bg-ink-950/20"
          }`}
        >
          {isEnabled ? "✓ Enabled" : "Paused — turn on"}
        </button>
      </div>

      {/* Shop location */}
      <section className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
        <h3 className="font-display text-lg font-bold text-ink-950">
          Where the shop is
        </h3>
        <p className="mb-3 mt-1 text-sm text-ink-800/60">
          Every delivery distance is measured from this pin — drag it onto your
          actual stall so the fees come out right.
        </p>
        <MapPicker
          value={shopPin}
          onChange={setShopPin}
          shop={shopPin}
          height={280}
        />
        <p className="mt-2 font-mono text-xs text-ink-800/50">
          {shopPin.lat.toFixed(6)}, {shopPin.lng.toFixed(6)}
        </p>
      </section>

      {/* Pricing */}
      <section className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
        <h3 className="font-display text-lg font-bold text-ink-950">
          How the fee is worked out
        </h3>
        <p className="mb-4 mt-1 text-sm text-ink-800/60">
          A base fee covers the first few kilometres, then a rate per extra
          kilometre — the same shape Grab and foodpanda use.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Base fee"
            prefix="₱"
            value={baseFee}
            onChange={setBaseFee}
            hint="Charged on every delivery."
          />
          <NumberField
            label="Base covers"
            suffix="km"
            value={baseKm}
            onChange={setBaseKm}
            hint="Distance included in the base fee."
          />
          <NumberField
            label="Per extra km"
            prefix="₱"
            value={perKmFee}
            onChange={setPerKmFee}
            hint="Added for each km past the base."
          />
          <NumberField
            label="Minimum fee"
            prefix="₱"
            value={minFee}
            onChange={setMinFee}
            hint="The fee never goes below this."
          />
          <NumberField
            label="Maximum distance"
            suffix="km"
            value={maxKm}
            onChange={setMaxKm}
            hint="Orders further than this are refused."
          />
          <NumberField
            label="Free delivery over"
            prefix="₱"
            value={freeOver}
            onChange={setFreeOver}
            hint="0 turns this off."
          />
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-widest text-ink-800">
            Note shown at checkout (optional)
          </span>
          <input
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            placeholder="e.g. Deliveries run 10am–8pm daily."
            className={fieldClass}
          />
        </label>
      </section>

      {/* Worked example */}
      <section className="rounded-2xl bg-cream-100 p-5 ring-1 ring-ink-950/10">
        <h3 className="font-display text-lg font-bold text-ink-950">
          What customers would pay
        </h3>
        <p className="mb-4 mt-1 text-sm text-ink-800/60">
          Based on the numbers above, on a ₱300 order.
        </p>
        <ul className="flex flex-wrap gap-3">
          {preview.map(({ km, quote }) => (
            <li
              key={km}
              className={`rounded-2xl px-4 py-3 text-sm ring-1 ${
                quote.ok
                  ? "bg-cream-50 ring-ink-950/10"
                  : "bg-brand-50 ring-brand-300"
              }`}
            >
              <span className="block text-xs font-bold uppercase tracking-wide text-ink-800/55">
                ~{km} km
              </span>
              <span
                className={`font-display text-xl font-black ${
                  quote.ok ? "text-brand-600" : "text-ink-800/50"
                }`}
              >
                {quote.ok ? (quote.fee === 0 ? "Free" : `₱${quote.fee}`) : "Too far"}
              </span>
            </li>
          ))}
        </ul>
      </section>

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
        {busy ? "Saving…" : saved ? "Saved ✓" : "Save delivery settings"}
      </button>
    </form>
  );
}
