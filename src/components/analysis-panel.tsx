"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { runAnalysis } from "@/app/admin/analytics/actions";
import type { Advice } from "@/lib/marketing-analyst";

export function AnalysisPanel() {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ranAt, setRanAt] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await runAnalysis();
      if (res.error) setError(res.error);
      if (res.advice) {
        setAdvice(res.advice);
        setRanAt(new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" }));
      }
    } catch {
      setError("The analysis didn't come back. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl bg-ink-950 p-6 text-cream-100 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-widest text-gold-400">
            Ads, social &amp; promos
          </p>
          <h3 className="mt-1 font-display text-2xl font-black text-cream-50">
            What to do about it
          </h3>
          <p className="mt-1 max-w-xl text-sm text-cream-100/60">
            Reads the numbers above — your busiest hours, what sells, what
            doesn&apos;t, what customers ask — and works out what to post, what
            to boost and what to put on promo. The captions are drafts in your
            voice to edit; the reasoning behind each one is your own data.
          </p>
        </div>

        <button
          onClick={run}
          disabled={busy}
          className="shrink-0 rounded-full bg-gold-400 px-6 py-3 font-bold text-ink-950 transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
        >
          {busy ? "Reading your numbers…" : advice ? "Run again" : "Analyse my shop"}
        </button>
      </div>

      {error && (
        <p className="mt-5 rounded-2xl bg-brand-600/20 px-5 py-3 text-sm font-semibold text-brand-200 ring-1 ring-brand-600/40">
          {error}
        </p>
      )}

      {busy && (
        <div className="mt-6 flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.25, 0.6, 0.25] }}
              transition={{ repeat: Infinity, duration: 1.6, delay: i * 0.18 }}
              className="h-16 rounded-2xl bg-cream-50/10"
            />
          ))}
        </div>
      )}

      {advice && !busy && (
        <div className="mt-7 flex flex-col gap-7">
          <p className="rounded-2xl bg-gold-400 px-5 py-4 font-display text-lg font-black text-ink-950">
            {advice.headline}
          </p>

          {advice.readings.length > 0 && (
            <Group title="What the numbers say">
              <div className="grid gap-3 sm:grid-cols-2">
                {advice.readings.map((r, i) => (
                  <Card key={i}>
                    <p className="font-bold text-cream-50">{r.title}</p>
                    <p className="mt-1 text-sm text-cream-100/70">{r.detail}</p>
                  </Card>
                ))}
              </div>
            </Group>
          )}

          {advice.ads.length > 0 && (
            <Group title="Ads worth boosting">
              <div className="grid gap-3 sm:grid-cols-2">
                {advice.ads.map((a, i) => (
                  <Card key={i}>
                    <p className="text-xs font-bold uppercase tracking-widest text-gold-400">
                      {a.audience}
                    </p>
                    <p className="mt-2 font-display text-lg font-black text-cream-50">
                      &ldquo;{a.hook}&rdquo;
                    </p>
                    <p className="mt-2 text-sm text-cream-100/70">{a.why}</p>
                    <p className="mt-2 inline-block rounded-full bg-cream-50/10 px-3 py-1 text-xs font-bold text-cream-100">
                      {a.budget}
                    </p>
                  </Card>
                ))}
              </div>
            </Group>
          )}

          {advice.social.length > 0 && (
            <Group title="This week's posts">
              <ul className="flex flex-col gap-2">
                {advice.social.map((s, i) => (
                  <li
                    key={i}
                    className="flex flex-col gap-1 rounded-2xl bg-cream-50/5 p-4 ring-1 ring-cream-50/10 sm:flex-row sm:gap-4"
                  >
                    <span className="flex shrink-0 items-start gap-2 sm:w-32">
                      <span className="rounded-full bg-gold-400 px-2.5 py-0.5 text-xs font-black text-ink-950">
                        {s.day}
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wide text-cream-100/50">
                        {s.platform}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-cream-50">
                        {s.idea}
                      </span>
                      <span className="mt-1 block text-sm italic text-cream-100/60">
                        {s.caption}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Group>
          )}

          {advice.promos.length > 0 && (
            <Group title="Promos to try">
              <div className="grid gap-3 sm:grid-cols-2">
                {advice.promos.map((p, i) => (
                  <Card key={i}>
                    <p className="font-display text-lg font-black text-cream-50">{p.name}</p>
                    <p className="mt-1 text-sm text-cream-100/75">{p.mechanic}</p>
                    <p className="mt-2 text-sm text-cream-100/55">{p.why}</p>
                    <p className="mt-2 rounded-xl bg-brand-600/20 px-3 py-2 text-xs font-semibold text-brand-200">
                      Watch out: {p.watchOut}
                    </p>
                  </Card>
                ))}
              </div>
            </Group>
          )}

          {advice.menu.length > 0 && (
            <Group title="Menu notes">
              <ul className="flex flex-col gap-2">
                {advice.menu.map((m, i) => (
                  <li
                    key={i}
                    className="rounded-2xl bg-cream-50/5 px-4 py-3 text-sm text-cream-100/75 ring-1 ring-cream-50/10"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </Group>
          )}

          <p className="text-center text-xs text-cream-100/40">
            Worked out from your own sales data{ranAt ? ` at ${ranAt}` : ""}. Every
            figure here is yours. The wording is a starting point — you know how
            your customers talk.
          </p>
        </div>
      )}
    </section>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-3 text-xs font-bold uppercase tracking-widest text-gold-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-cream-50/5 p-5 ring-1 ring-cream-50/10">{children}</div>
  );
}
