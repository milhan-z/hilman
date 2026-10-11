"use client";

import { useEffect, useState } from "react";
import { isPendingRef } from "@/lib/studio-media-refs";
import { listPendingMedia, type PendingMedia } from "@/lib/studio-local/media";
import { listResolutions } from "@/lib/studio-local/media-resolution";
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
  // Whether the device has been asked yet: "not found" and "still looking"
  // are different things to say to the author.
  const [loaded, setLoaded] = useState(false);
  // Uploaded already, with the documents not yet pointed at it: the bytes
  // have left the device on purpose, and this is not a missing file.
  const [uploaded, setUploaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setUploaded(false);
    if (!isPendingRef(ref)) {
      setEntry(null);
      setUrl(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    void Promise.all([listPendingMedia(), listResolutions()]).then(([all, resolutions]) => {
      const found = all.find((item) => item.ref === ref);
      if (cancelled) return;
      setUploaded(!found && resolutions.some((item) => item.ref.toLowerCase() === ref.toLowerCase()));
      setLoaded(true);
      if (!found) return;
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

  return { entry, url, loaded, uploaded };
}

/**
 * A placeholder whose bytes are no longer on this device.
 *
 * Always with a way out: without one, the document would go on naming a file
 * nothing can upload, and every save of it would wait for ever behind it.
 */
function MissingMedia({
  noun,
  uploaded,
  className,
  onDiscard,
}: {
  noun: "photo" | "clip" | "recording";
  uploaded?: boolean;
  className?: string;
  onDiscard?: () => void;
}) {
  if (uploaded) {
    // Not missing: sent, and about to replace its placeholder. No Remove —
    // removing here would drop a file that is safely on the site's storage.
    return (
      <p className={cn("rounded-md border border-line bg-raise px-3 py-2 text-sm text-soft", className)}>
        This {noun} has uploaded and is being put in place.
      </p>
    );
  }
  return (
    <div className={cn("flex items-center justify-between gap-2 rounded-md border border-line bg-raise px-3 py-2", className)}>
      <p className="text-sm text-soft">This {noun} is no longer on this device.</p>
      {onDiscard && (
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-11 shrink-0 px-1 text-sm text-red transition-opacity hover:opacity-80"
        >
          Remove
        </button>
      )}
    </div>
  );
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
  const { entry, url, loaded, uploaded } = usePendingPhoto(photoRef);

  if (!entry) {
    if (!loaded) return null;
    return <MissingMedia noun="photo" uploaded={uploaded} className={className} onDiscard={onDiscard} />;
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
  const { entry, url, loaded, uploaded } = usePendingPhoto(clipRef);

  if (!entry) {
    if (!loaded) return null;
    return <MissingMedia noun="clip" uploaded={uploaded} className={className} onDiscard={onDiscard} />;
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

/**
 * A voice note that only exists on this phone.
 *
 * The same row as a photo or a clip — `usePendingPhoto()` does not care what
 * kind it reads — drawn as what it is: a player the author can check, and
 * the plain fact of where it is. No waveform; the recording is the point.
 */
export function PendingRecording({
  recordingRef,
  className,
  onDiscard,
}: {
  recordingRef: string;
  className?: string;
  onDiscard?: () => void;
}) {
  const { entry, url, loaded, uploaded } = usePendingPhoto(recordingRef);

  if (!entry) {
    if (!loaded) return null;
    return <MissingMedia noun="recording" uploaded={uploaded} className={className} onDiscard={onDiscard} />;
  }

  return (
    <figure className={cn("rounded-md border border-hl bg-raise", className)}>
      <div className="px-3 pt-3">
        <p className="truncate text-sm font-semibold text-ink">{entry.name}</p>
        {url && (
          // The author checking their own reading; the entry's text is its transcript.
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio src={url} controls preload="metadata" className="mt-2 block w-full" />
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-wide text-soft">
          <span
            aria-hidden
            className={cn("h-2 w-2 rounded-full", entry.blocked ? "bg-red" : "animate-pulse bg-hl")}
          />
          {entry.blocked ? "Upload refused" : "Saved on this device — waiting to upload"}
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
