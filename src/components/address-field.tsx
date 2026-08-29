"use client";

import { useEffect, useRef, useState } from "react";
import type { GeocodeHit } from "@/app/api/geocode/route";
import type { Pin } from "@/components/map-picker";

const fieldClass =
  "w-full rounded-2xl border-2 border-ink-950/15 bg-cream-100 px-5 py-3 font-normal text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600";

/**
 * A delivery address box that finds the place on the map for you.
 *
 * "Use my location" only helps when you're standing at the delivery address —
 * useless when sending food to a parent, an office, or a friend. Typing the
 * address and having the pin jump there covers that case, and the pin stays
 * draggable afterwards for the last few metres.
 */
export function AddressField({
  value,
  onChange,
  onPick,
  label = "Delivery address",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (pin: Pin, label: string) => void;
  label?: string;
  required?: boolean;
}) {
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(false);

  // The value that was last looked up, so re-renders don't re-query and the
  // customer picking a suggestion doesn't immediately trigger another search.
  const lastQuery = useRef("");

  useEffect(() => {
    const q = value.trim();
    if (!touched || q.length < 6 || q === lastQuery.current) return;

    // Debounced: Nominatim asks for at most one request a second, and nobody
    // wants a lookup per keystroke.
    const id = setTimeout(async () => {
      lastQuery.current = q;
      setSearching(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const data = (await res.json()) as { hits: GeocodeHit[] };
        setHits(data.hits ?? []);
        setOpen((data.hits ?? []).length > 0);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 800);

    return () => clearTimeout(id);
  }, [value, touched]);

  return (
    <div className="relative flex flex-col gap-2">
      <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-ink-800">
        {label} {required && <span className="text-brand-600">*required</span>}
        <textarea
          required={required}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setTouched(true);
          }}
          rows={3}
          placeholder="House no. & street, barangay, nearest landmark…"
          className={fieldClass}
        />
      </label>

      <p className="-mt-1 text-[11px] font-medium text-ink-800/55">
        {searching
          ? "Looking for that place on the map…"
          : "Type the address and we'll find it on the map — then drag the pin to be exact."}
      </p>

      {open && hits.length > 0 && (
        <div className="rounded-2xl bg-cream-50 p-2 ring-1 ring-ink-950/10">
          <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-ink-800/50">
            Did you mean
          </p>
          <ul className="flex flex-col">
            {hits.map((h) => (
              <li key={`${h.lat},${h.lng}`}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ lat: h.lat, lng: h.lng }, h.label);
                    setOpen(false);
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink-800 transition-colors hover:bg-brand-600 hover:text-cream-50"
                >
                  📍 {h.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-1 w-full rounded-xl px-3 py-1.5 text-xs font-bold text-ink-800/60 hover:text-brand-600"
          >
            None of these — I&apos;ll drop the pin myself
          </button>
        </div>
      )}
    </div>
  );
}
