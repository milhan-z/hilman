"use client";

import { useEffect, useState } from "react";
import { isPendingRef } from "@/lib/studio-media-refs";
import { listPendingMedia, type PendingMedia } from "@/lib/studio-local/media";
import { cn } from "@/lib/utils";

/**
 * Showing a photograph that only exists on this phone.
 *
 * `mediaSrc()` deliberately returns nothing for a `pending:` placeholder, so
 * the public site can never render one. That leaves the studio needing its own
 * way to show you the picture you just took, which is this: the Blob straight
 * out of IndexedDB, as an object URL.
 *
 * It is always labelled. A thumbnail that looks exactly like an uploaded photo
 * would quietly suggest the work is somewhere it is not.
 */

export function usePendingPhoto(ref: string | null | undefined) {
  const [entry, setEntry] = useState<PendingMedia | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isPendingRef(ref)) {
      setEntry(null);
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    void listPendingMedia().then((all) => {
      const found = all.find((item) => item.ref === ref);
      if (cancelled || !found) return;
      setEntry(found);
      objectUrl = URL.createObjectURL(found.blob);
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;
      // Object URLs pin the Blob in memory until they are revoked, and an
      // editor session can create a lot of them.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ref]);

  return { entry, url };
}

export function PendingPhoto({
  photoRef,
  className,
  onDiscard,
}: {
  photoRef: string;
  className?: string;
  onDiscard?: () => void;
}) {
  const { entry, url } = usePendingPhoto(photoRef);

  if (!entry) {
    return (
      <p className={cn("text-sm text-soft", className)}>
        This photo is no longer on this device.
      </p>
    );
  }

  return (
    <figure className={cn("overflow-hidden rounded-md border border-hl bg-raise", className)}>
      {url && (
        // A local Blob, not a remote asset: next/image would only add a loader
        // in front of a URL that is already in memory.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="block max-h-56 w-full object-cover" />
      )}
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wide text-soft">
          <span
            aria-hidden
            className={cn("h-2 w-2 rounded-full", entry.blocked ? "bg-red" : "animate-pulse bg-hl")}
          />
          {entry.blocked ? "Upload refused" : "On this phone — waiting to upload"}
        </span>
        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-11 px-1 text-sm text-red transition-opacity hover:opacity-80"
          >
            Remove
          </button>
        )}
      </figcaption>
      {entry.blocked && entry.lastError && (
        <p role="alert" className="px-3 pb-2 text-sm text-red">
          {entry.lastError}
        </p>
      )}
    </figure>
  );
}

/**
 * Showing a Loop Clip that only exists on this phone.
 *
 * Same hook as `<PendingPhoto />` — `usePendingPhoto()` fetches a `PendingMedia`
 * row by ref regardless of what kind it is, since IndexedDB doesn't care — but
 * a Blob playing back as a photograph is not what an editor wants to see when
 * it is actually six seconds of video. `controls`, not `autoplay`/`loop`: this
 * is the author checking what they are about to publish, not the public
 * render — see LoopClipFacade for that one.
 */
export function PendingClip({
  clipRef,
  className,
  onDiscard,
}: {
  clipRef: string;
  className?: string;
  onDiscard?: () => void;
}) {
  const { entry, url } = usePendingPhoto(clipRef);

  if (!entry) {
    return (
      <p className={cn("text-sm text-soft", className)}>
        This clip is no longer on this device.
      </p>
    );
  }

  return (
    <figure className={cn("overflow-hidden rounded-md border border-hl bg-raise", className)}>
      {url && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video src={url} controls muted playsInline className="block max-h-56 w-full bg-n-900" />
      )}
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wide text-soft">
          <span
            aria-hidden
            className={cn("h-2 w-2 rounded-full", entry.blocked ? "bg-red" : "animate-pulse bg-hl")}
          />
          {entry.blocked ? "Upload refused" : "On this phone — waiting to upload"}
        </span>
        {onDiscard && (
          <button
            type="button"
            onClick={onDiscard}
            className="min-h-11 px-1 text-sm text-red transition-opacity hover:opacity-80"
          >
            Remove
          </button>
        )}
      </figcaption>
      {entry.blocked && entry.lastError && (
        <p role="alert" className="px-3 pb-2 text-sm text-red">
          {entry.lastError}
        </p>
      )}
    </figure>
  );
}
