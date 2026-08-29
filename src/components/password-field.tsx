"use client";

import { useId, useState } from "react";
import { fieldClass, labelClass } from "@/lib/form-styles";

/** Password input with a show/hide toggle. */
export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete = "current-password",
  minLength,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div className={labelClass}>
      <label htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${fieldClass} pr-16`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-800/60 transition-colors hover:text-brand-600"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {hint && (
        <span className="text-[11px] font-medium normal-case tracking-normal text-ink-800/50">
          {hint}
        </span>
      )}
    </div>
  );
}
