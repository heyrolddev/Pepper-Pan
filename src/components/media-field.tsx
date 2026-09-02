"use client";

import { useRef, useState, useTransition } from "react";
import { discardUpload, uploadMedia } from "@/app/admin/promos/actions";
import { ACCEPT_ATTR, checkMedia, humanBytes } from "@/lib/media";

/**
 * Pick a photo or a video, see it, change your mind.
 *
 * Uploads the moment a file is chosen rather than on save. That costs an
 * orphaned file when somebody uploads and then closes the dialog — cleaned up
 * by the discard below — and buys the thing that matters: the owner sees what
 * they picked before committing it to the homepage. A form that only reveals
 * the photo after saving is a form people save twice.
 */
export function MediaField({
  imageUrl,
  videoUrl,
  onChange,
}: {
  imageUrl: string;
  videoUrl: string;
  onChange: (next: { imageUrl: string; videoUrl: string }) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const current = imageUrl || videoUrl;

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);

    // Checked here as well as on the server, so nobody watches a 40MB video
    // upload for a minute only to be told it was never going to be accepted.
    const checked = checkMedia(file.type, file.size);
    if (!checked.ok) {
      if (input.current) input.current.value = "";
      return setError(checked.error);
    }

    const form = new FormData();
    form.set("file", file);
    startTransition(async () => {
      const r = await uploadMedia(form);
      if (input.current) input.current.value = "";
      if (!r.ok) return setError(r.error);
      // One at a time: a card shows a photo or a video, never both, and
      // holding two would only raise the question of which one wins.
      if (current) void discardUpload(current);
      onChange(
        r.kind === "video"
          ? { imageUrl: "", videoUrl: r.url }
          : { imageUrl: r.url, videoUrl: "" }
      );
    });
  }

  function clear() {
    if (current) void discardUpload(current);
    onChange({ imageUrl: "", videoUrl: "" });
    setError(null);
  }

  return (
    <div>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-ink-800/40">
        Photo or video (optional)
      </span>

      {current ? (
        <div className="overflow-hidden rounded-2xl bg-ink-950/5 ring-1 ring-ink-950/10">
          {videoUrl ? (
            <video
              src={videoUrl}
              className="max-h-56 w-full bg-ink-950 object-contain"
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            // Not next/image: the URL is whatever the shop just uploaded, and
            // the optimiser would need every future bucket configured up front.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt="What customers will see with this post"
              className="max-h-56 w-full bg-ink-950 object-contain"
            />
          )}
          <div className="flex flex-wrap gap-2 p-2.5">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={pending}
              className="rounded-lg bg-ink-950/5 px-3 py-2 text-xs font-bold text-ink-800/70 transition-colors hover:bg-ink-950/10 disabled:opacity-50"
            >
              {pending ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              onClick={clear}
              disabled={pending}
              className="rounded-lg px-3 py-2 text-xs font-bold text-brand-600 transition-colors hover:bg-brand-600 hover:text-cream-50 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={pending}
          className="w-full rounded-2xl border-2 border-dashed border-brand-300 bg-cream-100 px-4 py-6 text-sm font-semibold text-ink-800/70 transition-colors hover:border-brand-600 hover:text-ink-950 disabled:opacity-60"
        >
          {pending ? "Uploading…" : "＋ Add a photo or video"}
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        onChange={(e) => pick(e.target.files?.[0])}
        className="hidden"
      />

      {error ? (
        <p className="mt-1.5 text-xs font-semibold text-brand-700">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-ink-800/45">
          Photos up to {humanBytes(5 * 1024 * 1024)}, video up to{" "}
          {humanBytes(25 * 1024 * 1024)} as MP4. A few seconds of video is plenty
          — it plays silently on the page, like a moving photo.
        </p>
      )}
    </div>
  );
}
