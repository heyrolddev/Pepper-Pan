"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { AdminDialog } from "@/components/admin-dialog";
import { PencilIcon, TrashIcon } from "@/components/icons";
import { suggestGrouping } from "@/lib/menu-grouping";
import {
  deleteProductGroup,
  saveProductGroup,
} from "@/app/admin/menu/product-actions";
import type { AdminMeal } from "@/components/meal-editor";
import {
  BandButton,
  Panel,
  PanelBand,
  PanelBody,
  PreviewBand,
  RailRow,
  Stat,
  StatDot,
  Step,
  Steps,
} from "@/components/hq-panel";

/**
 * Turning several dishes into one menu card.
 *
 * "16oz Iced Spanish Latte" and "22oz Iced Spanish Latte" are two dishes to
 * the kitchen and one thing to a customer. This is where the owner says so.
 *
 * ── Nothing here is destructive, and the copy has to keep saying it ──────
 *
 * A screen that turns four menu items into one looks exactly like a screen
 * that deletes three of them. It does not: every dish keeps its own price,
 * recipe, cost, stock and sales history, and ungrouping puts all four back on
 * the menu as they were. The buttons lean on that being true and the labels
 * say it out loud, because the owner has no way to check before pressing.
 *
 * ── Why the form arrives already filled in ───────────────────────────────
 *
 * Because forty dishes is forty forms, and a setup job nobody finishes is a
 * feature that does not exist. The names already say what the answers are —
 * `suggestGrouping` reads them back — and the owner corrects the one it got
 * wrong instead of typing all three boxes. Same show-then-do shape as the
 * take-out merge panel further down this screen.
 */

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  members: { mealId: string; options: Record<string, string> }[];
};

type Draft = {
  id?: string;
  name: string;
  description: string;
  isActive: boolean;
  axes: string[];
  /** mealId → axis → value. */
  values: Record<string, Record<string, string>>;
  members: string[];
};

const field =
  "w-full rounded-xl border-2 border-ink-950/15 bg-cream-50 px-3 py-2 text-sm text-ink-950 outline-none transition-colors focus:border-brand-600";

/** Enough that a real search is never cut short, few enough to stay readable. */
const SEARCH_SHOWN = 24;

export function ProductGroups({
  groups,
  meals,
}: {
  groups: GroupRow[];
  meals: AdminMeal[];
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const byId = useMemo(() => new Map(meals.map((m) => [m.id, m])), [meals]);
  const inAGroup = useMemo(
    () => new Set(groups.flatMap((g) => g.members.map((m) => m.mealId))),
    [groups]
  );

  function openNew() {
    setDraft({
      name: "",
      description: "",
      isActive: true,
      axes: ["Size"],
      values: {},
      members: [],
    });
  }

  function openExisting(g: GroupRow) {
    const axes: string[] = [];
    for (const m of g.members) {
      for (const k of Object.keys(m.options)) if (!axes.includes(k)) axes.push(k);
    }
    setDraft({
      id: g.id,
      name: g.name,
      description: g.description ?? "",
      isActive: g.is_active,
      axes: axes.length > 0 ? axes : ["Size"],
      values: Object.fromEntries(g.members.map((m) => [m.mealId, { ...m.options }])),
      members: g.members.map((m) => m.mealId),
    });
  }

  // Live cards, and how many dishes they stand in front of — the figure the
  // panel exists to move. A menu of 72 loose cards and one of 72 dishes under
  // 40 cards are very different menus to scroll.
  const live = groups.filter((g) => g.is_active);
  const grouped = live.reduce((n, g) => n + g.members.length, 0);

  return (
    <Panel>
      <PanelBand
        title="Menu"
        accent="cards"
        lead={
          <>
            Two sizes of the same drink are two dishes here and one thing to a
            customer. Group them and the menu shows one card that opens — the
            sizes, the prices and a photo of each — instead of two cards with
            the same picture.
          </>
        }
        stats={
          groups.length > 0 && (
            <>
              <Stat n={live.length}>{live.length === 1 ? "card" : "cards"}</Stat>
              <StatDot />
              <span>standing in for</span>
              <Stat n={grouped}>dishes</Stat>
              <StatDot />
              {/* The reassurance, in the one place the owner looks before
                  pressing something that looks destructive. */}
              <span className="font-normal text-cream-100/45">
                nothing is merged or deleted
              </span>
            </>
          )
        }
        action={<BandButton onClick={openNew}>+ Group dishes</BandButton>}
      />

      <PanelBody>
        {groups.length === 0 ? (
          <div className="rounded-2xl bg-cream-50 p-5 ring-1 ring-ink-950/10">
            <p className="font-display text-lg font-black text-ink-950">
              Nothing grouped yet — every dish is its own card.
            </p>
            <p className="mt-1 text-sm text-ink-800/65">
              Which is fine. It is worth doing for the ones that come in sizes,
              or with and without cheese.
            </p>
            <Steps
              items={[
                <>
                  Press <strong>Group dishes</strong> and search for the two or
                  three that are really one thing — &ldquo;16oz&rdquo; and
                  &ldquo;22oz&rdquo; of the same drink.
                </>,
                <>
                  Name the card what a customer would call it, and say which
                  way of having it each dish is. The form fills itself in from
                  the names you already use.
                </>,
              ]}
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => {
              const photo =
                g.image_url ?? byId.get(g.members[0]?.mealId)?.image_url;
              // Green is on the menu, grey is switched off — the same rail
              // language as the add-ons panel below, meaning the same thing.
              const tone = g.is_active
                ? { rail: "bg-jade-600", ring: "ring-jade-600/20" }
                : { rail: "bg-ink-950/20", ring: "ring-ink-950/10" };

              return (
                <RailRow
                  key={g.id}
                  rail={tone.rail}
                  ring={tone.ring}
                  dimmed={!g.is_active}
                >
                  <div className="flex items-start gap-3">
                    {/* The photograph, because the card IS a photograph to a
                        customer, and the commonest mistake here is grouping
                        two dishes whose pictures do not match. */}
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-ink-950/10">
                      {photo ? (
                        <Image
                          src={photo}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center font-display text-lg font-black text-ink-950/15">
                          {(g.name.match(/[a-zA-Z0-9]/)?.[0] ?? "?").toUpperCase()}
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-lg font-black text-ink-950">
                          {g.name}
                        </span>
                        <span className="rounded-full bg-jade-600/12 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide tabular-nums text-jade-700">
                          {g.members.length} ways
                        </span>
                        {!g.is_active && (
                          <span className="rounded-full bg-ink-950 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-cream-50">
                            off
                          </span>
                        )}
                      </p>

                      {/* The chips the customer will tap, not a comma list.
                          Same treatment as an add-on's answers, because they
                          are the same thing on screen: the ways of having it. */}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {g.members.map((m) => (
                          <span
                            key={m.mealId}
                            className="max-w-[16rem] truncate rounded-full bg-cream-100 px-3 py-1 text-xs font-bold text-ink-950 ring-1 ring-ink-950/10"
                          >
                            {Object.values(m.options).join(" · ") ||
                              byId.get(m.mealId)?.name ||
                              "?"}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => openExisting(g)}
                      aria-label={`Edit ${g.name}`}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-950/5 text-ink-800 transition-colors hover:bg-ink-950 hover:text-cream-50"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                  </div>
                </RailRow>
              );
            })}
          </ul>
        )}
      </PanelBody>

      {draft && (
        <GroupDialog
          draft={draft}
          setDraft={setDraft}
          meals={meals}
          // Every OTHER card's name, so the dialog can say when this one is
          // about to become a second card with the same name on the menu.
          otherNames={groups
            .filter((g) => g.id !== draft.id)
            .map((g) => ({ id: g.id, name: g.name }))}
          // A dish can only be on one card. Its own group's members stay
          // pickable so editing does not have to start from nothing.
          takenBy={inAGroup}
          onClose={() => setDraft(null)}
        />
      )}
    </Panel>
  );
}

function GroupDialog({
  draft,
  setDraft,
  meals,
  otherNames,
  takenBy,
  onClose,
}: {
  draft: Draft;
  setDraft: (d: Draft | null) => void;
  meals: AdminMeal[];
  otherNames: { id: string; name: string }[];
  takenBy: Set<string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const byId = useMemo(() => new Map(meals.map((m) => [m.id, m])), [meals]);
  const chosen = draft.members;

  /**
   * What the search offers, and what it is leaving out.
   *
   * It was a bare `.slice(0, 8)`. On a menu with eight Solo Jipai variants it
   * showed exactly eight and stopped, with nothing on screen to say there
   * were more — so a dish that existed, matched, and was free to be added
   * simply could not be found, and the search looked broken rather than full.
   *
   * Two different reasons a match can be missing, and they need different
   * answers from the owner, so they are counted separately: there are more
   * than fit (type a bit more), or it is already on another card (take it off
   * that one first).
   */
  const found = useMemo(() => {
    /**
     * Every word, in any order — the rule `AdminSearch` uses on every other
     * list in HQ.
     *
     * This one asked for the whole query as one contiguous run, so "jipai
     * solo" found nothing while "solo jipai" worked, and "solo jipai cheese"
     * found nothing at all even though "Solo Jipai w/cheese (Original)" is
     * sitting right there. Two search boxes on the same screen behaving
     * differently is worse than either rule on its own: whichever one you
     * learn, the other one is broken.
     */
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (name: string) => {
      const n = name.toLowerCase();
      return terms.every((t) => n.includes(t));
    };
    const matching = meals
      .filter((m) => !chosen.includes(m.id))
      /**
       * A dish that is not on the menu cannot be one of the customer's
       * choices, so offering it here only ever builds a card that does not
       * work — which is the very thing the warning below this list exists to
       * explain. Not offering it is better than explaining it afterwards.
       *
       * It also clears out the "(T.O)" twins, which is most of what was
       * cluttering this search: they were hidden by the take-out merge and
       * are never coming back to the menu.
       */
      .filter((m) => m.is_public)
      .filter((m) => terms.length === 0 || hit(m.name));
    // A dish already in THIS draft stays offerable, so editing a card does
    // not have to start from nothing.
    const free = matching.filter((m) => !takenBy.has(m.id) || draft.values[m.id]);
    return {
      shown: free.slice(0, SEARCH_SHOWN),
      more: Math.max(0, free.length - SEARCH_SHOWN),
      elsewhere: matching.length - free.length,
    };
  }, [meals, chosen, takenBy, draft.values, query]);

  function addMeal(id: string) {
    const members = [...chosen, id];
    const names = members.map((x) => byId.get(x)?.name ?? "");
    const guess = suggestGrouping(names);

    setDraft({
      ...draft,
      members,
      // Only ever fills what is still empty. Overwriting a name the owner
      // typed because they then added a fourth dish is the software arguing
      // with them.
      name: draft.name.trim() || guess?.productName || "",
      axes: guess && draft.axes.length === 1 && !draft.axes[0].trim()
        ? [guess.axis]
        : draft.axes,
      values: {
        ...draft.values,
        ...(guess
          ? Object.fromEntries(
              members.map((mealId, i) => [
                mealId,
                {
                  ...draft.values[mealId],
                  [draft.axes[0] || guess.axis]:
                    draft.values[mealId]?.[draft.axes[0] || guess.axis] ||
                    guess.values[i],
                },
              ])
            )
          : { [id]: draft.values[id] ?? {} }),
      },
    });
  }

  function removeMeal(id: string) {
    const values = { ...draft.values };
    delete values[id];
    setDraft({ ...draft, members: chosen.filter((x) => x !== id), values });
  }

  function move(id: string, by: number) {
    const i = chosen.indexOf(id);
    const j = i + by;
    if (j < 0 || j >= chosen.length) return;
    const next = [...chosen];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft({ ...draft, members: next });
  }

  function setValue(mealId: string, axis: string, value: string) {
    setDraft({
      ...draft,
      values: { ...draft.values, [mealId]: { ...draft.values[mealId], [axis]: value } },
    });
  }

  function setAxis(i: number, name: string) {
    const was = draft.axes[i];
    const axes = draft.axes.map((a, k) => (k === i ? name : a));
    // Renaming a choice carries the values across. Without this, changing
    // "Option" to "Size" empties every dish's value and the whole card has to
    // be filled in again.
    const values = Object.fromEntries(
      Object.entries(draft.values).map(([mealId, v]) => {
        const next = { ...v };
        if (was in next) {
          next[name] = next[was];
          if (was !== name) delete next[was];
        }
        return [mealId, next];
      })
    );
    setDraft({ ...draft, axes, values });
  }

  /**
   * Another card already called this.
   *
   * Not blocked, because two cards with one name is legal and might even be
   * deliberate — but it is almost never what happened. What happened is the
   * owner opened the wrong card and typed over its name, and then could not
   * find the old one on the menu, because it is now sitting next to an
   * identical twin. That was reported as "renaming breaks it": nothing broke,
   * the card just stopped being findable by the name it used to have.
   *
   * Case- and space-insensitive, since "Pork Rice" and "pork  rice" are the
   * same name to everyone except a string comparison.
   */
  const tidy = (x: string) => x.trim().replace(/\s+/g, " ").toLowerCase();
  const clash = otherNames.find((g) => tidy(g.name) === tidy(draft.name) && tidy(draft.name));

  const missing = chosen.filter((id) =>
    draft.axes.some((a) => a.trim() && !(draft.values[id]?.[a.trim()] ?? "").trim())
  );
  const ready =
    draft.name.trim() !== "" && chosen.length >= 2 && missing.length === 0 && !busy;

  function save() {
    setError(null);
    start(async () => {
      const r = await saveProductGroup({
        id: draft.id,
        name: draft.name,
        description: draft.description,
        isActive: draft.isActive,
        members: chosen.map((mealId) => ({
          mealId,
          options: Object.fromEntries(
            draft.axes
              .map((a) => a.trim())
              .filter(Boolean)
              .map((a) => [a, (draft.values[mealId]?.[a] ?? "").trim()])
          ),
        })),
      });
      if (r.error) return setError(r.error);
      setDraft(null);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const r = await deleteProductGroup(draft.id!);
      if (r.error) return setError(r.error);
      setDraft(null);
      router.refresh();
    });
  }

  return (
    <AdminDialog
      wide
      title={draft.id ? "Edit this menu card" : "Group dishes into one card"}
      subtitle="The dishes stay exactly as they are. This only changes how they're shown on the menu."
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
            {error}
          </p>
        )}

        {/* ---- which dishes ---- */}
        <Step
          n={1}
          title="Dishes on this card"
          hint="Two or more that are really one thing to a customer."
        >
          {chosen.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-brand-300 bg-cream-100 px-4 py-3 text-sm text-ink-800/60">
              Pick two or more — the sizes of one drink, or a dish with and
              without cheese.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {chosen.map((id, i) => (
                /* Two rows, not one that wraps.
                   
                   One wrapping row put the value box on its own line and then
                   dropped the delete button below THAT, so every dish was
                   three lines tall and the order arrows ended up nowhere near
                   the thing they move. Name and controls on top, values
                   underneath, and it holds for one choice or three. */
                <li
                  key={id}
                  className="rounded-xl bg-cream-100 p-2.5 ring-1 ring-ink-950/10"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex shrink-0 flex-col">
                      <Nudge label="Move up" onClick={() => move(id, -1)} dim={i === 0}>
                        ▴
                      </Nudge>
                      <Nudge
                        label="Move down"
                        onClick={() => move(id, 1)}
                        dim={i === chosen.length - 1}
                      >
                        ▾
                      </Nudge>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-950">
                      {byId.get(id)?.name ?? id}
                      <span className="ml-2 text-xs font-normal text-ink-800/50">
                        ₱{Number(byId.get(id)?.price ?? 0).toFixed(2)}
                      </span>
                      {/* A hidden dish is not on the menu, so it is not one of
                          the customer's choices either — and the card says
                          nothing about it. Labelled here because this is the
                          only screen where the two facts sit together. */}
                      {byId.get(id)?.is_public === false && (
                        <span className="ml-2 rounded-full bg-ink-950/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink-800/60">
                          Hidden
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => removeMeal(id)}
                      aria-label={`Take ${byId.get(id)?.name ?? "this dish"} off the card`}
                      className="shrink-0 rounded-lg p-2 text-ink-800/45 hover:bg-brand-600/10 hover:text-brand-600"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                    {draft.axes
                      .map((a) => a.trim())
                      .filter(Boolean)
                      .map((axis) => (
                        <input
                          key={axis}
                          value={draft.values[id]?.[axis] ?? ""}
                          onChange={(e) => setValue(id, axis, e.target.value)}
                          placeholder={axis}
                          aria-label={`${axis} for ${byId.get(id)?.name ?? id}`}
                          className={`${field} w-32`}
                        />
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a dish to add…"
            className={`${field} mt-2`}
          />
          {query.trim() !== "" && (
            <div className="mt-1.5 flex flex-col gap-1.5">
              {found.shown.length === 0 ? (
                <p className="text-xs text-ink-800/50">
                  Nothing else matches that.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {found.shown.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        addMeal(m.id);
                        setQuery("");
                      }}
                      className="rounded-full bg-ink-950/5 px-3 py-1.5 text-xs font-bold text-ink-800 hover:bg-ink-950/10"
                    >
                      + {m.name}
                    </button>
                  ))}
                </div>
              )}
              {(found.more > 0 || found.elsewhere > 0) && (
                <p className="text-xs text-ink-800/50">
                  {found.more > 0 && (
                    <>
                      {found.more} more match{found.more === 1 ? "es" : ""} — type
                      a bit more to narrow it down.{" "}
                    </>
                  )}
                  {found.elsewhere > 0 && (
                    <>
                      {found.elsewhere}{" "}
                      {found.elsewhere === 1 ? "is" : "are"} already on another
                      card, and {found.elsewhere === 1 ? "has" : "have"} to be
                      taken off that one first.
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </Step>

        {/* ---- what the choice is called ---- */}
        <Step
          n={2}
          title="What the customer is choosing"
          hint="One row of buttons per choice — Size, Flavour, Cheese."
        >
          <div className="flex flex-wrap gap-2">
            {draft.axes.map((axis, i) => (
              <span key={i} className="flex items-center gap-1">
                <input
                  value={axis}
                  onChange={(e) => setAxis(i, e.target.value)}
                  placeholder="Size"
                  aria-label={`Name of choice ${i + 1}`}
                  className={`${field} w-32`}
                />
                {draft.axes.length > 1 && (
                  <button
                    onClick={() =>
                      setDraft({ ...draft, axes: draft.axes.filter((_, k) => k !== i) })
                    }
                    aria-label={`Remove the ${axis || "unnamed"} choice`}
                    className="rounded-lg p-2 text-ink-800/45 hover:text-brand-600"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
              </span>
            ))}
            <button
              onClick={() => setDraft({ ...draft, axes: [...draft.axes, ""] })}
              className="rounded-xl bg-ink-950/5 px-3 py-2 text-xs font-bold text-ink-800 hover:bg-ink-950/10"
            >
              + Another choice
            </button>
          </div>
          <p className="mt-1.5 text-xs text-ink-800/45">
            Two choices — Flavour and Cheese — give four combinations, and only
            the ones that exist as dishes can be picked.
          </p>
        </Step>

        {/* ---- the card itself ---- */}
        <Step
          n={3}
          title="The card itself"
          hint="What a customer reads on the menu, before they open it."
        >
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
              Card name
            </span>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Iced Spanish Latte"
              className={field}
            />
          </label>
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
              Description (optional)
            </span>
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Leave blank to use the first dish's"
              className={field}
            />
          </label>
        </div>

        <button
          onClick={() => setDraft({ ...draft, isActive: !draft.isActive })}
          className={`mt-3 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
            draft.isActive ? "bg-jade-600 text-cream-50" : "bg-ink-950/10 text-ink-800"
          }`}
        >
          {draft.isActive ? "✓ Grouped on the menu" : "Off — shown as separate cards"}
        </button>
        </Step>

        {/* ── the preview ───────────────────────────────────────────────
            The same dark strip the add-ons editor ends with, answering the
            same question: this is the card, and this is the row of buttons
            behind it. A card is a thing the owner cannot see until it is
            saved and the website is open beside them. */}
        <PreviewBand>
          <>
            <p className="font-display text-lg font-black leading-tight text-ink-950">
              {draft.name.trim() || "Your card"}
            </p>
            {(draft.description.trim() ||
              byId.get(chosen[0])?.description) && (
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-800/60">
                {draft.description.trim() ||
                  byId.get(chosen[0])?.description}
              </p>
            )}

            {/* Priced the way the card is: "from ₱75" only when the ways of
                having it cost different money, which is the rule the menu
                itself follows. */}
            {chosen.length > 0 && (
              <p className="mt-1 font-display text-base font-black text-brand-600">
                {(() => {
                  const prices = chosen
                    .map((id) => Number(byId.get(id)?.price ?? 0))
                    .filter((n) => Number.isFinite(n));
                  if (prices.length === 0) return null;
                  const lo = Math.min(...prices);
                  const hi = Math.max(...prices);
                  return (
                    <>
                      {lo !== hi && (
                        <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-ink-800/50">
                          from
                        </span>
                      )}
                      ₱{lo.toFixed(2)}
                    </>
                  );
                })()}
              </p>
            )}

            {draft.axes.filter((a) => a.trim()).length === 0 ? (
              <p className="mt-2 text-xs text-ink-800/40">
                Nothing to choose from yet.
              </p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {draft.axes
                  .filter((a) => a.trim())
                  .map((axis) => {
                    const values: string[] = [];
                    for (const id of chosen) {
                      const v = (draft.values[id]?.[axis.trim()] ?? "").trim();
                      if (v && !values.includes(v)) values.push(v);
                    }
                    return (
                      <div key={axis}>
                        <p className="text-[10px] font-black uppercase tracking-widest text-ink-800/45">
                          {axis}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {values.length === 0 ? (
                            <span className="text-xs text-ink-800/40">
                              No values filled in yet.
                            </span>
                          ) : (
                            values.map((v, i) => (
                              <span
                                key={v}
                                className={`rounded-xl border-2 px-3 py-1.5 text-xs font-bold ${
                                  // The first is drawn selected, because that
                                  // is what the dish dialog opens on.
                                  i === 0
                                    ? "border-ink-950 bg-ink-950 text-cream-50"
                                    : "border-ink-950/15 bg-cream-100 text-ink-950"
                                }`}
                              >
                                {v}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </>
        </PreviewBand>

        {/**
          * The one that looks like a broken feature.
          *
          * The customer's menu only ever sees dishes that are ON it, so a
          * hidden dish is silently not one of the choices. Hide one of a pair
          * and the card is left with a single option — and a row of buttons
          * with one button in it is not a choice, so the whole row disappears.
          * On the menu that reads as "the flavours stopped working", with the
          * card in HQ looking perfectly correct, which is exactly how it was
          * reported.
          */}
        {chosen.length >= 2 &&
          chosen.filter((id) => byId.get(id)?.is_public !== false).length < 2 && (
            <p className="rounded-xl bg-gold-50 px-4 py-2.5 text-sm text-ink-800/80 ring-1 ring-gold-400/40">
              Only{" "}
              {chosen.filter((id) => byId.get(id)?.is_public !== false).length} of
              these {chosen.length} dishes is shown on the menu — the rest are
              hidden. A customer needs at least two to have anything to choose
              between, so the buttons will not appear at all. Un-hide them on
              the dish list below.
            </p>
          )}

        {clash && (
          <p className="rounded-xl bg-gold-50 px-4 py-2.5 text-sm text-ink-800/80 ring-1 ring-gold-400/40">
            Another menu card is already called{" "}
            <strong>“{clash.name}”</strong>. Save this and the menu shows two
            cards with the same name, which is usually a sign the wrong card
            got opened — check the dishes listed above are the ones you meant.
          </p>
        )}

        {missing.length > 0 && chosen.length >= 2 && (
          <p className="rounded-xl bg-gold-50 px-4 py-2.5 text-sm text-ink-800/80 ring-1 ring-gold-400/40">
            {missing.length} dish{missing.length === 1 ? "" : "es"} still need a
            value for every choice — a blank one would be a button with nothing
            written on it.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-950/10 pt-4">
          {draft.id ? (
            confirmDelete ? (
              <span className="flex items-center gap-2">
                <button
                  onClick={remove}
                  disabled={busy}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-cream-50 disabled:opacity-50"
                >
                  Ungroup — put them back as separate cards
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm font-semibold text-ink-800/60 hover:text-ink-950"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-sm font-bold text-brand-600 hover:underline"
              >
                Ungroup
              </button>
            )
          ) : (
            <span />
          )}

          <button
            onClick={save}
            disabled={!ready}
            className="rounded-xl bg-ink-950 px-5 py-2.5 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800 disabled:opacity-40"
          >
            {busy ? "Saving…" : draft.id ? "Save card" : "Make it one card"}
          </button>
        </div>
      </div>
    </AdminDialog>
  );
}

function Nudge({
  label,
  onClick,
  dim,
  children,
}: {
  label: string;
  onClick: () => void;
  dim: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={dim}
      className="px-1 text-[11px] leading-none text-ink-800/45 hover:text-ink-950 disabled:opacity-25"
    >
      {children}
    </button>
  );
}
