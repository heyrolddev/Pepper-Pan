"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SearchIcon } from "@/components/icons";

/**
 * Filter box for the admin lists. Takes the rows plus a function that turns a
 * row into the text worth matching on, and hands back only the rows that
 * match — so each admin page decides what "searchable" means for its data
 * (an order matches on customer name, phone, item names and status; a meal on
 * name, description and category) without re-implementing the box each time.
 */
export function AdminSearch<T>({
  rows,
  searchText,
  placeholder,
  children,
  noun = "result",
}: {
  rows: T[];
  searchText: (row: T) => string;
  placeholder: string;
  children: (filtered: T[], query: string) => ReactNode;
  noun?: string;
}) {
  const [query, setQuery] = useState("");

  // Precompute each row's haystack once per render rather than per keystroke
  // per row, and match on every whitespace-separated term so "jipai 0947"
  // finds an order by item *and* number.
  const indexed = useMemo(
    () => rows.map((row) => ({ row, text: searchText(row).toLowerCase() })),
    [rows, searchText]
  );

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return rows;
    return indexed.filter((r) => terms.every((t) => r.text.includes(t))).map((r) => r.row);
  }, [indexed, query, rows]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-800/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-full border-2 border-ink-950/15 bg-cream-100 py-2.5 pl-11 pr-4 text-sm font-medium text-ink-950 outline-none transition-colors placeholder:text-ink-800/40 focus:border-brand-600"
          />
        </div>
        {query.trim() && (
          <span className="text-sm font-semibold text-ink-800/60">
            {filtered.length} {noun}
            {filtered.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {children(filtered, query)}
    </div>
  );
}
