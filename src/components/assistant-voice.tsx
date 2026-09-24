"use client";

import { useState, useTransition } from "react";
import { Combobox } from "@/components/combobox";
import { peso } from "@/lib/peso";
import { saveAssistantVoice } from "@/app/admin/faq/actions";

/**
 * The two answers the shop wants a say in.
 *
 * Everything else Ask Pepper Pan says is a fact it can look up — the hours,
 * the delivery fee, whether a dish is sold out. These two are not facts. What
 * to recommend is a decision about margin and reputation, and what counts as
 * the best deal is whatever the owner has decided to push this week. Left to
 * the sums, the assistant told customers the shop's bestseller was extra
 * rice: true by the numbers, and exactly the wrong thing to say.
 *
 * Deliberately NOT a free-text answer, which the FAQ editor below already
 * offers. A pinned DISH keeps the price live, so a recommendation cannot
 * quote last month's money; and the promos come from the ones already written
 * for the homepage, so a finished offer stops being mentioned on its own.
 */

export type PickableDish = { id: string; name: string; price: number };

export function AssistantVoice({
  dishes,
  featuredMealId,
  featuredNote,
  promoNote,
  livePromos,
}: {
  dishes: PickableDish[];
  featuredMealId: string;
  featuredNote: string;
  promoNote: string;
  /** Titles of the promos the assistant will read out by itself. */
  livePromos: string[];
}) {
  const [mealId, setMealId] = useState(featuredMealId);
  const [note, setNote] = useState(featuredNote);
  const [promo, setPromo] = useState(promoNote);
  const [busy, startBusy] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    mealId !== featuredMealId || note !== featuredNote || promo !== promoNote;
  const chosen = dishes.find((d) => d.id === mealId) ?? null;

  function save() {
    setProblem(null);
    setSaved(false);
    startBusy(async () => {
      const res = await saveAssistantVoice({
        featuredMealId: mealId,
        featuredNote: note,
        promoNote: promo,
      });
      if (res.error) setProblem(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="rounded-3xl bg-cream-100 p-6 ring-1 ring-ink-950/10">
      <h3 className="font-display text-lg font-black text-ink-950">
        What Pepper Pan recommends
      </h3>
      <p className="mb-5 mt-0.5 max-w-2xl text-xs leading-relaxed text-ink-800/55">
        Two answers the shop decides rather than the sums. Left alone, &ldquo;what&apos;s
        your bestseller?&rdquo; is answered from what actually earns the most — which
        is better than counting units, but it still can&apos;t know what you&apos;d
        rather sell.
      </p>

      <div className="flex flex-col gap-5">
        {problem && (
          <p className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-cream-50">
            {problem}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            The dish to recommend
          </span>
          <Combobox
            value={mealId}
            ariaLabel="The dish Ask Pepper Pan recommends"
            placeholder="Work it out from the sales"
            options={[
              { value: "", label: "Work it out from the sales" },
              ...dishes.map((d) => ({
                value: d.id,
                label: d.name,
                hint: peso(d.price),
              })),
            ]}
            onChange={setMealId}
          />
          <p className="text-[11px] leading-relaxed text-ink-800/50">
            The price is read off the menu when someone asks, so it is never the
            old one.
          </p>
        </div>

        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            Why, in your words{" "}
            <span className="font-bold normal-case tracking-normal text-ink-800/40">
              · optional
            </span>
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Crispy sa labas, malambot sa loob — paborito ng mga suki."
            className="w-full rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
          <span className="text-[11px] text-ink-800/50">
            Used instead of the dish&apos;s menu description.
          </span>
        </label>

        {/* What the reply will actually look like. Cheaper to read than to
            open the chat widget and ask it yourself, which is what an owner
            would otherwise have to do to check. */}
        <div className="rounded-2xl bg-ink-950 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-gold-400/70">
            It will say
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-cream-50">
            {chosen
              ? `The one we always recommend is ${chosen.name} at ${peso(chosen.price)}. ${
                  note.trim() || "Then the dish's own description."
                }`
              : "Our biggest seller is … — whichever dish has taken the most money."}
          </p>
        </div>

        <hr className="border-ink-950/10" />

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
            Promos and best deals
          </span>
          {livePromos.length > 0 ? (
            <p className="rounded-xl bg-jade-600/10 px-3 py-2 text-[11px] leading-relaxed text-ink-800/70 ring-1 ring-jade-600/20">
              Already being mentioned, straight from{" "}
              <strong className="text-ink-950">Promos &amp; news</strong>:{" "}
              {livePromos.join(" · ")}. Nothing to retype — when one ends, the
              assistant stops offering it.
            </p>
          ) : (
            <p className="rounded-xl bg-cream-50 px-3 py-2 text-[11px] leading-relaxed text-ink-800/60 ring-1 ring-ink-950/10">
              No promo running. Write one in{" "}
              <strong className="text-ink-950">Promos &amp; news</strong> and the
              assistant offers it the moment it goes live — one place to type
              it, two places it appears.
            </p>
          )}
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="Suki discount pag lima pataas — tanong lang po."
            className="w-full rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
          <p className="text-[11px] leading-relaxed text-ink-800/50">
            For standing offers that were never announcements — a suki
            discount, bulk orders. Added underneath whatever is live.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy || !dirty}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-black text-cream-50 hover:bg-ink-800 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          {saved && !dirty && (
            <span className="text-sm font-bold text-jade-700">Saved.</span>
          )}
        </div>
      </div>
    </div>
  );
}
