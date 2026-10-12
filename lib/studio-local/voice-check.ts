import { MAX_VOICE_NOTE_BYTES, type VoiceNoteMimeType } from "../voice-note";

/**
 * Whether a recording can become a Journal voice note, decided before it is
 * stored on the device.
 *
 * ── what is accepted, and why ──
 *
 * M4A (AAC in an MP4 container) and MP3. Every browser a visitor is likely to
 * use plays both natively, and they are what the author's own tools produce:
 * iPhone Voice Memos shares `.m4a`, most recorders export MP3. Nothing is
 * transcoded — the file the author chose is the file visitors hear.
 *
 * The one trap is Voice Memos with "Audio Quality: Lossless", which writes
 * Apple Lossless (ALAC) into the same `.m4a` name. Safari plays it; Chrome
 * and Firefox do not. So the container is not enough and this reads the
 * codec out of the file itself.
 *
 * ── how ──
 *
 * By reading the file's own structure, not by asking a browser to play it:
 * the author's phone is the one device whose opinion does not matter (an
 * iPhone would happily play the ALAC file nobody else can). For MP4 that is a
 * walk over box headers to the `moov` box — a few small reads, however long
 * the recording — which also yields the duration. For MP3 it is the ID3 tag
 * and the first frame header.
 *
 * Kept free of DOM and React so it runs in a test as it does on a phone. A
 * duration that cannot be read is null, never a refusal.
 */

export type VoiceCheck =
  | { ok: true; mime: VoiceNoteMimeType; duration: number | null }
  | { ok: false; reason: string };

const readableMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const EXPORT_HINT = "Export it as M4A or MP3 and try again.";

/**
 * Whether the label is worth opening the file for.
 *
 * Labels are unreliable — some pickers call an `.m4a` `audio/aac` or
 * `video/mp4`, some send nothing at all — so this only turns away what is
 * plainly something else (a photo, a document). Everything plausible goes on
 * to the bytes, which decide.
 */
function plausiblyAudio(file: { type: string; name?: string }): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("audio/") || type === "video/mp4") return true;
  if (type && type !== "application/octet-stream") return /\.(m4a|mp3|mp4)$/i.test(file.name || "");
  return true;
}

export async function checkVoiceFile(file: Blob & { name?: string }): Promise<VoiceCheck> {
  if (!plausiblyAudio(file)) {
    const shown = file.type || (file.name?.match(/\.[a-z0-9]+$/i)?.[0] ?? "an unknown format");
    return {
      ok: false,
      reason: `Voice notes take M4A or MP3 recordings, and this file is ${shown}. ${EXPORT_HINT}`,
    };
  }
  if (file.size === 0) {
    return { ok: false, reason: `This recording is empty. ${EXPORT_HINT}` };
  }
  if (file.size > MAX_VOICE_NOTE_BYTES) {
    return {
      ok: false,
      reason: `This recording is too large (${readableMB(file.size)}). Export it as M4A or MP3 under ${readableMB(MAX_VOICE_NOTE_BYTES)}.`,
    };
  }

  // The bytes outrank the label: a renamed file is judged by what it is.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (fourcc(head, 4) === "ftyp") return checkMp4(file);
  if (await looksLikeMp3(file, head)) return { ok: true, mime: "audio/mpeg", duration: null };

  // A format worth naming, because the author can act on the name.
  const other = otherFormat(head);
  if (other) {
    return {
      ok: false,
      reason: `This is ${other} recording, and voice notes take M4A or MP3. Export it as one of those and try again.`,
    };
  }

  return {
    ok: false,
    reason: `This file doesn't look like an M4A or MP3 recording inside, whatever its name says. ${EXPORT_HINT}`,
  };
}

/** The common recording formats this does not take, by their first bytes. */
function otherFormat(head: Uint8Array): string | null {
  if (fourcc(head, 0) === "RIFF" && fourcc(head, 8) === "WAVE") return "a WAV";
  if (fourcc(head, 0) === "OggS") return "an Ogg";
  if (fourcc(head, 0) === "fLaC") return "a FLAC";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "a WebM";
  return null;
}

/* ── MP4 ─────────────────────────────────────────────────── */

/** Larger than any real recording's index; past it, the codec is left unread. */
const MAX_MOOV_BYTES = 8 * 1024 * 1024;

interface Box {
  type: string;
  start: number; // offset of the header
  content: number; // offset of the payload
  end: number;
}

async function checkMp4(file: Blob): Promise<VoiceCheck> {
  const moov = await findTopLevel(file, "moov");
  if (moov === "unreadable") {
    return unverifiableRecording();
  }
  if (!moov) {
    // An MP4 with no index cannot be played by anything. This is what a
    // recording looks like when it was shared before it finished saving.
    return {
      ok: false,
      reason: "This recording seems unfinished — it has no index, so it can't be played. Open it once on the device that made it, then export it as M4A or MP3 again.",
    };
  }
  if (moov.end - moov.start > MAX_MOOV_BYTES) {
    return unverifiableRecording();
  }

  const bytes = new Uint8Array(await file.slice(moov.start, moov.end).arrayBuffer());
  let facts: Mp4Facts;
  try {
    facts = readMoov(bytes);
  } catch {
    return unverifiableRecording();
  }

  if (facts.hasVideo) {
    return {
      ok: false,
      reason: "This file has video in it. Voice notes are sound only — export just the audio as M4A or MP3.",
    };
  }
  if (facts.codecs.includes("alac")) {
    return {
      ok: false,
      reason:
        "This recording uses Apple Lossless, which most browsers can't play. In Voice Memos, set Audio Quality to Compressed and record again, or export it as M4A or MP3.",
    };
  }
  const unplayable = facts.codecs.find((codec) => codec !== "mp4a" && codec !== ".mp3");
  if (unplayable) {
    return {
      ok: false,
      reason: `This recording uses an audio format (${unplayable.trim()}) that most browsers can't play. ${EXPORT_HINT}`,
    };
  }
  if (facts.codecs.length === 0) {
    return { ok: false, reason: `This file has no audio in it. ${EXPORT_HINT}` };
  }

  return { ok: true, mime: "audio/mp4", duration: facts.duration };
}

function unverifiableRecording(): VoiceCheck {
  return { ok: false, reason: `Studio couldn't verify this recording's audio format. ${EXPORT_HINT}` };
}

/**
 * The top-level box of this type; null when the walk reached the end without
 * one; "unreadable" when the file stopped making sense first.
 */
async function findTopLevel(file: Blob, type: string): Promise<Box | null | "unreadable"> {
  let offset = 0;
  // A real file has a handful of top-level boxes; the bound is for a corrupt one.
  for (let i = 0; i < 64; i++) {
    if (offset + 8 > file.size) return null;
    const header = new Uint8Array(await file.slice(offset, offset + 16).arrayBuffer());
    const box = boxAt(header, 0, file.size - offset);
    // A header that runs past the end is what a recording cut short looks
    // like, so it reads as "no index" rather than as a puzzle.
    if (!box) return fourcc(header, 4) === "" ? null : boxIsTruncated(header, file.size - offset) ? null : "unreadable";
    if (box.type === type) {
      return { type, start: offset, content: offset + box.content, end: offset + box.end };
    }
    offset += box.end;
  }
  return "unreadable";
}

/** A well-formed header whose declared size is more than is left of the file. */
function boxIsTruncated(header: Uint8Array, available: number): boolean {
  if (header.length < 8) return true;
  const size = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(0);
  return size >= 8 && size > available;
}

/** The box whose header starts at `at`, with offsets relative to `buffer`, or null. */
function boxAt(buffer: Uint8Array, at: number, available: number): Box | null {
  if (at + 8 > buffer.length) return null;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let size = view.getUint32(at);
  const type = fourcc(buffer, at + 4);
  let content = at + 8;
  if (size === 1) {
    if (at + 16 > buffer.length) return null;
    size = Number(view.getBigUint64(at + 8));
    content = at + 16;
  } else if (size === 0) {
    size = available; // "to the end of the file"
  }
  if (size < content - at || size > available) return null;
  return { type, start: at, content, end: at + size };
}

function children(buffer: Uint8Array, parent: Box): Box[] {
  const found: Box[] = [];
  let at = parent.content;
  while (at + 8 <= parent.end) {
    const box = boxAt(buffer, at, parent.end - at);
    if (!box) throw new Error(`malformed box at ${at}`);
    found.push(box);
    at = box.end;
  }
  return found;
}

const child = (buffer: Uint8Array, parent: Box | undefined, type: string) =>
  parent ? children(buffer, parent).find((box) => box.type === type) : undefined;

interface Mp4Facts {
  duration: number | null;
  codecs: string[];
  hasVideo: boolean;
}

/** Reads duration and every sound track's codec out of a whole `moov` box. */
export function readMoov(bytes: Uint8Array): Mp4Facts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const moov = boxAt(bytes, 0, bytes.length);
  if (!moov || moov.type !== "moov") throw new Error("not a moov box");

  let duration: number | null = null;
  const mvhd = child(bytes, moov, "mvhd");
  if (mvhd) {
    const version = bytes[mvhd.content];
    const timescale = view.getUint32(mvhd.content + (version === 1 ? 20 : 12));
    const units =
      version === 1
        ? Number(view.getBigUint64(mvhd.content + 24))
        : view.getUint32(mvhd.content + 16);
    const seconds = timescale > 0 ? units / timescale : NaN;
    duration = Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }

  const codecs: string[] = [];
  let hasVideo = false;
  for (const trak of children(bytes, moov).filter((box) => box.type === "trak")) {
    const mdia = child(bytes, trak, "mdia");
    const hdlr = child(bytes, mdia, "hdlr");
    const handler = hdlr ? fourcc(bytes, hdlr.content + 8) : "";
    if (handler === "vide") hasVideo = true;
    if (handler !== "soun") continue;

    const stsd = child(bytes, child(bytes, child(bytes, mdia, "minf"), "stbl"), "stsd");
    // Check every declared sample description, not just the first: a track
    // can switch codec descriptions partway through a recording.
    if (!stsd || stsd.content + 8 > stsd.end) throw new Error("missing audio descriptions");
    const count = view.getUint32(stsd.content + 4);
    const entries = children(bytes, { ...stsd, content: stsd.content + 8 });
    if (count === 0 || entries.length !== count) throw new Error("incomplete audio descriptions");
    for (const entry of entries) codecs.push(entry.type);
  }

  return { duration, codecs, hasVideo };
}

/**
 * The length, as this browser reads it, or null.
 *
 * Only for what the file's own structure did not say — an MP3 has no index.
 * Never a gate: a browser that cannot read the length, or takes too long,
 * just leaves it blank, and the public player reads it again for itself.
 */
export function readVoiceDuration(blob: Blob, timeoutMs = 10_000): Promise<number | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(blob);
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      const seconds = audio.duration;
      // Some browsers report Infinity until a stream has been read through.
      finish(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

/* ── MP3 ─────────────────────────────────────────────────── */

/** How far past the tags to look for the first frame: padding and stray bytes, not a search of the file. */
const MP3_SCAN_BYTES = 64 * 1024;

/**
 * An MPEG audio layer III stream: two frames in a row, where the first
 * header says the second will be.
 *
 * Starts after any ID3 tags (they can be stacked) and tolerates padding
 * before the first frame. Requiring the second frame is what keeps random
 * bytes — which contain 0xFFF sync patterns all the time — from passing.
 */
async function looksLikeMp3(file: Blob, head: Uint8Array): Promise<boolean> {
  let start = 0;
  let tag = head;
  // "ID3": a tag first, whose size is four 7-bit bytes, plus a footer when flagged.
  for (let i = 0; i < 4 && tag[0] === 0x49 && tag[1] === 0x44 && tag[2] === 0x33; i++) {
    const size = ((tag[6] & 0x7f) << 21) | ((tag[7] & 0x7f) << 14) | ((tag[8] & 0x7f) << 7) | (tag[9] & 0x7f);
    start += 10 + size + (tag[5] & 0x10 ? 10 : 0);
    if (start + 10 > file.size) return false;
    tag = new Uint8Array(await file.slice(start, start + 10).arrayBuffer());
  }

  const window = new Uint8Array(await file.slice(start, start + MP3_SCAN_BYTES + 4).arrayBuffer());
  for (let at = 0; at + 4 <= window.length; at++) {
    const length = mp3FrameLength(window, at);
    if (!length) continue;
    const next = start + at + length;
    if (next + 4 > file.size) return at === 0 && next === file.size; // a one-frame file
    const following = new Uint8Array(await file.slice(next, next + 4).arrayBuffer());
    if (mp3FrameLength(following, 0)) return true;
  }
  return false;
}

const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

/** The byte length of the layer III frame whose header starts at `at`, or 0 if it is not one. */
export function mp3FrameLength(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) return 0;
  if (bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) return 0;
  const version = (bytes[at + 1] >> 3) & 0x03; // 1 is reserved
  const layer = (bytes[at + 1] >> 1) & 0x03; // 1 is layer III
  const bitrateIndex = bytes[at + 2] >> 4; // 0 is "free", 15 is bad
  const rateIndex = (bytes[at + 2] >> 2) & 0x03; // 3 is reserved
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return 0;
  const padding = (bytes[at + 2] >> 1) & 0x01;
  const kbps = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex];
  const rate = SAMPLE_RATES[version][rateIndex];
  return Math.floor(((version === 3 ? 144 : 72) * kbps * 1000) / rate) + padding;
}

function fourcc(bytes: Uint8Array, at: number): string {
  if (at + 4 > bytes.length) return "";
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}
