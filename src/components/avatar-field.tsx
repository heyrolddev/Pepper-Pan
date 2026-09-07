"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { createClient } from "@/lib/supabase/client";
import { removeAvatar, saveAvatar, signAvatarUpload } from "@/app/account/actions";
import {
  AVATAR_ACCEPT,
  AVATAR_EDGE,
  MEDIA_BUCKET,
  checkAvatarPick,
  humanBytes,
  MAX_AVATAR_PICK_BYTES,
} from "@/lib/media";
import { squareShrink } from "@/lib/shrink-image";

/**
 * Pick a profile picture. One control, four states, no arithmetic asked of
 * the customer.
 *
 * The order of operations is the point. The photo is checked, then squared and
 * shrunk in this browser, and only then is an upload token asked for — so the
 * thing that travels over a phone connection is about 40KB rather than the
 * four megabytes that came out of the camera. Nobody is ever told to go and
 * resize a photo.
 */
export function AvatarField({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);

    const checked = checkAvatarPick(file.type, file.size);
    if (!checked.ok) {
      if (input.current) input.current.value = "";
      return setError(checked.error);
    }

    startTransition(async () => {
      try {
        setStep("Resizing…");
        const { blob, type } = await squareShrink(file);

        setStep("Uploading…");
        const signed = await signAvatarUpload({ type, size: blob.size });
        if (!signed.ok) return setError(signed.error);

        const { error: uploadError } = await createClient()
          .storage.from(MEDIA_BUCKET)
          .uploadToSignedUrl(signed.path, signed.token, blob, { contentType: type });
        if (uploadError) {
          return setError(`Upload failed: ${uploadError.message}. Please try again.`);
        }

        setStep("Saving…");
        const saved = await saveAvatar(signed.url);
        if (saved.error) return setError(saved.error);

        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "That photo didn't work. Try another one.");
      } finally {
        setStep(null);
        if (input.current) input.current.value = "";
      }
    });
  }

  function clear() {
    setError(null);
    startTransition(async () => {
      setStep("Removing…");
      try {
        const res = await removeAvatar();
        if (res.error) setError(res.error);
        else router.refresh();
      } finally {
        setStep(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-widest text-ink-800">
        Profile picture
      </p>

      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} url={avatarUrl} size={72} />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={pending}
            className="rounded-full bg-ink-950 px-4 py-2 text-xs font-bold text-cream-50 transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            {step ?? (avatarUrl ? "Change photo" : "Add a photo")}
          </button>
          {avatarUrl && !pending && (
            <button
              type="button"
              onClick={clear}
              className="rounded-full px-4 py-2 text-xs font-bold text-brand-600 transition-colors hover:bg-brand-600 hover:text-cream-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={input}
        type="file"
        accept={AVATAR_ACCEPT}
        onChange={(e) => pick(e.target.files?.[0])}
        className="hidden"
      />

      {error ? (
        <p className="rounded-2xl bg-brand-50 px-4 py-2.5 text-xs font-semibold text-brand-700">
          {error}
        </p>
      ) : (
        <p className="text-[11px] font-medium text-ink-800/50">
          Shown next to your name on any review you leave. Pick any photo up to{" "}
          {humanBytes(MAX_AVATAR_PICK_BYTES)} — it&apos;s squared and shrunk to{" "}
          {AVATAR_EDGE}px here on your phone before it uploads, so it stays fast
          to load and doesn&apos;t use your data.
        </p>
      )}
    </div>
  );
}
