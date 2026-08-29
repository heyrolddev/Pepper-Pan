"use client";

import { useId, useState } from "react";

function Star({ fill, className }: { fill: number; className?: string }) {
  // `fill` is 0–1, so a 4.3 average can show a genuinely partial fifth star
  // rather than rounding the score away.
  //
  // The gradient needs a document-unique id. `useId` rather than a random
  // string: a random one differs between the server and client renders, which
  // is a hydration mismatch as well as an impure render.
  const id = useId();
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="currentColor" />
          <stop offset={`${fill * 100}%`} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.35l-5.81 3.05 1.11-6.47-4.7-4.58 6.5-.95L12 2.5z"
        fill={`url(#${id})`}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Read-only score display. */
export function Stars({
  rating,
  size = "sm",
  className = "",
}: {
  rating: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const px = size === "lg" ? "h-6 w-6" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-gold-500 ${className}`}
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={Math.min(Math.max(rating - i, 0), 1)} className={px} />
      ))}
    </span>
  );
}

const WORDS = ["", "Hindi masarap", "Okay lang", "Masarap", "Sobrang sarap", "Perfect! 🔥"];

/** Interactive 1–5 picker. */
export function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            aria-pressed={value === n}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onClick={() => onChange(n)}
            className={`text-gold-500 transition-transform disabled:opacity-50 ${
              !disabled && "hover:scale-125"
            }`}
          >
            <Star fill={n <= shown ? 1 : 0} className="h-8 w-8" />
          </button>
        ))}
      </div>
      {shown > 0 && (
        <span className="text-sm font-bold text-ink-800">{WORDS[shown]}</span>
      )}
    </div>
  );
}
