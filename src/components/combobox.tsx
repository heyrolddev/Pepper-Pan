"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; label: string; hint?: string };

/**
 * A picker you can type into.
 *
 * A native `<select>` is fine for five options. This shop has 91 ingredients
 * and 26 batches in one list, and finding "T.O/ Solo Rice/Noodles/Jipai" in a
 * scrolling dropdown means reading past a hundred near-identical names — the
 * exact place a wrong pick becomes a wrong recipe, silently.
 *
 * Deliberately not a library. What's needed is a filter, arrow keys, Enter,
 * and Escape; everything else a combobox library brings is weight this page
 * doesn't need.
 */
export function Combobox({
  value,
  options,
  placeholder = "Search…",
  ariaLabel,
  onChange,
}: {
  value: string;
  options: ComboOption[];
  placeholder?: string;
  ariaLabel?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 60);
    // Names that *start* with what was typed come first: typing "co" should
    // reach "Coke" before "1oz sauce cup".
    const starts: ComboOption[] = [];
    const contains: ComboOption[] = [];
    for (const o of options) {
      const l = o.label.toLowerCase();
      if (l.startsWith(q)) starts.push(o);
      else if (l.includes(q)) contains.push(o);
    }
    return [...starts, ...contains].slice(0, 60);
  }, [options, query]);

  // Clicking anywhere else closes it, without swallowing that click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(o: ComboOption) {
    onChange(o.value);
    setQuery("");
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(matches.length - 1, next));
      });
      return;
    }
    if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      pick(matches[active]);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={open ? query : (selected?.label ?? "")}
        onChange={(e) => {
          setQuery(e.target.value);
          // Reset the highlight here rather than in an effect on `query`:
          // setting state from an effect triggers a second render pass for
          // every keystroke, on a list that re-filters on every keystroke.
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKey}
        placeholder={selected ? selected.label : placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        role="combobox"
        className="w-full rounded-xl border-2 border-ink-950/10 bg-cream-100 px-4 py-2 text-ink-950 outline-none transition-colors placeholder:text-ink-800/35 focus:border-gold-400"
      />

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-cream-50 py-1 shadow-2xl ring-1 ring-ink-950/15"
        >
          {matches.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-800/50">
              Nothing matches &ldquo;{query}&rdquo;.
            </li>
          )}
          {matches.map((o, i) => (
            <li key={o.value}>
              {/* onMouseDown, not onClick: the input's blur fires first and
                  would close the list before a click ever lands. */}
              <button
                type="button"
                role="option"
                aria-selected={o.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(o);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left text-sm transition-colors ${
                  i === active ? "bg-gold-400 text-ink-950" : "text-ink-800/85"
                }`}
              >
                <span className="min-w-0 flex-1">{o.label}</span>
                {o.hint && (
                  <span className="shrink-0 text-xs opacity-55">{o.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
