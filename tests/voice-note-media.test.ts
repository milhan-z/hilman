import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

import { checkVoiceFile, readMoov } from "../lib/studio-local/voice-check";
import { planR2Upload, r2PublicUrl, servableR2Key } from "../lib/r2-policy";
import { serveR2, type R2Send } from "../lib/r2-serve";
import { dbClearAll, dbGetAll, dbPut } from "../lib/studio-local/db";
import {
  flushPendingMedia,
  listPendingMedia,
  stashMedia,
  uploadDeadline,
  type MediaUploader,
  type PendingMedia,
} from "../lib/studio-local/media";
import { listResolutions } from "../lib/studio-local/media-resolution";
import { releaseIfUnreferenced } from "../lib/studio-local/media-release";
import { recordConflict } from "../lib/studio-local/conflicts";
import { enqueue } from "../lib/studio-local/outbox";
import { UploadError } from "../lib/studio-local/retry-policy";
import { uploadNoun } from "../lib/studio-local/sync";
import { ingestLabel } from "../lib/studio-local/ingest-status";

/**
 * Journal voice notes, Pass 2: the checks that decide whether a recording may
 * be kept, where it is signed to, what the public may read back, and what the
 * Studio calls it while it moves.
 *
 * The fixtures below are real container bytes, written by a small box builder
 * so each test can say exactly which structure it is about: a codec, a
 * track, the position of the index.
 */

/* ── an MP4 box writer, just enough for the checks to read ── */

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const u8 = (...values: number[]) => new Uint8Array(values);
const zeros = (length: number) => new Uint8Array(length);
const ascii = (text: string) => Uint8Array.from(text, (ch) => ch.charCodeAt(0));
const u32 = (n: number) => u8((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
const u64 = (n: number) => concat(u32(Math.floor(n / 2 ** 32)), u32(n >>> 0));

/** size (4 bytes, big-endian) + four-character type + payload. */
function box(type: string, ...children: Uint8Array[]): Uint8Array {
  const payload = concat(...children);
  return concat(u32(payload.length + 8), ascii(type), payload);
}

const ftyp = () => box("ftyp", ascii("M4A "), u32(0), ascii("isomM4A "));
const mvhdV0 = (timescale: number, duration: number) =>
  box("mvhd", u8(0, 0, 0, 0), u32(0), u32(0), u32(timescale), u32(duration), zeros(80));
const mvhdV1 = (timescale: number, duration: number) =>
  box("mvhd", u8(1, 0, 0, 0), u64(0), u64(0), u32(timescale), u64(duration), zeros(80));
const hdlr = (handler: string) => box("hdlr", u32(0), u32(0), ascii(handler), zeros(12), zeros(1));
const stsd = (codec: string) => box("stsd", u32(0), u32(1), box(codec, zeros(28)));
const trak = (handler: string, codec: string) =>
  box("trak", box("mdia", hdlr(handler), box("minf", box("stbl", stsd(codec)))));
const moov = (mvhd: Uint8Array, ...traks: Uint8Array[]) => box("moov", mvhd, ...traks);
const mdat = () => box("mdat", zeros(16));
/** A 64-bit ("largesize") mdat: size field 1, then the real size as u64. */
const mdatLarge = () => {
  const payload = zeros(16);
  return concat(u32(1), ascii("mdat"), u64(16 + payload.length), payload);
};

interface M4aOptions {
  codec?: string;
  handler?: string;
  timescale?: number;
  duration?: number;
  moovAtEnd?: boolean;
  extraTrak?: Uint8Array;
  noMoov?: boolean;
  largesizeMdat?: boolean;
}

function m4aFile(options: M4aOptions = {}): Uint8Array {
  const {
    codec = "mp4a",
    handler = "soun",
    timescale = 1000,
    duration = 261400,
    moovAtEnd = false,
    extraTrak,
    noMoov = false,
    largesizeMdat = false,
  } = options;
  const data = largesizeMdat ? mdatLarge() : mdat();
  const index = moov(
    mvhdV0(timescale, duration),
    trak(handler, codec),
    ...(extraTrak ? [extraTrak] : [])
  );
  if (noMoov) return concat(ftyp(), data);
  return moovAtEnd ? concat(ftyp(), data, index) : concat(ftyp(), index, data);
}

const MP3_FRAME_HEADER = u8(0xff, 0xfb, 0x90, 0x64);
/** MPEG-1 layer III, 128 kbps, 44.1 kHz, no padding: floor(144 * 128000 / 44100) = 417 bytes. */
const MP3_FRAME_BYTES = 417;
const mp3Frame = () => concat(MP3_FRAME_HEADER, zeros(MP3_FRAME_BYTES - 4));
const mp3Frames = (count = 3) => concat(...Array.from({ length: count }, mp3Frame));
const id3Tag = () => concat(ascii("ID3"), u8(3, 0), u8(0), u8(0, 0, 0, 10), zeros(10));
/** "ID3", v2.3, no flags, a ten-byte tag with a syncsafe size of 10, then frames. */
const mp3WithId3 = () => concat(id3Tag(), mp3Frames());
const mp3WithoutId3 = () => mp3Frames();

const fileOf = (bytes: Uint8Array, name: string, type: string) =>
  new File([bytes as BlobPart], name, { type });

const VOICE_ID = "11111111-1111-4111-8111-111111111111";
const FRESH_ID = "22222222-2222-4222-8222-222222222222";
const UPPER_ID = "ABCDEF01-2345-4678-9abc-def012345678";
const REF = `pending:${VOICE_ID}`;

const pendingRecord = (ref: string, kind: PendingMedia["kind"] = "image"): PendingMedia => ({
  ref,
  kind,
  blob: new Blob(["the actual bytes"]),
  name: "photo.jpg",
  type: "image/jpeg",
  size: 16,
  folder: "hilman",
  capturedAt: "2026-09-21T00:00:00.000Z",
  attempts: 0,
});

const voiceRecord = (ref: string): PendingMedia => ({
  ...pendingRecord(ref, "voice-note"),
  name: "voice.m4a",
  type: "audio/mp4",
});

/** An uploader that always works, and says what it was asked to do. */
function goodUploader() {
  const calls: string[] = [];
  const uploader: MediaUploader = {
    async image(_blob, name) {
      calls.push(`image:${name}`);
      return { public_id: "hilman/uploaded-photo" };
    },
    async clip(_blob, name) {
      calls.push(`clip:${name}`);
      return { url: "https://clips.example/one.mp4" };
    },
    async voiceNote(_blob, contentType, assetId) {
      calls.push(`voice-note:${contentType}`);
      return { key: `voice-notes/${assetId}.m4a` };
    },
  };
  return { uploader, calls };
}

beforeEach(async () => {
  await dbClearAll();
});

/* ══ A. what a recording is allowed to be ══════════════════ */

test("an AAC m4a labelled audio/mp4 is accepted as audio/mp4 with its duration", async () => {
  const result = await checkVoiceFile(fileOf(m4aFile(), "memo.m4a", "audio/mp4"));
  assert.deepEqual(result, { ok: true, mime: "audio/mp4", duration: 261.4 });
});

test("an m4a labelled audio/x-m4a is accepted and reported as audio/mp4", async () => {
  const result = await checkVoiceFile(fileOf(m4aFile(), "memo.m4a", "audio/x-m4a"));
  assert.deepEqual(result, { ok: true, mime: "audio/mp4", duration: 261.4 });
});

test("an m4a with no content type is accepted from its .m4a name", async () => {
  const result = await checkVoiceFile(fileOf(m4aFile(), "Voice Memo.m4a", ""));
  assert.deepEqual(result, { ok: true, mime: "audio/mp4", duration: 261.4 });
});

test("an m4a whose index is written after its media is accepted with its duration", async () => {
  const result = await checkVoiceFile(
    fileOf(m4aFile({ moovAtEnd: true }), "memo.m4a", "audio/mp4")
  );
  assert.deepEqual(result, { ok: true, mime: "audio/mp4", duration: 261.4 });
});

test("a 64-bit mdat ahead of the index is walked past and the m4a is accepted", async () => {
  const result = await checkVoiceFile(
    fileOf(m4aFile({ moovAtEnd: true, largesizeMdat: true }), "memo.m4a", "audio/mp4")
  );
  assert.deepEqual(result, { ok: true, mime: "audio/mp4", duration: 261.4 });
});

test("a version 1 movie header gives the duration from its 64-bit length", async () => {
  // 44100 units a second for 90 seconds, in the version 1 layout.
  const index = moov(mvhdV1(44100, 44100 * 90), trak("soun", "mp4a"));
  const bytes = concat(ftyp(), index, mdat());
  const result = await checkVoiceFile(fileOf(bytes, "memo.m4a", "audio/mp4"));
  assert.deepEqual(result, { ok: true, mime: "audio/mp4", duration: 90 });
});

test("Apple Lossless audio is refused, and the reason says how to re-record it", async () => {
  const result = await checkVoiceFile(
    fileOf(m4aFile({ codec: "alac" }), "Lossless.m4a", "audio/mp4")
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /Apple Lossless/);
  assert.match(result.ok ? "" : result.reason, /Compressed/);
});

test("a file with a video track is refused, and the reason says it has video", async () => {
  const bytes = m4aFile({ extraTrak: trak("vide", "avc1") });
  const result = await checkVoiceFile(fileOf(bytes, "clip.m4a", "audio/mp4"));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /video/);
});

test("an audio codec most browsers cannot play is refused as something they can't play", async () => {
  const result = await checkVoiceFile(
    fileOf(m4aFile({ codec: "Opus" }), "memo.m4a", "audio/mp4")
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /can't play/);
});

test("an MP4 with no sound track is refused as having no audio", async () => {
  const result = await checkVoiceFile(
    fileOf(m4aFile({ handler: "text" }), "memo.m4a", "audio/mp4")
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /no audio/);
});

test("an MP4 with no index is refused as an unfinished recording", async () => {
  const result = await checkVoiceFile(
    fileOf(m4aFile({ noMoov: true }), "memo.m4a", "audio/mp4")
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /unfinished/);
});

test("an MP3 with an ID3 tag is accepted as audio/mpeg with no duration", async () => {
  const result = await checkVoiceFile(fileOf(mp3WithId3(), "memo.mp3", "audio/mpeg"));
  assert.deepEqual(result, { ok: true, mime: "audio/mpeg", duration: null });
});

test("an MP3 with no ID3 tag is accepted as audio/mpeg with no duration", async () => {
  const result = await checkVoiceFile(fileOf(mp3WithoutId3(), "memo.mp3", "audio/mpeg"));
  assert.deepEqual(result, { ok: true, mime: "audio/mpeg", duration: null });
});

test("a file named .mp3 that holds M4A bytes is judged by its bytes as audio/mp4", async () => {
  const result = await checkVoiceFile(fileOf(m4aFile(), "renamed.mp3", "audio/mpeg"));
  assert.deepEqual(result, { ok: true, mime: "audio/mp4", duration: 261.4 });
});

test("random bytes labelled audio/mpeg are refused as not looking like a recording", async () => {
  const result = await checkVoiceFile(
    fileOf(new Uint8Array(64).fill(0x41), "memo.mp3", "audio/mpeg")
  );
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /doesn't look like/);
});

test("a real WAV recording is refused and the reason names M4A or MP3", async () => {
  const wav = concat(ascii("RIFF"), u8(36, 0, 0, 0), ascii("WAVEfmt "), zeros(400));
  const result = await checkVoiceFile(fileOf(wav, "memo.wav", "audio/wav"));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /M4A or MP3/);
});

test("a recording in another common format is named by that format", async () => {
  const cases: Array<[Uint8Array, RegExp]> = [
    [concat(ascii("RIFF"), u8(36, 0, 0, 0), ascii("WAVEfmt "), zeros(400)), /This is a WAV recording/],
    [concat(ascii("OggS"), zeros(400)), /This is an Ogg recording/],
    [concat(ascii("fLaC"), zeros(400)), /This is a FLAC recording/],
    [concat(u8(0x1a, 0x45, 0xdf, 0xa3), zeros(400)), /This is a WebM recording/],
  ];
  for (const [bytes, expected] of cases) {
    const result = await checkVoiceFile(fileOf(bytes, "memo", "audio/ogg"));
    assert.match(result.ok ? "" : result.reason, expected);
  }
});

test("an m4a a picker mislabelled is judged by its bytes", async () => {
  // Some pickers call an .m4a audio/aac or video/mp4; the bytes decide.
  for (const [name, type] of [["memo.m4a", "audio/aac"], ["memo.mp4", "video/mp4"], ["memo.wav", "audio/wav"]]) {
    const result = await checkVoiceFile(fileOf(m4aFile(), name, type));
    assert.equal(result.ok && result.mime, "audio/mp4", `${name} ${type}`);
  }
});

test("a file plainly labelled as something other than audio is refused without opening it", async () => {
  const result = await checkVoiceFile(fileOf(m4aFile(), "photo.png", "image/png"));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /M4A or MP3/);
});

test("an MP3 with padding before its first frame, or stacked ID3 tags, is still found", async () => {
  for (const bytes of [concat(zeros(2), mp3Frames()), concat(id3Tag(), id3Tag(), mp3Frames())]) {
    const result = await checkVoiceFile(fileOf(bytes, "memo.mp3", "audio/mpeg"));
    assert.equal(result.ok && result.mime, "audio/mpeg");
  }
});

test("a lone frame header followed by noise is not taken for an MP3", async () => {
  const bytes = concat(MP3_FRAME_HEADER, new Uint8Array(2000).fill(0x41));
  const result = await checkVoiceFile(fileOf(bytes, "memo.mp3", "audio/mpeg"));
  assert.equal(result.ok, false);
});

test("an m4a whose stored index runs past the end of the file is refused as unfinished", async () => {
  const whole = m4aFile({ moovAtEnd: true });
  const cut = whole.slice(0, whole.length - 20);
  const result = await checkVoiceFile(fileOf(cut, "memo.m4a", "audio/mp4"));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /unfinished/);
});

test("an empty file is refused as empty", async () => {
  const result = await checkVoiceFile(fileOf(new Uint8Array(0), "empty.m4a", "audio/mp4"));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /empty/);
});

test("a 26 MB file is refused as too large for the 25 MB limit", async () => {
  const big = concat(ftyp(), zeros(26 * 1024 * 1024 - 24));
  const result = await checkVoiceFile(fileOf(big, "long.m4a", "audio/mp4"));
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /under 25/);
});

test("readMoov reports the sound codec, no video, and the duration of a moov box", async () => {
  const facts = readMoov(moov(mvhdV0(1000, 261400), trak("soun", "mp4a")));
  assert.deepEqual(facts, { codecs: ["mp4a"], hasVideo: false, duration: 261.4 });
});

/* ══ B. where a recording may be signed to ═════════════════ */

test("a Loop Clip with no kind is signed to clips/<fresh id>.mp4 by default", async () => {
  const plan = planR2Upload({ contentType: "video/mp4", size: 1000 }, () => FRESH_ID);
  assert.deepEqual(plan, {
    ok: true,
    key: `clips/${FRESH_ID}.mp4`,
    contentType: "video/mp4",
    size: 1000,
  });
});

test("a folder sent in the request body is ignored when planning the upload", async () => {
  const body = { contentType: "video/mp4", size: 1000, folder: "../evil" } as Parameters<
    typeof planR2Upload
  >[0];
  const plan = planR2Upload(body, () => FRESH_ID);
  assert.equal(plan.ok && plan.key.startsWith("clips/"), true);
});

test("a voice note labelled audio/mp4 is signed to voice-notes/<id>.m4a", async () => {
  const plan = planR2Upload(
    { kind: "voice-note", contentType: "audio/mp4", size: 1000 },
    () => FRESH_ID
  );
  assert.equal(plan.ok && plan.key, `voice-notes/${FRESH_ID}.m4a`);
});

test("a voice note labelled audio/mpeg is signed to voice-notes/<id>.mp3", async () => {
  const plan = planR2Upload(
    { kind: "voice-note", contentType: "audio/mpeg", size: 1000 },
    () => FRESH_ID
  );
  assert.equal(plan.ok && plan.key, `voice-notes/${FRESH_ID}.mp3`);
});

test("a voice note refuses audio/x-m4a, video/mp4 and audio/wav content types", async () => {
  for (const contentType of ["audio/x-m4a", "video/mp4", "audio/wav"]) {
    const plan = planR2Upload({ kind: "voice-note", contentType, size: 1000 }, () => FRESH_ID);
    assert.equal(plan.ok, false, `${contentType} should be refused`);
    assert.equal(plan.ok ? "" : plan.error, "Voice notes take M4A or MP3 recordings.");
  }
});

test("a Loop Clip refuses audio/mp4 because it only takes MP4 video", async () => {
  const plan = planR2Upload({ kind: "loop-clip", contentType: "audio/mp4", size: 1000 }, () => FRESH_ID);
  assert.equal(plan.ok, false);
  assert.equal(plan.ok ? "" : plan.error, "Loop Clip only accepts MP4 video for now.");
});

test("a voice note of size zero is refused", async () => {
  const plan = planR2Upload({ kind: "voice-note", contentType: "audio/mp4", size: 0 }, () => FRESH_ID);
  assert.equal(plan.ok, false);
});

test("a voice note of negative size is refused", async () => {
  const plan = planR2Upload({ kind: "voice-note", contentType: "audio/mp4", size: -1 }, () => FRESH_ID);
  assert.equal(plan.ok, false);
});

test("a voice note of a fractional size is refused", async () => {
  const plan = planR2Upload({ kind: "voice-note", contentType: "audio/mp4", size: 1.5 }, () => FRESH_ID);
  assert.equal(plan.ok, false);
});

test("a voice note of NaN size is refused", async () => {
  const plan = planR2Upload({ kind: "voice-note", contentType: "audio/mp4", size: NaN }, () => FRESH_ID);
  assert.equal(plan.ok, false);
});

test("a voice note whose size is not a number is refused", async () => {
  const plan = planR2Upload({ kind: "voice-note", contentType: "audio/mp4", size: "abc" }, () => FRESH_ID);
  assert.equal(plan.ok, false);
});

test("a voice note one byte over 25 MB is refused", async () => {
  const plan = planR2Upload(
    { kind: "voice-note", contentType: "audio/mp4", size: 25 * 1024 * 1024 + 1 },
    () => FRESH_ID
  );
  assert.equal(plan.ok, false);
  assert.equal(plan.ok ? "" : plan.status, 400);
});

test("a voice note of exactly 25 MB is accepted", async () => {
  const plan = planR2Upload(
    { kind: "voice-note", contentType: "audio/mp4", size: 25 * 1024 * 1024 },
    () => FRESH_ID
  );
  assert.equal(plan.ok, true);
});

test("a Loop Clip of 26 MB is accepted, since its limit is 50 MB", async () => {
  const plan = planR2Upload({ contentType: "video/mp4", size: 26 * 1024 * 1024 }, () => FRESH_ID);
  assert.equal(plan.ok, true);
});

test("an uppercase asset id is lowercased into the key without asking for a fresh id", async () => {
  let asked = 0;
  const plan = planR2Upload(
    { kind: "voice-note", contentType: "audio/mp4", size: 1000, assetId: UPPER_ID },
    () => {
      asked += 1;
      return FRESH_ID;
    }
  );
  assert.equal(plan.ok && plan.key, `voice-notes/${UPPER_ID.toLowerCase()}.m4a`);
  assert.equal(asked, 0);
});

test("a supplied asset id is used in place of a fresh id", async () => {
  let asked = 0;
  planR2Upload(
    { kind: "voice-note", contentType: "audio/mp4", size: 1000, assetId: VOICE_ID },
    () => {
      asked += 1;
      return FRESH_ID;
    }
  );
  assert.equal(asked, 0);
});

test("an asset id that is a path traversal is refused", async () => {
  const plan = planR2Upload(
    { kind: "voice-note", contentType: "audio/mp4", size: 1000, assetId: "../../x" },
    () => FRESH_ID
  );
  assert.equal(plan.ok, false);
  assert.equal(plan.ok ? "" : plan.error, "That asset id isn't allowed.");
});

test("an upload kind that is not in the policy table is refused", async () => {
  const plan = planR2Upload({ kind: "pdf", contentType: "audio/mp4", size: 1000 }, () => FRESH_ID);
  assert.equal(plan.ok, false);
  assert.equal(plan.ok ? "" : plan.error, "That kind of upload isn't allowed.");
});

test("a served Loop Clip key is accepted as video/mp4", async () => {
  assert.deepEqual(servableR2Key(["clips", "abc.mp4"]), {
    key: "clips/abc.mp4",
    contentType: "video/mp4",
  });
});

test("a served Loop Clip filename keeps its uppercase extension", async () => {
  assert.deepEqual(servableR2Key(["clips", "ABC.MP4"]), {
    key: "clips/ABC.MP4",
    contentType: "video/mp4",
  });
});

test("a served voice note .m4a key is accepted as audio/mp4", async () => {
  assert.deepEqual(servableR2Key(["voice-notes", `${VOICE_ID}.m4a`]), {
    key: `voice-notes/${VOICE_ID}.m4a`,
    contentType: "audio/mp4",
  });
});

test("a served voice note .mp3 key is accepted as audio/mpeg", async () => {
  assert.deepEqual(servableR2Key(["voice-notes", `${VOICE_ID}.mp3`]), {
    key: `voice-notes/${VOICE_ID}.mp3`,
    contentType: "audio/mpeg",
  });
});

test("a served key with a path traversal in its filename is refused", async () => {
  assert.equal(servableR2Key(["voice-notes", "../x.m4a"]), null);
});

test("a served voice note with an .mp4 extension is refused", async () => {
  assert.equal(servableR2Key(["voice-notes", `${VOICE_ID}.mp4`]), null);
});

test("a served clip with an .m4a extension is refused", async () => {
  assert.equal(servableR2Key(["clips", "a.m4a"]), null);
});

test("a served key with three segments is refused", async () => {
  assert.equal(servableR2Key(["voice-notes", "x", `${VOICE_ID}.m4a`]), null);
});

test("a served key with one segment is refused", async () => {
  assert.equal(servableR2Key(["clips.mp4"]), null);
});

test("a served key from a folder outside the policy table is refused", async () => {
  assert.equal(servableR2Key(["other", "x.mp4"]), null);
});

test("a served clip filename containing a NUL byte is refused", async () => {
  assert.equal(servableR2Key(["clips", "a\0.mp4"]), null);
});

test("a served voice note with an uppercase uuid is refused", async () => {
  assert.equal(servableR2Key(["voice-notes", `${UPPER_ID}.m4a`]), null);
});

test("a served key that is a string rather than segments is refused", async () => {
  assert.equal(servableR2Key("clips/abc.mp4"), null);
});

test("a served key whose folder is a number is refused", async () => {
  assert.equal(servableR2Key(["voice-notes", 5]), null);
});

test("an empty public base gives the proxy path for a key", async () => {
  assert.equal(r2PublicUrl("voice-notes/x.m4a", ""), "/api/r2/media/voice-notes/x.m4a");
});

test("an r2.dev public base is routed through the site's own proxy", async () => {
  assert.equal(
    r2PublicUrl("voice-notes/x.m4a", "https://pub-x.r2.dev"),
    "/api/r2/media/voice-notes/x.m4a"
  );
});

test("a custom media domain gives the key's direct address, without a trailing slash doubling", async () => {
  assert.equal(
    r2PublicUrl("voice-notes/x.m4a", "https://media.example.com/"),
    "https://media.example.com/voice-notes/x.m4a"
  );
});

/* ══ C. what the public may read back ══════════════════════ */

type FakeReplies = {
  get?: (input: Record<string, unknown>) => unknown;
  head?: (input: Record<string, unknown>) => unknown;
};

/** A stand-in bucket: records every command it is sent and answers from the replies. */
function fakeBucket(replies: FakeReplies) {
  const sent: Array<GetObjectCommand | HeadObjectCommand> = [];
  const send: R2Send = async (command) => {
    sent.push(command);
    if (command instanceof GetObjectCommand) {
      if (!replies.get) throw new Error("unexpected GET");
      return replies.get(command.input as unknown as Record<string, unknown>);
    }
    if (!replies.head) throw new Error("unexpected HEAD");
    return replies.head(command.input as unknown as Record<string, unknown>);
  };
  return { send, sent };
}

const streamOf = (text: string) => ({
  transformToWebStream: () =>
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    }),
});

const VOICE_PATH = ["voice-notes", `${VOICE_ID}.m4a`];
const url = "https://hilman.test/api/r2/media/voice-notes/x";

test("a GET of a voice note with no Range is answered 200 with the bytes", async () => {
  const bucket = fakeBucket({
    get: () => ({
      ContentType: "audio/mp4",
      ContentLength: 5,
      Body: streamOf("voice"),
    }),
  });
  const res = await serveR2("GET", new Request(url), VOICE_PATH, "bucket", bucket.send);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "voice");
});

test("a GET of a voice note is served with the R2 type, ranges, length and immutable caching", async () => {
  const bucket = fakeBucket({
    get: () => ({
      ContentType: "audio/mp4",
      ContentLength: 5,
      Body: streamOf("voice"),
    }),
  });
  const res = await serveR2("GET", new Request(url), VOICE_PATH, "bucket", bucket.send);
  assert.equal(res.headers.get("Content-Type"), "audio/mp4");
  assert.equal(res.headers.get("Accept-Ranges"), "bytes");
  assert.equal(res.headers.get("Content-Length"), "5");
  assert.equal(res.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
});

test("a GET with a Range is answered 206 with the Content-Range R2 returned", async () => {
  const bucket = fakeBucket({
    get: () => ({
      ContentType: "audio/mp4",
      ContentRange: "bytes 0-99/1000",
      ContentLength: 100,
      Body: streamOf("x".repeat(100)),
    }),
  });
  const req = new Request(url, { headers: { range: "bytes=0-99" } });
  const res = await serveR2("GET", req, VOICE_PATH, "bucket", bucket.send);
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Range"), "bytes 0-99/1000");
});

test("a GET with a Range asks R2 for that same byte range", async () => {
  const bucket = fakeBucket({
    get: () => ({
      ContentType: "audio/mp4",
      ContentRange: "bytes 0-99/1000",
      ContentLength: 100,
      Body: streamOf("x".repeat(100)),
    }),
  });
  const req = new Request(url, { headers: { range: "bytes=0-99" } });
  await serveR2("GET", req, VOICE_PATH, "bucket", bucket.send);
  const command = bucket.sent[0] as GetObjectCommand;
  assert.equal(command.input.Range, "bytes=0-99");
});

test("a mp3 recording with no stored type is served as audio/mpeg", async () => {
  const bucket = fakeBucket({ get: () => ({ Body: streamOf("abc") }) });
  const res = await serveR2(
    "GET",
    new Request(url),
    ["voice-notes", `${VOICE_ID}.mp3`],
    "bucket",
    bucket.send
  );
  assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
});

test("an m4a recording with no stored type is served as audio/mp4, never video/mp4", async () => {
  const bucket = fakeBucket({ get: () => ({ Body: streamOf("abc") }) });
  const res = await serveR2("GET", new Request(url), VOICE_PATH, "bucket", bucket.send);
  assert.equal(res.headers.get("Content-Type"), "audio/mp4");
});

test("a Range outside the object is answered 416 with the object's total length", async () => {
  const bucket = fakeBucket({
    get: () => {
      throw Object.assign(new Error("Range Not Satisfiable"), { name: "InvalidRange" });
    },
    head: () => ({ ContentLength: 1000 }),
  });
  const req = new Request(url, { headers: { range: "bytes=5000-6000" } });
  const res = await serveR2("GET", req, VOICE_PATH, "bucket", bucket.send);
  assert.equal(res.status, 416);
  assert.equal(res.headers.get("Content-Range"), "bytes */1000");
});

test("a missing object is answered 404", async () => {
  const bucket = fakeBucket({
    get: () => {
      throw Object.assign(new Error("No such key"), { name: "NoSuchKey" });
    },
  });
  const res = await serveR2("GET", new Request(url), VOICE_PATH, "bucket", bucket.send);
  assert.equal(res.status, 404);
});

test("a storage failure other than a missing object is answered 500", async () => {
  const bucket = fakeBucket({
    get: () => {
      throw new Error("boom");
    },
  });
  const res = await serveR2("GET", new Request(url), VOICE_PATH, "bucket", bucket.send);
  assert.equal(res.status, 500);
});

test("an invalid path is answered 400 without asking R2 for anything on GET", async () => {
  const bucket = fakeBucket({});
  const res = await serveR2("GET", new Request(url), ["clips", "../x.mp4"], "bucket", bucket.send);
  assert.equal(res.status, 400);
  assert.equal(bucket.sent.length, 0);
});

test("an invalid path is answered 400 without asking R2 for anything on HEAD", async () => {
  const bucket = fakeBucket({});
  const res = await serveR2(
    "HEAD",
    new Request(url, { method: "HEAD" }),
    ["voice-notes", "a.mp4"],
    "bucket",
    bucket.send
  );
  assert.equal(res.status, 400);
  assert.equal(bucket.sent.length, 0);
});

test("a HEAD of a valid voice note is answered 200 with no body", async () => {
  const bucket = fakeBucket({ head: () => ({ ContentType: "audio/mp4", ContentLength: 5 }) });
  const res = await serveR2(
    "HEAD",
    new Request(url, { method: "HEAD" }),
    VOICE_PATH,
    "bucket",
    bucket.send
  );
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
});

test("a HEAD of a valid voice note sends a HeadObject command and no GetObject", async () => {
  const bucket = fakeBucket({ head: () => ({ ContentType: "audio/mp4", ContentLength: 5 }) });
  await serveR2("HEAD", new Request(url, { method: "HEAD" }), VOICE_PATH, "bucket", bucket.send);
  assert.equal(bucket.sent.length, 1);
  assert.ok(bucket.sent[0] instanceof HeadObjectCommand);
});

test("a HEAD of a voice note that does not exist is answered 404", async () => {
  const bucket = fakeBucket({
    head: () => {
      throw Object.assign(new Error("Not found"), { name: "NotFound" });
    },
  });
  const res = await serveR2(
    "HEAD",
    new Request(url, { method: "HEAD" }),
    VOICE_PATH,
    "bucket",
    bucket.send
  );
  assert.equal(res.status, 404);
});

/* ══ D. the pipeline: stash, then upload ═══════════════════ */

test("a stored voice note goes through the voice-note uploader and nothing else", async () => {
  await dbPut("media", voiceRecord(REF));
  const { uploader, calls } = goodUploader();

  await flushPendingMedia(uploader);

  assert.deepEqual(calls, ["voice-note:audio/mp4"]);
});

test("a stored voice note resolves its placeholder to the R2 key it was uploaded under", async () => {
  await dbPut("media", voiceRecord(REF));
  const { uploader } = goodUploader();

  const report = await flushPendingMedia(uploader);

  assert.equal(
    report.resolved[REF.toLowerCase()],
    `voice-notes/${VOICE_ID}.m4a`
  );
});

test("a stored voice note is discarded locally once its key is written down", async () => {
  await dbPut("media", voiceRecord(REF));
  const { uploader } = goodUploader();

  await flushPendingMedia(uploader);

  assert.equal((await listPendingMedia()).length, 0);
  const durable = await listResolutions();
  assert.equal(durable.length, 1);
  assert.equal(durable[0].kind, "voice-note");
});

test("a voice note that fails offline keeps its local copy and counts the attempt", async () => {
  await dbPut("media", voiceRecord(REF));
  const uploader: MediaUploader = {
    async image() {
      throw new Error("not used");
    },
    async clip() {
      throw new Error("not used");
    },
    async voiceNote() {
      throw new TypeError("Failed to fetch");
    },
  };

  const report = await flushPendingMedia(uploader);

  assert.equal(report.offline, true);
  const [still] = await listPendingMedia();
  assert.equal(still.ref, REF);
  assert.equal(still.attempts, 1);
  assert.equal(still.blocked, undefined, "it is retried, not blocked");
});

test("a voice note refused as busy keeps its local copy and is not blocked", async () => {
  await dbPut("media", voiceRecord(REF));
  const uploader: MediaUploader = {
    async image() {
      throw new Error("not used");
    },
    async clip() {
      throw new Error("not used");
    },
    async voiceNote() {
      throw new UploadError("R2 is briefly unavailable.", 503, "transfer");
    },
  };

  await flushPendingMedia(uploader);

  const [still] = await listPendingMedia();
  assert.equal(still.attempts, 1);
  assert.equal(still.blocked, undefined);
});

test("a voice note permanently refused at signing is blocked with its message and keeps its bytes", async () => {
  await dbPut("media", voiceRecord(REF));
  const uploader: MediaUploader = {
    async image() {
      throw new Error("not used");
    },
    async clip() {
      throw new Error("not used");
    },
    async voiceNote() {
      throw new UploadError("That kind of upload isn't allowed.", 400, "sign");
    },
  };

  await flushPendingMedia(uploader);

  const [still] = await listPendingMedia();
  assert.equal(still.blocked, true);
  assert.equal(still.lastError, "That kind of upload isn't allowed.");
  assert.equal(still.blob.size > 0, true, "the bytes are still on the device");
});

test("stashing an m4a voice note stores it as a voice-note record typed audio/mp4", async () => {
  const file = fileOf(m4aFile(), "Voice Memo.m4a", "audio/x-m4a");

  const result = await stashMedia(file, "voice-notes", "voice-note");

  assert.equal(result.ok, true);
  const [stored] = await dbGetAll<PendingMedia>("media");
  assert.equal(stored.kind, "voice-note");
  assert.equal(stored.type, "audio/mp4", "even though the file was labelled audio/x-m4a");
});

test("stashing an m4a voice note returns its type, duration, size and name", async () => {
  const bytes = m4aFile();
  const file = fileOf(bytes, "Voice Memo.m4a", "audio/x-m4a");

  const result = await stashMedia(file, "voice-notes", "voice-note");

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok ? result.voice : null, {
    mime: "audio/mp4",
    duration: 261.4,
    bytes: bytes.length,
    name: "Voice Memo.m4a",
  });
});

test("stashing an Apple Lossless voice note is refused with the Apple Lossless reason", async () => {
  const file = fileOf(m4aFile({ codec: "alac" }), "Lossless.m4a", "audio/mp4");

  const result = await stashMedia(file, "voice-notes", "voice-note");

  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /Apple Lossless/);
});

test("stashing an Apple Lossless voice note stores nothing on the device", async () => {
  const file = fileOf(m4aFile({ codec: "alac" }), "Lossless.m4a", "audio/mp4");

  await stashMedia(file, "voice-notes", "voice-note");

  assert.equal((await dbGetAll("media")).length, 0);
});

/* ══ E. what the Studio calls it while it moves ════════════ */

const asPending = (kind: PendingMedia["kind"]) => ({ kind }) as PendingMedia;

test("an empty upload is described as photo", async () => {
  assert.equal(uploadNoun([]), "photo");
});

test("a single voice note upload is described as a recording", async () => {
  assert.equal(uploadNoun([asPending("voice-note")]), "recording");
});

test("several voice note uploads are still described as one recording noun", async () => {
  assert.equal(uploadNoun([asPending("voice-note"), asPending("voice-note")]), "recording");
});

test("a voice note together with a photo is described as files", async () => {
  assert.equal(uploadNoun([asPending("voice-note"), asPending("image")]), "file");
});

test("a single Loop Clip upload is described as a clip", async () => {
  assert.equal(uploadNoun([asPending("loop-clip")]), "clip");
});

test("the validating phase of a voice note reads as Checking", async () => {
  assert.equal(ingestLabel({ phase: "validating" }, "voice-note"), "Checking…");
});

test("the optimizing phase of a voice note names a recording, not a photo or clip", async () => {
  assert.match(ingestLabel({ phase: "optimizing" }, "voice-note"), /recording/);
});

/* ══ F. review follow-ups ══════════════════════════════════ */

test("an object stored under a voice-note key as text/html is still served as audio", async () => {
  const { send } = fakeBucket({ get: () => ({ ContentType: "text/html", ContentLength: 3, Body: null }) });
  const res = await serveR2("GET", new Request("http://x/"), ["voice-notes", `${VOICE_ID}.mp3`], "b", send);
  assert.equal(res.headers.get("Content-Type"), "audio/mpeg");
});

test("a large recording gets longer than the usual deadline to upload, a small one does not", () => {
  assert.equal(uploadDeadline(100 * 1024), uploadDeadline(0), "small files keep the usual deadline");
  assert.ok(uploadDeadline(25 * 1024 * 1024) >= 400_000, "25 MB is allowed at least ~64 KB/s");
});

test("a voice note whose server-named key the site can't store keeps its bytes and is not sent", async () => {
  await dbPut("media", voiceRecord(REF));
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    if (url.includes("/api/r2/sign")) {
      return Response.json({ uploadUrl: "https://r2.example/put", key: "clips/oops.mp4", publicUrl: "/x" });
    }
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    await flushPendingMedia();
  } finally {
    globalThis.fetch = realFetch;
  }

  assert.deepEqual(asked, ["/api/r2/sign"], "nothing was PUT anywhere");
  const [kept] = await listPendingMedia();
  assert.equal(kept?.ref, REF, "the recording is still on the device");
  assert.equal(kept?.blocked, true, "and held for the author to see, not retried for ever");
  assert.equal((await listResolutions()).length, 0, "and no mapping was written down");
});

/* ══ G. releasing a replaced or removed recording ══════════ */

const SAVE_ID = "44444444-4444-4444-8444-444444444444";
const ENTRY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** A queued journal save whose voice note names `ref`, enqueued the way the editor does it. */
async function queueSaveNaming(ref: string) {
  await enqueue({
    mutationId: SAVE_ID,
    entity: "journal",
    entityId: ENTRY_ID,
    localId: `journal:${ENTRY_ID}`,
    baseUpdatedAt: null,
    payload: {
      fields: { title: "An entry", voice_note: { src: ref } },
      blocks: [],
      tagIds: [],
    },
  });
}

/** A stored conflict whose own version of the entry names `ref`. */
async function conflictNaming(ref: string) {
  await recordConflict({
    key: `journal:${ENTRY_ID}`,
    entity: "journal",
    id: ENTRY_ID,
    mine: { fields: { title: "Mine", voice_note: { src: ref } }, blocks: [], tagIds: [] },
    server: { id: ENTRY_ID, updatedAt: "x", fields: {}, blocks: [], tagIds: [] },
    differences: ["voice_note"],
    noticedAt: "2026-09-21T00:00:00.000Z",
  });
}

test("a stashed voice note that nothing names is discarded and reported as released", async () => {
  await dbPut("media", voiceRecord(REF));

  const released = await releaseIfUnreferenced(REF);

  assert.equal(released, true);
  assert.equal((await listPendingMedia()).some((item) => item.ref === REF), false);
});

test("a stashed voice note named by a queued save is kept and reported as not released", async () => {
  await dbPut("media", voiceRecord(REF));
  await queueSaveNaming(REF);

  const released = await releaseIfUnreferenced(REF);

  assert.equal(released, false);
  assert.equal((await listPendingMedia()).some((item) => item.ref === REF), true);
});

test("a stashed voice note named by a stored conflict is kept and reported as not released", async () => {
  await dbPut("media", voiceRecord(REF));
  await conflictNaming(REF);

  const released = await releaseIfUnreferenced(REF);

  assert.equal(released, false);
  assert.equal((await listPendingMedia()).some((item) => item.ref === REF), true);
});

test("a queued save naming the placeholder in uppercase still keeps its bytes", async () => {
  const lowerRef = `pending:${UPPER_ID.toLowerCase()}`;
  await dbPut("media", voiceRecord(lowerRef));
  await queueSaveNaming(`pending:${UPPER_ID}`);

  const released = await releaseIfUnreferenced(lowerRef);

  assert.equal(released, false);
  assert.equal((await listPendingMedia()).some((item) => item.ref === lowerRef), true);
});

test("a queued save naming a different placeholder does not keep this one", async () => {
  const otherRef = `pending:${FRESH_ID}`;
  await dbPut("media", voiceRecord(REF));
  await dbPut("media", voiceRecord(otherRef));
  await queueSaveNaming(otherRef);

  const released = await releaseIfUnreferenced(REF);

  assert.equal(released, true);
  const remaining = (await listPendingMedia()).map((item) => item.ref);
  assert.equal(remaining.includes(REF), false);
  assert.equal(remaining.includes(otherRef), true, "the placeholder the queued save names is untouched");
});
