"use client";

import { useMemo, useState, useTransition } from "react";
import { AdminDialog } from "@/components/admin-dialog";
import { peso, pesoRound } from "@/lib/peso";
import { formatDate } from "@/lib/format-date";
import {
  CAMPAIGN_KINDS,
  KIND_HINT,
  KIND_LABEL,
  VERDICT_COPY,
  discountLift,
  evaluateCampaign,
  type CampaignInput,
  type CampaignKind,
  type CampaignResult,
  type ShopNormal,
} from "@/lib/marketing";
import {
  deleteCampaign,
  saveCampaign,
  type CampaignRow,
} from "@/app/admin/promos/marketing-actions";

/**
 * Was the marketing worth it?
 *
 * The shop spends money to bring people in and has never had anywhere to find
 * out whether it worked. This is that place — and the reason it sits at the
 * top of the Promos page rather than on the Money page is that it is not a
 * money record. It moves nothing. It is the shop's working-out.
 *
 * Two decisions shape the whole screen.
 *
 * **The boxes open already filled in, from the shop's own history.** Every
 * break-even calculator on the web starts empty and asks the owner to guess
 * their margin, and a guessed margin makes every figure downstream wrong in
 * the same direction without anybody noticing. Pepper Pan already knows its
 * margin, its usual day and its ordinary swing between days. So those arrive
 * filled, and the owner changes them only where they have a reason to.
 *
 * **The answer is a sentence, and the sums are one tap away.** "It paid" or
 * "It sold more, but not enough" is what the owner came for. The arithmetic
 * behind it is what makes the sentence worth believing — so every figure is
 * there, in order, behind "See the calculation", rather than crowding the
 * answer or being hidden altogether.
 */

const pct = (n: number) => `${n >= 0 ? "" : "−"}${Math.abs(Math.round(n))}%`;

type Draft = {
  id?: string;
  name: string;
  kind: CampaignKind;
  startedOn: string;
  days: string;
  spend: string;
  giveawayCost: string;
  discountGiven: string;
  baselinePerDay: string;
  duringPerDay: string;
  marginPct: string;
  newCustomers: string;
  returned: string;
  note: string;
};

function blankDraft(normal: ShopNormal): Draft {
  return {
    name: "",
    kind: "ads",
    startedOn: new Date().toISOString().slice(0, 10),
    days: "7",
    spend: "",
    giveawayCost: "",
    discountGiven: "",
    // The shop's own numbers, as a starting point rather than an answer.
    baselinePerDay: normal.baselinePerDay ? String(Math.round(normal.baselinePerDay)) : "",
    duringPerDay: "",
    marginPct: normal.marginRatio ? String(Math.round(normal.marginRatio * 100)) : "",
    newCustomers: "",
    returned: "",
    note: "",
  };
}

function draftOf(row: CampaignRow, normal: ShopNormal): Draft {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    startedOn: row.started_on,
    days: String(row.days),
    spend: row.spend ? String(row.spend) : "",
    giveawayCost: row.giveaway_cost ? String(row.giveaway_cost) : "",
    discountGiven: row.discount_given ? String(row.discount_given) : "",
    baselinePerDay: String(row.baseline_per_day),
    duringPerDay: row.during_per_day === null ? "" : String(row.during_per_day),
    // Frozen on the row, like `orders.cogs` — a campaign judged in March keeps
    // being judged at March's margin. `normal` is only the fallback for a row
    // written before there was one.
    marginPct: String(Math.round((row.margin_ratio || normal.marginRatio) * 100)),
    newCustomers: row.new_customers ? String(row.new_customers) : "",
    returned: row.returned ? String(row.returned) : "",
    note: row.note ?? "",
  };
}

function inputOf(d: Draft, normal: ShopNormal): CampaignInput {
  const n = (v: string) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? x : 0;
  };
  return {
    kind: d.kind,
    spend: n(d.spend),
    giveawayCost: n(d.giveawayCost),
    discountGiven: n(d.discountGiven),
    days: n(d.days) || 1,
    baselinePerDay: n(d.baselinePerDay),
    duringPerDay: d.duringPerDay.trim() === "" ? null : n(d.duringPerDay),
    marginRatio: n(d.marginPct) / 100,
    newCustomers: n(d.newCustomers),
    returned: n(d.returned),
    avgOrderValue: normal.avgOrderValue,
    dailySwing: normal.dailySwing,
  };
}

export function MarketingCalculator({
  rows,
  normal,
  error,
}: {
  rows: CampaignRow[];
  normal: ShopNormal;
  error: string | null;
}) {
  const [draft, setDraft] = useState<Draft>(() => blankDraft(normal));
  const [showSums, setShowSums] = useState(false);
  const [saving, startSaving] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const input = useMemo(() => inputOf(draft, normal), [draft, normal]);
  const result = useMemo(() => evaluateCampaign(input), [input]);
  const copy = VERDICT_COPY[result.verdict];

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Nothing has been typed yet, so there is nothing to judge. Shown as an
  // invitation rather than as a verdict of ₱0.
  const empty =
    input.spend + input.giveawayCost + input.discountGiven === 0 &&
    input.baselinePerDay === 0;

  function save() {
    setSaveError(null);
    startSaving(async () => {
      const res = await saveCampaign({
        id: draft.id,
        name: draft.name,
        kind: draft.kind,
        startedOn: draft.startedOn,
        days: Number(draft.days) || 1,
        spend: Number(draft.spend) || 0,
        giveawayCost: Number(draft.giveawayCost) || 0,
        discountGiven: Number(draft.discountGiven) || 0,
        baselinePerDay: Number(draft.baselinePerDay) || 0,
        duringPerDay: draft.duringPerDay,
        marginRatio: (Number(draft.marginPct) || 0) / 100,
        newCustomers: Number(draft.newCustomers) || 0,
        returned: Number(draft.returned) || 0,
        note: draft.note,
      });
      if (res.error) setSaveError(res.error);
      else setDraft(blankDraft(normal));
    });
  }

  return (
    <section className="rounded-3xl bg-cream-100 p-5 ring-1 ring-ink-950/10 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-black text-ink-950 sm:text-2xl">
            Did the marketing work?
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-800/65">
            Ads, a promo, a free taste — what it cost, what it brought in, and
            whether that was worth it. This moves no money: nothing here
            changes Pepper Pan Bank or the drawer. It is the working-out.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-xl bg-ink-950 px-4 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800"
        >
          {open ? "Hide" : rows.length > 0 ? "Open calculator" : "Work one out"}
        </button>
      </div>

      {/* The one thing worth saying before any of the boxes: what the shop's
          money has to do just to stand still. It needs no campaign typed in,
          which is exactly why it goes first. */}
      {normal.marginRatio > 0 && (
        <p className="mt-4 rounded-2xl bg-gold-400/20 px-4 py-3 text-sm text-ink-800/80">
          At your margin of{" "}
          <strong className="text-ink-950">
            {Math.round(normal.marginRatio * 100)}%
          </strong>
          , every <strong className="text-ink-950">₱1</strong> you spend on
          marketing has to bring back{" "}
          <strong className="text-ink-950">
            ₱{(1 / normal.marginRatio).toFixed(2)}
          </strong>{" "}
          of extra sales just to break even — not ₱1. Anything under that is
          losing money even while sales go up.
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-2xl bg-gold-50 px-4 py-3 text-sm text-ink-800/75 ring-1 ring-gold-400/40">
          Run <strong>migration 0044</strong> in the Supabase SQL Editor to keep
          a record of these. The calculator below works without it — you just
          can&apos;t save what you work out.
          <span className="mt-2 block font-mono text-xs text-ink-800/55">{error}</span>
        </p>
      )}

      {open && (
        <div className="mt-6 flex flex-col gap-6">
          <Form draft={draft} set={set} normal={normal} />

          <Answer
            result={result}
            input={input}
            empty={empty}
            copy={copy}
            onSums={() => setShowSums(true)}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !draft.name.trim()}
              className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : draft.id ? "Save changes" : "Keep this record"}
            </button>
            {!draft.name.trim() && (
              <span className="text-xs text-ink-800/50">
                Give it a name first, so you know what it was next year.
              </span>
            )}
            {draft.id && (
              <button
                type="button"
                onClick={() => setDraft(blankDraft(normal))}
                className="text-sm font-bold text-ink-800/60 hover:text-ink-950"
              >
                Start a new one
              </button>
            )}
          </div>
          {saveError && (
            <p className="text-sm font-semibold text-brand-700">{saveError}</p>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <Past rows={rows} normal={normal} onEdit={(r) => {
          setDraft(draftOf(r, normal));
          setOpen(true);
        }} />
      )}

      {showSums && (
        <Sums
          input={input}
          result={result}
          normal={normal}
          onClose={() => setShowSums(false)}
        />
      )}
    </section>
  );
}

/* ── The boxes ──────────────────────────────────────────────────────────── */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-black uppercase tracking-widest text-ink-800/55">
        {label}
      </span>
      {children}
      {hint && <span className="text-xs leading-relaxed text-ink-800/45">{hint}</span>}
    </label>
  );
}

const boxClass =
  "rounded-xl bg-cream-50 px-3 py-2.5 text-sm font-semibold text-ink-950 ring-1 ring-ink-950/10 focus:outline-none focus:ring-2 focus:ring-gold-400";

function Money({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <span className="relative flex items-center">
      <span className="pointer-events-none absolute left-3 text-sm font-bold text-ink-800/40">
        ₱
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${boxClass} w-full pl-7`}
      />
    </span>
  );
}

function Form({
  draft,
  set,
  normal,
}: {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  normal: ShopNormal;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What was it?">
          <input
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Boost ng reel, Fiesta free taste…"
            className={boxClass}
          />
        </Field>
        <Field label="Started">
          <input
            type="date"
            value={draft.startedOn}
            onChange={(e) => set("startedOn", e.target.value)}
            className={boxClass}
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-ink-800/55">
          Kind
        </p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {CAMPAIGN_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set("kind", k)}
              className={`rounded-xl px-3 py-2.5 text-sm font-bold transition-colors ${
                draft.kind === k
                  ? "bg-ink-950 text-gold-400"
                  : "bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-ink-800/50">
          {KIND_HINT[draft.kind]}
        </p>
      </div>

      {/* What it cost. Three boxes because they behave differently, and a shop
          that lumps them together stops being able to see which one hurt. */}
      <div className="rounded-2xl bg-cream-50/70 p-4 ring-1 ring-ink-950/5">
        <p className="mb-3 text-sm font-bold text-ink-950">What it cost you</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Money paid out" hint="Ad spend, printing, a fee.">
            <Money value={draft.spend} onChange={(v) => set("spend", v)} placeholder="0" />
          </Field>
          <Field
            label="Giveaways"
            hint="What the free ones cost YOU to make — ingredients, not menu price."
          >
            <Money
              value={draft.giveawayCost}
              onChange={(v) => set("giveawayCost", v)}
              placeholder="0"
            />
          </Field>
          <Field label="Discount given" hint="Total taken off prices across the whole run.">
            <Money
              value={draft.discountGiven}
              onChange={(v) => set("discountGiven", v)}
              placeholder="0"
            />
          </Field>
        </div>
      </div>

      {/* The half that decides everything, and the half a shop judging by
          memory always gets wrong in its own favour. */}
      <div className="rounded-2xl bg-cream-50/70 p-4 ring-1 ring-ink-950/5">
        <p className="text-sm font-bold text-ink-950">What happened</p>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-ink-800/55">
          The whole answer is the gap between these two. Sales during a
          campaign are not the campaign&apos;s doing — the shop would have
          taken something that week anyway.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Usual day, before"
            hint={
              normal.baselinePerDay > 0
                ? `Your usual is ${pesoRound(normal.baselinePerDay)}, from ${normal.days} trading day${normal.days === 1 ? "" : "s"}.`
                : "What a normal day took before this started."
            }
          >
            <Money
              value={draft.baselinePerDay}
              onChange={(v) => set("baselinePerDay", v)}
              placeholder="0"
            />
          </Field>
          <Field
            label="A day while it ran"
            hint="Leave empty if it hasn't run yet — you'll get the target instead."
          >
            <Money
              value={draft.duringPerDay}
              onChange={(v) => set("duringPerDay", v)}
              placeholder="not yet"
            />
          </Field>
          <Field label="Trading days" hint="Days the shop was actually open during it.">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.days}
              onChange={(e) => set("days", e.target.value)}
              className={`${boxClass} w-full`}
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Margin used"
          hint={
            normal.marginRatio > 0
              ? `Your own, from ${normal.days} day${normal.days === 1 ? "" : "s"} of real orders.`
              : "What's left of each peso after ingredients."
          }
        >
          <span className="relative flex items-center">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={draft.marginPct}
              onChange={(e) => set("marginPct", e.target.value)}
              className={`${boxClass} w-full pr-8`}
            />
            <span className="pointer-events-none absolute right-3 text-sm font-bold text-ink-800/40">
              %
            </span>
          </span>
        </Field>
        <Field label="New customers" hint="Optional. People who had never bought before.">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.newCustomers}
            onChange={(e) => set("newCustomers", e.target.value)}
            placeholder="0"
            className={`${boxClass} w-full`}
          />
        </Field>
        <Field label="…and came back" hint="Optional. This is where a free taste earns out.">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={draft.returned}
            onChange={(e) => set("returned", e.target.value)}
            placeholder="0"
            className={`${boxClass} w-full`}
          />
        </Field>
      </div>

      <Field label="Note" hint="Anything you'll want to remember. Optional.">
        <input
          value={draft.note}
          onChange={(e) => set("note", e.target.value)}
          placeholder="Ran alongside the fiesta — busy week anyway"
          className={boxClass}
        />
      </Field>
    </div>
  );
}

/* ── The answer ─────────────────────────────────────────────────────────── */

const TONE: Record<"good" | "bad" | "wait", string> = {
  good: "bg-jade-600 text-cream-50 ring-jade-700/30",
  bad: "bg-brand-600 text-cream-50 ring-brand-700/30",
  wait: "bg-gold-400 text-ink-950 ring-gold-500/40",
};

function Answer({
  result,
  input,
  empty,
  copy,
  onSums,
}: {
  result: CampaignResult;
  input: CampaignInput;
  empty: boolean;
  copy: (typeof VERDICT_COPY)[keyof typeof VERDICT_COPY];
  onSums: () => void;
}) {
  if (empty) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-brand-300 bg-cream-50 p-6 text-sm text-ink-800/60">
        Fill in what it cost and what a day took, and the answer appears here.
      </p>
    );
  }

  const forecast = result.verdict === "forecast";

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-3xl p-5 ring-1 sm:p-6 ${TONE[copy.tone]}`}>
        <p className="text-[11px] font-black uppercase tracking-widest opacity-70">
          {forecast ? "What it has to do" : "The verdict"}
        </p>
        <p className="mt-1 font-display text-2xl font-black sm:text-3xl">
          {copy.label}
        </p>
        <p className="mt-1 font-display text-3xl font-black tabular-nums sm:text-4xl">
          {forecast
            ? `${pesoRound(result.breakEvenSales)} of extra sales`
            : `${result.net >= 0 ? "+" : "−"}${pesoRound(Math.abs(result.net))}`}
        </p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed opacity-85">{copy.line}</p>
        {forecast && result.breakEvenPerDay > 0 && (
          <p className="mt-2 text-sm font-bold opacity-90">
            That&apos;s {pesoRound(result.breakEvenPerDay)} more a day for{" "}
            {Math.round(input.days)} day{Math.round(input.days) === 1 ? "" : "s"}.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cell
          label="Extra sales"
          value={forecast ? "—" : pesoRound(result.extraSales)}
          note={forecast ? "Not run yet" : "Over and above a normal day"}
        />
        <Cell
          label="Kept from it"
          value={forecast ? "—" : pesoRound(result.extraProfit)}
          note="After ingredients"
        />
        <Cell
          label="It cost"
          value={pesoRound(result.totalCost)}
          note="Cash, giveaways and discount"
        />
        <Cell
          label="Break-even"
          value={pesoRound(result.breakEvenSales)}
          note="Extra sales needed to cover it"
        />
      </div>

      {/* The two that only make sense for ad money, shown only when there is
          ad money. A ROAS of ∞ on a ₱0 spend is not a good result. */}
      {result.roas !== null && result.breakEvenRoas !== null && (
        <div className="grid grid-cols-2 gap-3">
          <Cell
            label="Per ₱1 of ad money"
            value={`₱${result.roas.toFixed(2)}`}
            note={`Needs ₱${result.breakEvenRoas.toFixed(2)} to break even`}
            tone={result.roas >= result.breakEvenRoas ? "good" : "bad"}
          />
          <Cell
            label="Return"
            value={result.roi === null ? "—" : pct(result.roi)}
            note="Of everything it cost"
            tone={(result.roi ?? 0) >= 0 ? "good" : "bad"}
          />
        </div>
      )}

      {result.cac !== null && (
        <div className="grid grid-cols-2 gap-3">
          <Cell
            label="Cost per new customer"
            value={pesoRound(result.cac)}
            note={`${Math.round(input.newCustomers)} new`}
          />
          <Cell
            label="If the returners buy once more"
            value={`${result.netWithRepeat >= 0 ? "+" : "−"}${pesoRound(Math.abs(result.netWithRepeat))}`}
            note={`${Math.round(input.returned)} came back`}
            tone={result.netWithRepeat >= 0 ? "good" : "bad"}
          />
        </div>
      )}

      <button
        type="button"
        onClick={onSums}
        className="self-start rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800"
      >
        See the calculation →
      </button>
    </div>
  );
}

function Cell({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/50">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-lg font-black tabular-nums sm:text-xl ${
          tone === "good"
            ? "text-jade-700"
            : tone === "bad"
              ? "text-brand-700"
              : "text-ink-950"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-xs text-ink-800/50">{note}</p>}
    </div>
  );
}

/* ── The working ────────────────────────────────────────────────────────── */

type Step = { label: string; value: string; note?: string; total?: boolean };

function Sums({
  input,
  result,
  normal,
  onClose,
}: {
  input: CampaignInput;
  result: CampaignResult;
  normal: ShopNormal;
  onClose: () => void;
}) {
  const m = input.marginRatio;
  const days = Math.round(input.days);
  const forecast = input.duringPerDay === null;

  const cost: Step[] = [
    { label: "Money paid out", value: peso(input.spend, 0) },
    { label: "Giveaways, at what they cost you", value: peso(input.giveawayCost, 0) },
    { label: "Discount given away", value: peso(input.discountGiven, 0) },
    { label: "= What the campaign cost", value: peso(result.totalCost, 0), total: true },
  ];

  const target: Step[] = [
    {
      label: "What it cost",
      value: peso(result.totalCost, 0),
    },
    {
      label: `÷ what's left of each peso after ingredients`,
      value: `${Math.round(m * 100)}%`,
      note: "Because extra sales are not extra money — the ingredients still had to be bought.",
    },
    {
      label: "= Extra sales needed to break even",
      value: peso(result.breakEvenSales, 0),
      total: true,
    },
    {
      label: `÷ ${days} trading day${days === 1 ? "" : "s"}`,
      value: peso(result.breakEvenPerDay, 0),
      note: "The number to judge each day against.",
    },
  ];

  const lift: Step[] = forecast
    ? []
    : [
        {
          label: "A day while it ran",
          value: peso(input.duringPerDay ?? 0, 0),
        },
        {
          label: "− a usual day before it",
          value: peso(input.baselinePerDay, 0),
          note:
            normal.baselinePerDay > 0
              ? `Your median trading day over the last ${normal.days} of them.`
              : undefined,
        },
        {
          label: "= extra, per day",
          value: peso((input.duringPerDay ?? 0) - input.baselinePerDay, 0),
        },
        {
          label: `× ${days} trading day${days === 1 ? "" : "s"}`,
          value: peso(result.extraSales, 0),
          note: "This is the campaign's doing. The rest of the week's takings are not.",
        },
        {
          label: `× ${Math.round(m * 100)}% margin`,
          value: peso(result.extraProfit, 0),
          note: "What was actually kept out of those extra sales.",
        },
        {
          label: "− what the campaign cost",
          value: peso(result.totalCost, 0),
        },
        {
          label: result.net >= 0 ? "= Money made" : "= Money lost",
          value: peso(result.net, 0),
          total: true,
        },
      ];

  const discountRatio =
    input.discountGiven > 0 && input.baselinePerDay > 0 && days > 0
      ? input.discountGiven / (input.baselinePerDay * days + input.discountGiven)
      : 0;
  const needed = discountRatio > 0 ? discountLift(m, discountRatio) : null;

  return (
    <AdminDialog
      title="How this number comes up"
      subtitle="Every step, in order. If one of these looks wrong, that's the box to change."
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        <Block title="What it cost" steps={cost} />
        <Block
          title={forecast ? "What it has to bring in" : "What it had to bring in"}
          steps={target}
        />
        {!forecast && <Block title="What it actually did" steps={lift} />}

        {result.swings !== null && !forecast && (
          <p className="rounded-2xl bg-cream-100 px-4 py-3 text-sm leading-relaxed text-ink-800/70 ring-1 ring-ink-950/10">
            <strong className="text-ink-950">Is it real?</strong> Your takings
            move about {pesoRound(normal.dailySwing)} a day on their own, with
            no campaign at all. This one moved them{" "}
            {pesoRound(Math.abs((input.duringPerDay ?? 0) - input.baselinePerDay))} —{" "}
            <strong className="text-ink-950">
              {Math.abs(result.swings).toFixed(1)}×
            </strong>{" "}
            an ordinary day&apos;s swing.{" "}
            {Math.abs(result.swings) < 1
              ? "That is inside the noise, so it could just as easily have been a good week. Run it longer or bigger before you decide anything from it."
              : "That is bigger than the shop's ordinary wobble, so it is worth believing."}
          </p>
        )}

        {needed !== null && needed > 0 && (
          <p className="rounded-2xl bg-gold-400/20 px-4 py-3 text-sm leading-relaxed text-ink-800/80">
            <strong className="text-ink-950">About that discount.</strong> Money
            off does not cost cash — it costs margin, and it costs it on the
            people who would have bought anyway. At roughly{" "}
            {Math.round(discountRatio * 100)}% off a {Math.round(m * 100)}%
            margin, the shop needs{" "}
            <strong className="text-ink-950">{Math.round(needed * 100)}% more sales</strong>{" "}
            just to end up exactly where it started.
          </p>
        )}
        {needed === null && input.discountGiven > 0 && (
          <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm leading-relaxed text-ink-800/80 ring-1 ring-brand-600/25">
            <strong className="text-ink-950">That discount is past your margin.</strong>{" "}
            Every sale at it loses money, so selling twice as many loses twice
            as much. No amount of extra volume fixes this one — the price is
            the thing to change.
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800"
          >
            Got it
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

function Block({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-ink-800/55">
        {title}
      </p>
      <div className="rounded-2xl bg-cream-100 px-4 py-2 ring-1 ring-ink-950/10">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`flex items-baseline justify-between gap-4 py-2 ${
              i < steps.length - 1 ? "border-b border-ink-950/5" : ""
            } ${s.total ? "border-t-2 border-t-ink-950/15" : ""}`}
          >
            <span
              className={`min-w-0 text-sm ${
                s.total ? "font-bold text-ink-950" : "text-ink-800/75"
              }`}
            >
              {s.label}
              {s.note && (
                <span className="mt-0.5 block text-xs text-ink-800/45">{s.note}</span>
              )}
            </span>
            <span
              className={`shrink-0 font-display tabular-nums ${
                s.total ? "text-lg font-black text-ink-950" : "font-bold text-ink-800/80"
              }`}
            >
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── What has been tried before ─────────────────────────────────────────── */

function Past({
  rows,
  normal,
  onEdit,
}: {
  rows: CampaignRow[];
  normal: ShopNormal;
  onEdit: (row: CampaignRow) => void;
}) {
  const [busy, startBusy] = useTransition();

  return (
    <div className="mt-7 border-t border-ink-950/10 pt-6">
      <p className="mb-3 text-[11px] font-black uppercase tracking-widest text-ink-800/55">
        What you&apos;ve tried
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const r = evaluateCampaign({
            kind: row.kind,
            spend: Number(row.spend),
            giveawayCost: Number(row.giveaway_cost),
            discountGiven: Number(row.discount_given),
            days: row.days,
            baselinePerDay: Number(row.baseline_per_day),
            duringPerDay: row.during_per_day === null ? null : Number(row.during_per_day),
            marginRatio: Number(row.margin_ratio),
            newCustomers: row.new_customers,
            returned: row.returned,
            avgOrderValue: normal.avgOrderValue,
            dailySwing: normal.dailySwing,
          });
          const copy = VERDICT_COPY[r.verdict];
          return (
            <li
              key={row.id}
              className="rounded-2xl bg-cream-50 p-4 ring-1 ring-ink-950/10"
            >
              {/* Stacked on a phone and in a row from `sm` up. Squeezing the
                  badge, the name, the figure and two buttons onto one line at
                  430px truncated every name to two letters — a list of
                  campaigns nobody can tell apart is not a record. */}
              <div className="flex items-start gap-3">
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                    copy.tone === "good"
                      ? "bg-jade-600 text-cream-50"
                      : copy.tone === "bad"
                        ? "bg-brand-600 text-cream-50"
                        : "bg-gold-400 text-ink-950"
                  }`}
                >
                  {copy.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink-950">
                    {row.name}
                  </span>
                  <span className="text-xs text-ink-800/55">
                    {KIND_LABEL[row.kind]} · {formatDate(row.started_on)} ·{" "}
                    {row.days} day{row.days === 1 ? "" : "s"}
                  </span>
                </span>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span
                    className={`font-display text-lg font-black tabular-nums ${
                      r.verdict === "forecast"
                        ? "text-ink-800/50"
                        : r.net >= 0
                          ? "text-jade-700"
                          : "text-brand-700"
                    }`}
                  >
                    {r.verdict === "forecast"
                      ? "Not run yet"
                      : `${r.net >= 0 ? "+" : "−"}${pesoRound(Math.abs(r.net))}`}
                  </span>
                  <span className="ml-2 text-xs text-ink-800/45">
                    cost {pesoRound(r.totalCost)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="rounded-lg bg-ink-950/5 px-3 py-1.5 text-xs font-bold text-ink-800 hover:bg-ink-950/10"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startBusy(async () => void (await deleteCampaign(row.id)))}
                    className="rounded-lg px-2 py-1.5 text-xs font-bold text-ink-800/45 hover:text-brand-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
