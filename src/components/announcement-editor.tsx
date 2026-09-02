"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveAnnouncement,
  toggleAnnouncement,
  deleteAnnouncement,
  reorderAnnouncement,
} from "@/app/admin/promos/actions";
import {
  isSlotKind,
  KIND_ADD,
  KIND_BLURB,
  KIND_NEW_TITLE,
  KIND_PLURAL,
  liveStateOf,
  queuedBehind,
  STATE_TONE,
  stripItems,
  type Announcement,
  type AnnouncementKind,
} from "@/lib/announcements";
import { MediaField } from "@/components/media-field";

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
              queued={queuedBehind(a, all)}
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

function Row({
  row,
  queued,
  first,
  last,
  onEdit,
}: {
  row: Announcement;
  queued: boolean;
  first: boolean;
  last: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const state = liveStateOf(row);
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
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${
                queued ? "bg-ink-950/10 text-ink-800/60" : tone.chip
              }`}
            >
              {/* The band has room for one. Saying "on the homepage" about the
                  second one would be a lie the owner only catches by looking. */}
              {queued ? "Next up" : tone.label}
            </span>
          </p>
          {row.body && (
            <p className="mt-1 max-w-2xl text-sm text-ink-800/65">{row.body}</p>
          )}
          <Window row={row} />
          {error && (
            <p className="mt-1 text-xs font-semibold text-brand-700">{error}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          {/* Order matters for the strip, where it decides what scrolls past
              first, and for the band, where it decides which one of these is
              the one shown. News is newest-first and has no order to set. */}
          {(row.kind === "promo" || isSlotKind(row.kind)) && (
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
};

const PLACEHOLDER_BODY: Record<AnnouncementKind, string> = {
  promo: "e.g. One free hot coffee with any rice meal, eaten at the stall.",
  news: "e.g. We're closed on the 5th for a private event. Back on the 6th.",
  dine_in: "e.g. Any hot coffee, with any rice meal, eaten at the stall.",
  coming_soon: "e.g. Both landing before the end of the month.",
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
              {kind === "news" ? "Headline" : "The line customers read"}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              maxLength={kind === "news" ? 200 : 60}
              placeholder={PLACEHOLDER_TITLE[kind]}
              className={field}
            />
            {kind !== "news" && (
              <span className="mt-1 block text-xs text-ink-800/45">
                {title.length}/60 —{" "}
                {kind === "promo"
                  ? "it scrolls past, so shorter reads better."
                  : "it is set large on the page, so shorter reads better."}
              </span>
            )}
          </label>

          <label>
            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
              {kind === "news" ? "What happened" : "The detail (optional)"}
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={PLACEHOLDER_BODY[kind]}
              className={field}
            />
          </label>

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
