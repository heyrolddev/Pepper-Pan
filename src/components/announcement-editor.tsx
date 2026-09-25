"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveAnnouncement,
  toggleAnnouncement,
  deleteAnnouncement,
  reorderAnnouncement,
  togglePinned,
  setPlacement,
} from "@/app/admin/promos/actions";
import {
  KIND_ADD,
  KIND_BLURB,
  KIND_NEW_TITLE,
  KIND_PLURAL,
  HOME_LIMIT,
  homeStateOf,
  liveStateOf,
  STATE_TONE,
  stripItems,
  PLACEMENT_LABEL,
  PLACEMENT_HELP,
  type Announcement,
  type AnnouncementKind,
  type Placement,
} from "@/lib/announcements";
import { MediaField } from "@/components/media-field";
import { TrashIcon } from "@/components/icons";

/**
 * Promos and news, from the shop's own account.
 *
 * The homepage's scrolling strip was five strings in the source. Changing one
 * meant a code change and a deploy, which for a stall running a fortnight-long
 * promo is not a workflow — it is a reason not to run promos at all.
 *
 * The screen is built around the two questions that actually get asked: is it
 * on the homepage right now, and when does it come off. Everything else is
 * secondary, so the state chip sits on the row rather than inside the editor,
 * and the scrolling strip is previewed live at the top — the strip is the
 * thing being edited, and editing it as a list of rows without seeing it is
 * how you end up with seven promos scrolling past nobody can read.
 */
export function AnnouncementEditor({ rows }: { rows: Announcement[] }) {
  const [editing, setEditing] = useState<Announcement | `new-${AnnouncementKind}` | null>(
    null
  );
  const promos = rows.filter((r) => r.kind === "promo");
  const news = rows.filter((r) => r.kind === "news");
  const dineIn = rows.filter((r) => r.kind === "dine_in");
  const comingSoon = rows.filter((r) => r.kind === "coming_soon");
  const story = rows.filter((r) => r.kind === "story");
  const livePromos = promos.filter((p) => liveStateOf(p) === "live");

  return (
    <div className="flex flex-col gap-8">
      {/* What the customer sees, as they see it. */}
      <div>
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-ink-800/40">
          On the homepage right now
        </p>
        <div className="overflow-hidden rounded-2xl border-y-4 border-ink-950 bg-brand-600 py-3">
          <p className="line-clamp-2 px-5 font-display text-lg font-black uppercase tracking-tight text-cream-50">
            {stripItems(livePromos).join("  🌶  ")}
          </p>
        </div>
        {livePromos.length === 0 && (
          <p className="mt-1.5 text-xs text-ink-800/50">
            No promo is running, so the strip shows the shop&apos;s usual lines.
            Add one below and it replaces them.
          </p>
        )}
      </div>

      <Section
        kind="promo"
        rows={promos}
        all={rows}
        onAdd={() => setEditing("new-promo")}
        onEdit={setEditing}
      />
      <Section
        kind="news"
        rows={news}
        all={rows}
        onAdd={() => setEditing("new-news")}
        onEdit={setEditing}
      />
      <Section
        kind="dine_in"
        rows={dineIn}
        all={rows}
        onAdd={() => setEditing("new-dine_in")}
        onEdit={setEditing}
      />
      <Section
        kind="coming_soon"
        rows={comingSoon}
        all={rows}
        onAdd={() => setEditing("new-coming_soon")}
        onEdit={setEditing}
      />
      {/* Last, because it is the only one here that is not the shop SAYING
          something. It is the only place in HQ that can change a picture on
          the homepage, though, which is why it lives on this screen rather
          than getting a tab of its own for two fields. */}
      <Section
        kind="story"
        rows={story}
        all={rows}
        onAdd={() => setEditing("new-story")}
        onEdit={setEditing}
      />

      {editing && (
        <Editor
          key={typeof editing === "string" ? editing : editing.id}
          existing={typeof editing === "string" ? null : editing}
          kind={
            typeof editing === "string"
              ? (editing.slice(4) as AnnouncementKind)
              : editing.kind
          }
          onDone={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function Section({
  kind,
  rows,
  all,
  onAdd,
  onEdit,
}: {
  kind: AnnouncementKind;
  rows: Announcement[];
  all: Announcement[];
  onAdd: () => void;
  onEdit: (a: Announcement) => void;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-black text-ink-950">
            {KIND_PLURAL[kind]}
          </h3>
          <p className="mt-0.5 max-w-xl text-sm text-ink-800/60">{KIND_BLURB[kind]}</p>
          <p className="mt-1 max-w-xl text-xs text-ink-800/45">
            {/* Two kinds do not mention the star. The deck has a slot per
                photograph, so there is nothing to pick between. Promos answer
                the question outright now, on the row — "pin one with ★" was
                describing the card's on switch as though it were a sort
                order, which is the confusion this whole control replaces. */}
            {kind === "story" ? (
              <>
                Up to {HOME_LIMIT[kind]} are dealt into the deck, in this order.
                Switch one off to keep it without showing it.
              </>
            ) : kind === "promo" ? (
              <>
                Each one says for itself whether it scrolls across the top,
                shows as a card, or both. Up to {HOME_LIMIT[kind]} cards fit on
                the homepage, in this order — the rest stay on All news &amp;
                promos. A card needs a description or a picture; the strip only
                needs the title.
              </>
            ) : (
              <>
                {HOME_LIMIT[kind] === 1
                  ? "One shows on the homepage."
                  : `${HOME_LIMIT[kind]} show on the homepage`}
                {kind === "news"
                  ? ", newest first. Pin one with ★ to hold it at the front."
                  : HOME_LIMIT[kind] === 1
                    ? " Pin one with ★ to choose which."
                    : ", in this order. Pin one with ★ to hold it at the front."}
                {/* Promos have their own branch above and say this there;
                    dine-in and coming-soon have no list to overflow into. */}
                {kind === "news" ? " The rest stay on All news & promos." : ""}
              </>
            )}
          </p>
        </div>
        <button
          onClick={onAdd}
          className="shrink-0 rounded-xl bg-ink-950 px-4 py-2 text-sm font-bold text-cream-50 transition-colors hover:bg-ink-800"
        >
          {KIND_ADD[kind]}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 p-5 text-sm text-ink-800/70">
          Nothing here yet.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((a, i) => (
            <Row
              key={a.id}
              row={a}
              state={homeStateOf(a, all)}
              first={i === 0}
              last={i === rows.length - 1}
              onEdit={() => onEdit(a)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------
 * Where a promo shows
 *
 * A promo has two possible homes and the shop needs to say which: the red
 * strip that scrolls across the top, a card further down, or both. It used to
 * be able to say neither — the strip silently took every live promo, and the
 * card was gated behind a star whose tooltip said it "held this at the
 * front".
 *
 * Three buttons rather than two checkboxes, because two checkboxes can both
 * be cleared and "a live promo that shows nowhere" is not a state worth being
 * able to reach by accident; switching it off already means that, and says so.
 *
 * Both sits in the middle, between the two things it is the sum of, and each
 * button carries a drawing of the thing it puts the promo in — a band, a
 * card, or a band above a card. The label alone would do at desktop width;
 * the icon is what makes the row scannable on the phone the shop runs from.
 * ------------------------------------------------------------------ */
const PLACEMENT_ORDER: Placement[] = ["strip", "both", "home"];

function PlacementIcon({ of }: { of: Placement }) {
  const line = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
  };
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="h-[18px] w-[18px] shrink-0">
      {/* The scrolling band. Dashes rather than a solid line: it is moving
          text, and three unequal runs read as words going past. */}
      {of !== "home" && (
        <>
          <rect
            x="0.8"
            y={of === "both" ? 1.6 : 6}
            width="16.4"
            height={of === "both" ? 4.2 : 6}
            rx="1.4"
            {...line}
          />
          <path
            d={
              of === "both"
                ? "M3.4 3.7h2M7.4 3.7h3M12.6 3.7h2"
                : "M3.4 9h2M7.4 9h3M12.6 9h2"
            }
            {...line}
          />
        </>
      )}
      {/* The card. */}
      {of !== "strip" && (
        <>
          <rect
            x={of === "both" ? 2.8 : 2.4}
            y={of === "both" ? 8.2 : 2.4}
            width={of === "both" ? 12.4 : 13.2}
            height={of === "both" ? 8 : 13.2}
            rx="2"
            {...line}
          />
          <path
            d={
              of === "both"
                ? "M5.4 11.2h7M5.4 13.6h4"
                : "M5.2 7.4h7.6M5.2 10.6h7.6M5.2 13h4.4"
            }
            {...line}
          />
        </>
      )}
    </svg>
  );
}

function PlacementPicker({ row }: { row: Announcement }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const current = row.placement;

  const choose = (next: Placement) => {
    if (next === current || pending) return;
    startTransition(async () => {
      const r = await setPlacement(row.id, next);
      if (r.error) return setError(r.error);
      setError(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-2.5">
      <p className="text-[11px] font-black uppercase tracking-wide text-ink-800/45">
        Where it shows
      </p>
      <div
        role="radiogroup"
        aria-label={`Where "${row.title}" shows`}
        className="mt-1 inline-flex flex-wrap gap-1 rounded-xl bg-ink-950/5 p-1"
      >
        {PLACEMENT_ORDER.map((p) => {
          const on = p === current;
          return (
            <button
              key={p}
              role="radio"
              aria-checked={on}
              disabled={pending}
              onClick={() => choose(p)}
              title={PLACEMENT_HELP[p]}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                on
                  ? "bg-ink-950 text-cream-50"
                  : "text-ink-800/60 hover:bg-ink-950/5 hover:text-ink-900"
              }`}
            >
              <PlacementIcon of={p} />
              {PLACEMENT_LABEL[p]}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-ink-800/50">{PLACEMENT_HELP[current]}</p>
      {error && (
        <p className="mt-1 text-xs font-semibold text-brand-700">{error}</p>
      )}
    </div>
  );
}

function Row({
  row,
  state,
  first,
  last,
  onEdit,
}: {
  row: Announcement;
  state: ReturnType<typeof homeStateOf>;
  first: boolean;
  last: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const tone = STATE_TONE[state];

  const run = (fn: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      const r = await fn();
      if (r.error) return setError(r.error);
      setError(null);
      router.refresh();
    });

  return (
    <li
      className={`rounded-2xl bg-cream-100 p-4 ring-1 ring-ink-950/10 ${
        state === "live" ? "" : "opacity-70"
      }`}
    >
      {/* Stacked on a phone. Four controls beside the text left the title
          about seventy pixels wide, which wrapped "Christmas bundle" to one
          word per line and made the list unreadable on the device the owner
          actually runs the shop from. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {(row.image_url || row.video_url) && (
          <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-ink-950/5 ring-1 ring-ink-950/10">
            {row.video_url ? (
              <video src={row.video_url} className="h-full w-full object-cover" muted preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.image_url!} alt="" className="h-full w-full object-cover" />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-ink-950">{row.title}</span>
            {/* The chip is computed from the same function the homepage
                renders from, so it cannot claim a post is on the homepage
                when the homepage has no room left for it. */}
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${tone.chip}`}
            >
              {tone.label}
            </span>
            {row.pinned && row.kind !== "story" && row.kind !== "promo" && (
              <span className="rounded-full bg-gold-400 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-ink-950">
                ★ Pinned
              </span>
            )}
          </p>
          {row.body && (
            <p className="mt-1 max-w-2xl text-sm text-ink-800/65">{row.body}</p>
          )}
          <Window row={row} />
          {row.kind === "promo" && <PlacementPicker row={row} />}
          {error && (
            <p className="mt-1 text-xs font-semibold text-brand-700">{error}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          {/* No star on a story photo. The star picks WHICH of too many
              things gets one of the homepage's few slots; the deck has a slot
              per photograph, so the button changes nothing — and a control
              that does nothing is read as one that is broken, or worse, as
              the reason a photo is not appearing. The arrows below are what
              ordering the deck actually needs. */}
          {row.kind !== "story" && row.kind !== "promo" && (
          <button
            onClick={() => run(() => togglePinned(row.id, !row.pinned))}
            disabled={pending}
            aria-label={row.pinned ? `Unpin "${row.title}"` : `Pin "${row.title}" to the homepage`}
            title={
              row.pinned
                ? "Pinned — held at the front of the homepage"
                : "Pin to hold this at the front of the homepage"
            }
            className={`grid h-9 w-9 place-items-center rounded-lg text-base transition-colors disabled:opacity-40 ${
              row.pinned
                ? "bg-brand-600 text-cream-50 hover:bg-brand-700"
                : "bg-ink-950/5 text-ink-800/40 hover:bg-ink-950/10 hover:text-ink-800/70"
            }`}
          >
            {row.pinned ? "★" : "☆"}
          </button>
          )}
          {/* Stated as "everything except news" rather than as a list of the
              kinds that have arrows. It was a list, and the story photos were
              added to the table without being added to it — so the one kind
              whose whole point is the order it is dealt in was the one kind
              with no way to set it. News is the only real exception: it is
              newest-first, so there is no order to set. */}
          {row.kind !== "news" && (
            <>
              <button
                onClick={() => run(() => reorderAnnouncement(row.id, -1))}
                disabled={pending || first}
                aria-label={`Move "${row.title}" earlier`}
                className="grid h-9 w-9 place-items-center rounded-lg bg-ink-950/5 font-black text-ink-800/60 transition-colors hover:bg-ink-950/10 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                onClick={() => run(() => reorderAnnouncement(row.id, 1))}
                disabled={pending || last}
                aria-label={`Move "${row.title}" later`}
                className="grid h-9 w-9 place-items-center rounded-lg bg-ink-950/5 font-black text-ink-800/60 transition-colors hover:bg-ink-950/10 disabled:opacity-30"
              >
                ↓
              </button>
            </>
          )}
          <button
            onClick={() => run(() => toggleAnnouncement(row.id, !row.is_active))}
            disabled={pending}
            className={`rounded-lg px-3 py-2 text-xs font-black uppercase tracking-wide transition-colors disabled:opacity-50 ${
              row.is_active
                ? "bg-ink-950/5 text-ink-800/60 hover:bg-brand-600 hover:text-cream-50"
                : "bg-jade-600 text-cream-50 hover:bg-jade-700"
            }`}
          >
            {row.is_active ? "Turn off" : "Turn on"}
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg bg-ink-950/5 px-3 py-2 text-xs font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10"
          >
            Edit
          </button>

          {/* Delete, on the row rather than three taps inside the editor.
              
              It was only ever reachable by opening the thing you wanted rid
              of, reading a form you were not going to fill in, and finding a
              button at the bottom — which is why a list of finished promos
              grows until it is unreadable, and an unreadable list is what
              lets the wrong one go live.
              
              Still two taps, and it always will be. This is the one control
              here that cannot be undone: the row goes and the uploaded
              photograph goes with it, and the rows most worth tidying are
              beside the ones most worth keeping. The second tap says "for
              good" rather than "confirm", because what is being confirmed is
              the part people mean to skip. */}
          {confirmingDelete ? (
            <span className="flex items-center gap-1.5">
              <button
                onClick={() => run(() => deleteAnnouncement(row.id))}
                disabled={pending}
                className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-black uppercase tracking-wide text-cream-50 transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Delete for good"}
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
                aria-label={`Keep "${row.title}"`}
                className="rounded-lg bg-ink-950/5 px-2.5 py-2 text-xs font-bold text-ink-800/60 transition-colors hover:bg-ink-950/10 disabled:opacity-50"
              >
                ✕
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
              aria-label={`Delete "${row.title}"`}
              title="Delete"
              className="grid h-9 w-9 place-items-center rounded-lg bg-ink-950/5 text-ink-800/45 transition-colors hover:bg-brand-600/10 hover:text-brand-600 disabled:opacity-40"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** When it runs, in the shop's own words rather than two raw timestamps. */
function Window({ row }: { row: Announcement }) {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-PH", {
      timeZone: "Asia/Manila",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));

  if (!row.starts_at && !row.ends_at) return null;
  return (
    <p className="mt-1 text-xs text-ink-800/45">
      {row.starts_at && row.ends_at
        ? `${fmt(row.starts_at)} → ${fmt(row.ends_at)}`
        : row.starts_at
          ? `From ${fmt(row.starts_at)}`
          : `Until ${fmt(row.ends_at!)}`}
    </p>
  );
}

const PLACEHOLDER_TITLE: Record<AnnouncementKind, string> = {
  promo: "e.g. Free coffee when you dine in",
  news: "e.g. Closed 5 Sept",
  dine_in: "e.g. Free coffee when you dine in ☕",
  coming_soon: "e.g. Chicken Wings & Chicken Pops 🔥",
  story: "e.g. Red lanterns over the tables at Pepper Pan",
};

const PLACEHOLDER_BODY: Record<AnnouncementKind, string> = {
  promo: "e.g. One free hot coffee with any rice meal, eaten at the stall.",
  news: "e.g. We're closed on the 5th for a private event. Back on the 6th.",
  dine_in: "e.g. Any hot coffee, with any rice meal, eaten at the stall.",
  coming_soon: "e.g. Both landing before the end of the month.",
  story: "",
};

const field =
  "w-full rounded-xl border-2 border-ink-950/10 bg-cream-100 px-4 py-2.5 text-ink-950 outline-none transition-colors focus:border-gold-400";

function Editor({
  existing,
  kind,
  onDone,
}: {
  existing: Announcement | null;
  kind: AnnouncementKind;
  onDone: () => void;
}) {
  const router = useRouter();
  // A timestamp back to the date box it came from, in the shop's timezone —
  // otherwise a promo starting on the 5th in Manila shows as the 4th here.
  const asDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(iso))
      : "";

  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [startsOn, setStartsOn] = useState(asDate(existing?.starts_at ?? null));
  const [endsOn, setEndsOn] = useState(asDate(existing?.ends_at ?? null));
  const [isActive, setIsActive] = useState(existing?.is_active ?? true);
  const [media, setMedia] = useState({
    imageUrl: existing?.image_url ?? "",
    videoUrl: existing?.video_url ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const r = await saveAnnouncement({
        id: existing?.id,
        kind,
        title,
        body,
        startsOn,
        endsOn,
        isActive,
        imageUrl: media.imageUrl,
        videoUrl: media.videoUrl,
      });
      if (r.error) return setError(r.error);
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/50 p-0 sm:items-center sm:p-6">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-t-3xl bg-cream-50 p-6 sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-display text-2xl font-black text-ink-950">
              {existing ? "Edit" : KIND_NEW_TITLE[kind]}
            </h3>
            <p className="mt-1 text-sm text-ink-800/60">{KIND_BLURB[kind]}</p>
          </div>
          <button
            onClick={onDone}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-950/5 text-ink-800/60 hover:bg-ink-950/10"
          >
            ✕
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
              {kind === "news"
                ? "Headline"
                : kind === "story"
                  ? "What's in the photo"
                  : "The line customers read"}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              maxLength={kind === "news" ? 200 : 60}
              placeholder={PLACEHOLDER_TITLE[kind]}
              className={field}
            />
            {kind === "story" ? (
              // Not a caption: nobody sees these words. They are what a
              // screen reader says in place of the picture, which makes them
              // the only part of a photograph that cannot be worked out by
              // looking at it — and the only part nobody remembers to write.
              <span className="mt-1 block text-xs text-ink-800/45">
                {title.length}/60 — nobody reads this on the page. It is what
                a blind customer&apos;s phone says instead of showing the
                picture, so describe what is actually in it.
              </span>
            ) : (
              kind !== "news" && (
                <span className="mt-1 block text-xs text-ink-800/45">
                  {title.length}/60 —{" "}
                  {kind === "promo"
                    ? "it scrolls past, so shorter reads better."
                    : "it is set large on the page, so shorter reads better."}
                </span>
              )
            )}
          </label>

          {/* A story photo has no words on the page — the deck shows the
              picture and nothing else. An empty box labelled "the detail"
              is an invitation to write something nobody will ever read. */}
          {kind !== "story" && (
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
                {kind === "news" ? "What happened" : "The detail (optional)"}
              </span>
              {/* No maxLength, and no rows={3}.
                
                  It had a 500-character cap, which a browser enforces by simply
                  refusing further keystrokes — no message, no counter, nothing
                  to tell the owner why the sentence they are typing has stopped
                  appearing. Nothing else agreed with it either: the database
                  has no limit, the save action never checked one, and the
                  detail page already renders the whole thing. It was one
                  attribute quietly overruling every other decision.
                
                  Eight rows because the field is now for writing in rather
                  than filling in, and `resize-y` so a longer notice can be
                  given the room it needs without leaving the page. */}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                placeholder={PLACEHOLDER_BODY[kind]}
                className={`${field} resize-y leading-relaxed`}
              />
              <span className="mt-1 block text-[10px] font-semibold text-ink-800/40">
                As long as it needs to be. The homepage shows the first few
                lines; the full post is on its own page.
              </span>
            </label>
          )}

          <MediaField
            imageUrl={media.imageUrl}
            videoUrl={media.videoUrl}
            onChange={setMedia}
          />

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
                Starts
              </span>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className={field}
              />
            </label>
            <label>
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
                Ends
              </span>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className={field}
              />
            </label>
          </div>
          <p className="-mt-2 text-xs text-ink-800/45">
            Leave both empty to run it until you turn it off. An end date takes
            it off the homepage by itself at the end of that day — which is the
            point: nobody has to remember.
          </p>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-ink-950/[0.03] px-3 py-2.5">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-gold-400"
            />
            <span className="text-sm text-ink-800/70">
              <strong className="text-ink-950">On</strong> — uncheck to keep it
              here without showing it.
            </span>
          </label>

          {error && (
            <p className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-cream-50">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={save}
              disabled={pending || !title.trim()}
              className="flex-1 rounded-2xl bg-ink-950 py-3 font-display text-lg font-black text-cream-50 transition-colors hover:bg-ink-800 disabled:bg-ink-950/15 disabled:text-ink-800/40"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {existing && <DeleteButton id={existing.id} onDone={onDone} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteButton({ id, onDone }: { id: number; onDone: () => void }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!asking) {
    return (
      <button
        onClick={() => setAsking(true)}
        className="rounded-2xl px-4 py-3 text-sm font-bold text-brand-600 transition-colors hover:bg-brand-600 hover:text-cream-50"
      >
        Delete
      </button>
    );
  }
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await deleteAnnouncement(id);
          router.refresh();
          onDone();
        })
      }
      disabled={pending}
      className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-black text-cream-50 disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Really delete"}
    </button>
  );
}
