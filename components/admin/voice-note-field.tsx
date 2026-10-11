"use client";

import { useEffect, useRef, useState } from "react";
import { listPendingMedia, stashMedia } from "@/lib/studio-local/media";
import { releaseIfUnreferenced } from "@/lib/studio-local/media-release";
import { ingestLabel } from "@/lib/studio-local/ingest-status";
import type { IngestProgress } from "@/lib/studio-local/media-optimize";
import { readVoiceDuration } from "@/lib/studio-local/voice-check";
import { isPendingRef } from "@/lib/studio-media-refs";
import { r2PublicUrl } from "@/lib/r2-policy";
import type { JournalVoiceNote } from "@/lib/types";
import { formatVoiceNoteDuration } from "@/lib/voice-note";
import { PendingRecording } from "./pending-media";
import { flushOutbox } from "./studio-runtime";

/**
 * The author reading this Journal entry aloud — in Details, never in the
 * block palette, because it belongs to the whole entry.
 *
 * A file the author already recorded (Voice Memos, a recorder, a desktop
 * app) goes through the same door as a photograph: kept on this device
 * first, then uploaded when there is a signal, with the entry's own status
 * line saying where things stand. This field only adds what that line
 * cannot: which recording, how long, and Replace / Remove.
 *
 * Replacing never touches the recording already on the site. The new one is
 * a new file under a new name; the entry points at it only once a save that
 * names it has landed. Removing sends an explicit "no recording" with the
 * next save. Neither deletes anything from storage.
 */

/**
 * What the file input offers. The bytes decide in the end — see voice-check.ts.
 *
 * `.mp4` / `video/mp4` are here on purpose. An iPhone recording passed through
 * another app often arrives renamed `… .m4a.mp4`, labelled as video: the same
 * AAC audio inside, but a picker filtering on audio types greys it out. A file
 * that really is video is refused by the check, with a sentence saying so.
 */
const ACCEPT = "audio/mp4,audio/x-m4a,audio/mpeg,video/mp4,.m4a,.mp3,.mp4";

const mb = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const button =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors disabled:opacity-50";

export function VoiceNoteField({
  value,
  onChange,
}: {
  /** Undefined: none, and nothing to say. Null: removed in this session. */
  value: JournalVoiceNote | null | undefined;
  onChange: (next: JournalVoiceNote | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  // What the last Remove took away, so the sentence after it is true.
  const [removed, setRemoved] = useState<"local" | "stored" | null>(null);

  // The latest value, for the length that is filled in after the fact: by the
  // time the browser has read it, the author may have replaced the recording.
  const latest = useRef(value);
  latest.current = value;

  const pending = isPendingRef(value?.src);

  // A pending recording's name lives with its bytes on the device.
  useEffect(() => {
    if (!value || !pending) return;
    let cancelled = false;
    void listPendingMedia().then((all) => {
      const found = all.find((item) => item.ref === value.src);
      if (!cancelled && found) setName(found.name);
    });
    return () => {
      cancelled = true;
    };
  }, [value, pending]);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setProgress({ phase: "inspecting" });

    const result = await stashMedia(file, "voice-notes", "voice-note", setProgress);
    setBusy(false);
    setProgress(null);

    if (!result.ok || !result.voice) {
      setError(result.ok ? "That recording couldn't be kept. Try again." : result.reason);
      return;
    }

    // A replacement that never left this device is let go of — unless a save
    // already queued still names it, in which case it uploads and that save
    // goes out as it was. See releaseIfUnreferenced().
    const previous = latest.current;
    if (previous && isPendingRef(previous.src)) void releaseIfUnreferenced(previous.src);
    setRemoved(null);

    // Keys in the same order checkVoiceNote() writes them, so this compares
    // equal to the same recording read back from the database.
    const next: JournalVoiceNote = {
      src: result.ref,
      mime_type: result.voice.mime,
      duration_seconds: result.voice.duration,
      bytes: result.voice.bytes,
    };
    setName(result.voice.name);
    onChange(next);
    void flushOutbox();

    if (next.duration_seconds == null) {
      const seconds = await readVoiceDuration(file);
      if (seconds != null && latest.current?.src === next.src) {
        onChange({ ...next, duration_seconds: seconds });
      }
    }
  }

  function remove() {
    const local = Boolean(value && isPendingRef(value.src));
    if (value && local) void releaseIfUnreferenced(value.src);
    setRemoved(local ? "local" : "stored");
    setError(null);
    onChange(null);
  }

  const hasNote = Boolean(value);
  const facts = value
    ? [
        value.mime_type === "audio/mpeg" ? "MP3" : "M4A",
        value.bytes ? mb(value.bytes) : null,
        formatVoiceNoteDuration(value.duration_seconds) || null,
      ].filter(Boolean)
    : [];

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 flex w-full items-baseline justify-between gap-2 text-sm font-medium text-ink">
        Voice note
        <span className="font-mono text-2xs uppercase tracking-wide text-faint">Optional</span>
      </legend>

      {!hasNote && (
        <p className="mb-2.5 text-sm text-soft">
          {value === null
            ? removed === "local"
              ? "Removed. The entry is text only again."
              : "Removed. Saving takes it off this entry, and a published entry loses it when you update it live. The file itself stays in storage until it is cleaned up."
            : "Read this entry in your own voice. M4A or MP3, up to 25 MB."}
        </p>
      )}

      {value && pending && (
        <PendingRecording recordingRef={value.src} onDiscard={remove} />
      )}

      {value && !pending && (
        <figure className="rounded-md border border-line bg-raise">
          <div className="px-3 pt-3">
            {/* The author checking their own reading; the entry's text is its transcript. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              src={r2PublicUrl(value.src, process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "")}
              controls
              preload="metadata"
              className="block w-full"
            />
          </div>
          <figcaption className="px-3 py-2 font-mono text-2xs uppercase tracking-wide text-soft">
            {name ? `${name} · ` : ""}
            {facts.join(" · ")}
          </figcaption>
        </figure>
      )}

      {pending && facts.length > 1 && (
        <p className="mt-1.5 font-mono text-2xs uppercase tracking-wide text-faint">{facts.join(" · ")}</p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className={`${button} ${hasNote ? "border-line-strong bg-raise text-soft hover:border-pen hover:text-ink" : "border-hl bg-hl-soft text-ink hover:border-pen"}`}
        >
          {busy ? ingestLabel(progress, "voice-note") : hasNote ? "Replace recording" : "Upload recording"}
        </button>
        {value && !pending && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className={`${button} border-line bg-raise text-red hover:opacity-80`}
          >
            Remove
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {busy && (
        <p role="status" className="sr-only">
          {ingestLabel(progress, "voice-note")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red">
          {error}
        </p>
      )}
    </fieldset>
  );
}
