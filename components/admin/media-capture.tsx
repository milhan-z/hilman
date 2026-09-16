"use client";

import { useRef, useState } from "react";
import { stashMedia } from "@/lib/studio-local/media";
import { flushOutbox } from "./studio-runtime";

/**
 * Getting a photograph into a block, starting with the camera.
 *
 * On a phone the picture usually does not exist yet — the point of writing
 * from a phone is that you are standing in front of the thing. So "Camera" is
 * the first and largest control, and the file picker sits beside it rather
 * than in front of it.
 *
 * Whichever route is taken, the bytes are written to this device before
 * anything is attempted over the network. The upload is then just another
 * thing the outbox owes the site, which is what makes a photo taken in a
 * basement survive the walk back upstairs.
 */

export function MediaCapture({
  onCaptured,
  folder = "hilman",
  accept = "image/*",
  disabled,
}: {
  /** Receives the `pending:` placeholder to store in the block. */
  onCaptured: (ref: string) => void;
  folder?: string;
  accept?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);

    const result = await stashMedia(file, folder);
    setBusy(false);

    if (!result.ok) {
      setError(result.reason);
      return;
    }

    onCaptured(result.ref);
    // If there is a signal, this finishes within the second and the
    // placeholder is replaced before you have scrolled away from it.
    void flushOutbox();
  }

  const tile =
    "flex min-h-14 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50";

  return (
    <div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => cameraInput.current?.click()}
          className={`${tile} border-hl bg-hl-soft text-ink hover:border-pen`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          {busy ? "Keeping…" : "Camera"}
        </button>

        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => libraryInput.current?.click()}
          className={`${tile} border-line-strong bg-raise text-soft hover:border-pen hover:text-ink`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Photos
        </button>
      </div>

      {/* `capture` is what makes iOS open the camera rather than the picker.
          It is only a hint — a desktop browser ignores it and shows files,
          which is the right thing to happen there. */}
      <input
        ref={cameraInput}
        type="file"
        accept={accept}
        capture="environment"
        className="sr-only"
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={libraryInput}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red">
          {error}
        </p>
      )}
    </div>
  );
}
