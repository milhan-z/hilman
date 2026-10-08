import type { JournalVoiceNote } from "./types";

/**
 * A Journal entry, read aloud by its author.
 *
 * One recording per entry, stored as a field of the entry rather than as a
 * content block: it belongs to the whole piece and always sits in the header,
 * before the writing it reads.
 *
 * This module is the one definition of what a valid voice note is. The editor,
 * the sync route and the public page all ask it, and migration 0014 enforces
 * the same shape in the database with a CHECK — so a rule changed here has to
 * be changed there too.
 *
 * Kept free of browser and server imports, like lib/studio-sync-contract.ts,
 * so the rules can be tested on their own.
 */

/** Largest recording Studio will keep or send. Mirrored in 0014; lib/r2-policy.ts signs against it. */
export const MAX_VOICE_NOTE_BYTES = 25 * 1024 * 1024;

/** Longer than any narration this site will carry; a guard against nonsense, not an editorial limit. */
export const MAX_VOICE_NOTE_SECONDS = 2 * 60 * 60;

/** The two containers every browser this site supports can play without help. */
export const VOICE_NOTE_MIME_TYPES = ["audio/mp4", "audio/mpeg"] as const;
export type VoiceNoteMimeType = (typeof VOICE_NOTE_MIME_TYPES)[number];

export const VOICE_NOTE_FOLDER = "voice-notes";

/**
 * Where a recording lives in R2: `voice-notes/<uuid>.m4a` or `.mp3`.
 *
 * The key, not a URL, is what the database stores. The public address is
 * worked out when the page is rendered, so moving the bucket behind a
 * different domain does not leave every entry pointing at the old one.
 */
const KEY_PATTERN =
  /^voice-notes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(m4a|mp3)$/;

const PENDING_PATTERN =
  /^pending:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isVoiceNoteKey = (value: unknown): value is string =>
  typeof value === "string" && KEY_PATTERN.test(value);

/** The extension a stored recording of this type is given. */
export function voiceNoteExtension(mime: VoiceNoteMimeType): "m4a" | "mp3" {
  return mime === "audio/mpeg" ? "mp3" : "m4a";
}

/** The type a file extension implies, for serving a key whose stored type is missing. */
export function voiceNoteMimeForKey(key: string): VoiceNoteMimeType | null {
  if (key.endsWith(".m4a")) return "audio/mp4";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  return null;
}

export type VoiceNoteCheck =
  | { ok: true; value: JournalVoiceNote | null }
  | { ok: false; reason: string };

/**
 * Whether a value is a voice note this site can store.
 *
 * `null` is valid and means "this entry has no recording". Anything else has
 * to be the full object. `allowPending` admits a `pending:<uuid>` source —
 * a recording still on the author's device — which is a legitimate state in
 * the editor and the local queue, and never one the database may hold.
 *
 * Returns a copy containing only the known keys, so a client cannot smuggle
 * extra properties into the column.
 */
export function checkVoiceNote(
  value: unknown,
  { allowPending = false }: { allowPending?: boolean } = {}
): VoiceNoteCheck {
  if (value === null) return { ok: true, value: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "The voice note is malformed." };
  }
  const raw = value as Record<string, unknown>;

  const src = typeof raw.src === "string" ? raw.src : "";
  const pending = PENDING_PATTERN.test(src);
  if (!isVoiceNoteKey(src) && !(allowPending && pending)) {
    return {
      ok: false,
      reason: pending
        ? "The voice note is still on a device and hasn't uploaded yet."
        : "The voice note doesn't point at a stored recording.",
    };
  }

  const mime = raw.mime_type;
  if (!VOICE_NOTE_MIME_TYPES.includes(mime as VoiceNoteMimeType)) {
    return { ok: false, reason: "The voice note must be an M4A or MP3 recording." };
  }
  // A stored key carries its container in the extension; the two must agree,
  // or the file would be served as one thing and decoded as another.
  if (!pending && voiceNoteMimeForKey(src) !== mime) {
    return { ok: false, reason: "The voice note's file type doesn't match its recording." };
  }

  // Length and size are descriptions of the recording, read by a browser that
  // does not always read them well (0, Infinity, NaN all happen). A bad one
  // is dropped, not refused: refusing would hold the author's whole save —
  // their writing included — over a number the player can work out itself.
  const duration = isValidDuration(raw.duration_seconds) ? raw.duration_seconds : null;
  const bytes = isValidBytes(raw.bytes) ? raw.bytes : undefined;

  return {
    ok: true,
    value: {
      src,
      mime_type: mime as VoiceNoteMimeType,
      duration_seconds: duration,
      ...(bytes !== undefined ? { bytes } : {}),
    },
  };
}

const isValidDuration = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_VOICE_NOTE_SECONDS;

const isValidBytes = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_VOICE_NOTE_BYTES;

/**
 * The recording a public page may play, or nothing.
 *
 * The database already refuses anything else, so this only ever drops a row
 * written before 0014 or by hand. It drops it quietly: an entry with a broken
 * recording is still an entry, and its writing is the part that matters.
 */
export function publicVoiceNote(value: unknown): JournalVoiceNote | null {
  const check = checkVoiceNote(value ?? null);
  return check.ok ? check.value : null;
}

/** `4:21`, `1:02:03`. Mono, tabular, and the same wherever a duration is shown. */
export function formatVoiceNoteDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
