import assert from "node:assert/strict";
import test, { after } from "node:test";

import {
  closeSharedDatabases,
  freshDatabase,
  latestMigration,
  sharedDatabase,
  withRollback,
  type Harness,
} from "./support/pg";
import { normaliseFields, normaliseJournalFields } from "../lib/studio-content";
import { docFromInitial, fieldsFor } from "../components/admin/editor-doc";
import {
  describeConflict,
  describeMalformedMutation,
  describeUnresolvedMedia,
  type SyncMutation,
} from "../lib/studio-sync-contract";
import {
  checkVoiceNote,
  formatVoiceNoteDuration,
  MAX_VOICE_NOTE_BYTES,
  publicVoiceNote,
} from "../lib/voice-note";
import type { JournalPost, JournalVoiceNote, Project } from "../lib/types";

/**
 * A recording read aloud by its author, stored as a property of a journal entry.
 *
 * Three layers have to agree on what a voice note is: lib/voice-note.ts (the
 * TypeScript rule), the sync contract and content normaliser that call it, and
 * migration 0014's CHECK constraint plus save_journal_post. These tests pin each
 * layer, and run the SQL in a real PostgreSQL so the CHECK and the
 * absent-means-keep / null-means-remove rule are exercised, not just read.
 */

const LATEST = latestMigration();

const UUID = "0b9d1f4e-2a3c-4d5e-8f90-123456789abc";
const KEY_M4A = `voice-notes/${UUID}.m4a`;
const KEY_MP3 = `voice-notes/${UUID}.mp3`;
const PENDING = `pending:${UUID}`;

const note = (extra: Record<string, unknown> = {}) =>
  ({
    src: KEY_M4A,
    mime_type: "audio/mp4",
    duration_seconds: 261.4,
    bytes: 1000,
    ...extra,
  }) as JournalVoiceNote;

const mp3Note = () => ({ src: KEY_MP3, mime_type: "audio/mpeg" });

const journal = (extra: Record<string, unknown> = {}) => ({
  title: "An entry",
  slug: "an-entry",
  status: "draft",
  reading_minutes: "3",
  ...extra,
});

const project = (extra: Record<string, unknown> = {}) => ({
  title: "A piece",
  slug: "a-piece",
  stream: "visual-design",
  status: "draft",
  ...extra,
});

async function saveJournal(h: Harness, id: string | null, data: Record<string, unknown>) {
  const [row] = await h.query<{ id: string }>(
    "select public.save_journal_post($1::uuid, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as id",
    [id, JSON.stringify(data)]
  );
  return row.id;
}

async function storedNote(h: Harness, id: string) {
  const [row] = await h.query<{ voice_note: JournalVoiceNote | null }>(
    "select voice_note from journal_posts where id = $1",
    [id]
  );
  return row.voice_note;
}

const journalRow = (extra: Record<string, unknown> = {}) =>
  ({
    id: "abc",
    title: "An entry",
    slug: "an-entry",
    status: "published",
    published_at: null,
    ...extra,
  }) as unknown as Project & JournalPost;

const mutation = (fields: Record<string, unknown>, over: Partial<SyncMutation> = {}): SyncMutation => ({
  mutationId: "11111111-2222-4333-8444-555555555555",
  entity: "journal",
  entityId: null,
  localId: "journal:new-abc",
  baseUpdatedAt: null,
  payload: { fields: { title: "A morning note", ...fields }, blocks: [], tagIds: [] },
  queuedAt: "2026-09-16T04:00:00.000Z",
  attempts: 0,
  ...over,
});

/* ══ A. the rule itself ════════════════════════════════════ */

test("a valid m4a voice note is accepted and comes back unchanged", () => {
  const input = note();
  const result = checkVoiceNote(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, input);
});

test("an mp3 note without a duration or size is accepted with a null duration and no bytes key", () => {
  const result = checkVoiceNote(mp3Note());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value!.duration_seconds, null);
  assert.equal("bytes" in result.value!, false);
});

test("null is a valid voice note and means no recording", () => {
  assert.deepEqual(checkVoiceNote(null), { ok: true, value: null });
});

test("a pending recording is refused by default and accepted when pending is allowed", () => {
  const pending = note({ src: PENDING });
  assert.equal(checkVoiceNote(pending).ok, false);
  assert.equal(checkVoiceNote(pending, { allowPending: true }).ok, true);
});

test("a recording whose extension does not match its mime type is refused", () => {
  assert.equal(checkVoiceNote(note({ mime_type: "audio/mpeg" })).ok, false);
});

test("an unknown mime type is refused, including the non-canonical audio/x-m4a", () => {
  assert.equal(checkVoiceNote(note({ mime_type: "audio/wav" })).ok, false);
  assert.equal(checkVoiceNote(note({ mime_type: "audio/x-m4a" })).ok, false);
});

test("keys beyond the four known ones are dropped from the returned value", () => {
  const result = checkVoiceNote(note({ evil: 1 }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("evil" in result.value!, false);
});

test("a duration that is not a finite number up to two hours is dropped to null, not refused", () => {
  // A browser's reading of the length is unreliable; refusing over it would
  // hold the author's whole save back. See checkVoiceNote().
  for (const bad of [0, -1, NaN, Infinity, 7201, "60"]) {
    const check = checkVoiceNote(note({ duration_seconds: bad }));
    assert.equal(check.ok, true, String(bad));
    assert.equal(check.ok && check.value!.duration_seconds, null, String(bad));
  }
  const missing = checkVoiceNote({ src: KEY_M4A, mime_type: "audio/mp4" });
  assert.equal(missing.ok && missing.value!.duration_seconds, null, "a missing duration is null");
  assert.equal(checkVoiceNote(note({ duration_seconds: 7200 })).ok, true);
});

test("a size that is not a whole number of bytes within 25 MB is dropped, not refused", () => {
  for (const bad of [1.5, 0, MAX_VOICE_NOTE_BYTES + 1, "10"]) {
    const check = checkVoiceNote(note({ bytes: bad }));
    assert.equal(check.ok, true, String(bad));
    assert.equal(check.ok && "bytes" in check.value!, false, String(bad));
  }
  assert.equal(checkVoiceNote(note({ bytes: 25 * 1024 * 1024 })).ok, true);
});

test("anything that is not a plain object is refused", () => {
  for (const bad of ["str", 42, [], undefined]) {
    assert.equal(checkVoiceNote(bad).ok, false, JSON.stringify(bad) ?? String(bad));
  }
});

test("a source that is not a stored voice-notes key is refused", () => {
  const bad = [
    `clips/${UUID}.mp4`,
    `voice-notes/../x.m4a`,
    `https://example.com/a.m4a`,
    `voice-notes/${UUID.toUpperCase()}.m4a`,
  ];
  for (const src of bad) {
    assert.equal(checkVoiceNote(note({ src })).ok, false, src);
  }
});

test("the public page gets nothing for a malformed, pending or absent recording, and the note for a valid one", () => {
  assert.equal(publicVoiceNote({ src: "nope" }), null);
  assert.equal(publicVoiceNote(note({ src: PENDING })), null);
  assert.equal(publicVoiceNote(undefined), null);
  assert.deepEqual(publicVoiceNote(note()), note());
});

test("durations are shown as m:ss, or h:mm:ss past an hour, and blank when unknown", () => {
  assert.equal(formatVoiceNoteDuration(0), "0:00");
  assert.equal(formatVoiceNoteDuration(261.4), "4:21");
  assert.equal(formatVoiceNoteDuration(59.6), "1:00");
  assert.equal(formatVoiceNoteDuration(3723), "1:02:03");
  assert.equal(formatVoiceNoteDuration(null), "");
  assert.equal(formatVoiceNoteDuration(NaN), "");
  assert.equal(formatVoiceNoteDuration(-1), "");
});

/* ══ B. the content normaliser at the save boundary ════════ */

test("a journal payload with no voice_note key gets no voice_note property", () => {
  const result = normaliseJournalFields({ title: "x" });
  assert.equal("voice_note" in result, false);
});

test("a journal payload with voice_note undefined gets no voice_note property", () => {
  const result = normaliseJournalFields({ title: "x", voice_note: undefined });
  assert.equal("voice_note" in result, false);
});

test("a journal payload with voice_note null keeps an explicit null", () => {
  const result = normaliseJournalFields({ title: "x", voice_note: null });
  assert.equal("voice_note" in result, true);
  assert.equal(result.voice_note, null);
});

test("a valid voice note is copied through with its extra keys stripped", () => {
  const result = normaliseJournalFields({ title: "x", voice_note: note({ evil: "y" }) });
  assert.deepEqual(result.voice_note, note());
});

test("an invalid voice note is dropped so the stored recording is kept", () => {
  assert.equal("voice_note" in normaliseJournalFields({ title: "x", voice_note: note({ src: PENDING }) }), false);
  assert.equal("voice_note" in normaliseJournalFields({ title: "x", voice_note: note({ mime_type: "audio/wav" }) }), false);
});

test("a project payload never carries a voice note", () => {
  const result = normaliseFields("project", { title: "x", voice_note: note() });
  assert.equal("voice_note" in result, false);
});

/* ══ C. the editor document ════════════════════════════════ */

test("a journal row without a recording produces a document with no voiceNote property", () => {
  const doc = docFromInitial(journalRow());
  assert.equal("voiceNote" in doc, false);
  assert.equal(JSON.stringify(doc).includes("voiceNote"), false);
});

test("a journal row whose recording is null produces a document with no voiceNote property", () => {
  const doc = docFromInitial(journalRow({ voice_note: null }));
  assert.equal("voiceNote" in doc, false);
});

test("a journal row with a recording carries it into the document unchanged", () => {
  const doc = docFromInitial(journalRow({ voice_note: note() }));
  assert.deepEqual(doc.voiceNote, note());
});

test("the journal fields send the recording only when the document has an opinion about it", () => {
  const base = docFromInitial(journalRow());
  assert.equal("voice_note" in fieldsFor("journal", base), false, "absent");

  assert.equal(fieldsFor("journal", { ...base, voiceNote: null }).voice_note, null, "removed");
  assert.deepEqual(fieldsFor("journal", { ...base, voiceNote: note() }).voice_note, note(), "set");
});

test("the project fields never send a voice note, even when the document has one", () => {
  const base = docFromInitial(journalRow({ voice_note: note() }));
  const doc = { ...base, voiceNote: note() };
  assert.equal("voice_note" in fieldsFor("project", doc), false);
});

/* ══ D. the sync contract ══════════════════════════════════ */

test("a queued journal save whose recording is still on the device is well formed", () => {
  const m = mutation({ voice_note: { src: PENDING, mime_type: "audio/mp4", duration_seconds: null } });
  assert.equal(describeMalformedMutation(m), null);
});

test("a queued journal save with a recording of an unknown type is described as malformed", () => {
  const m = mutation({ voice_note: { src: PENDING, mime_type: "audio/wav", duration_seconds: null } });
  assert.match(String(describeMalformedMutation(m)), /M4A|MP3/);
});

test("a queued journal save with a null or absent recording is well formed", () => {
  assert.equal(describeMalformedMutation(mutation({ voice_note: null })), null);
  assert.equal(describeMalformedMutation(mutation({})), null);
});

test("a payload that still names a device-only file is refused by the server boundary", () => {
  assert.notEqual(
    describeUnresolvedMedia({ fields: { title: "x", voice_note: { src: PENDING } }, blocks: [], tagIds: [] }),
    null
  );
  assert.notEqual(
    describeUnresolvedMedia({
      fields: { title: "x" },
      blocks: [{ id: "b1", type: "image", position: 0, data: { public_id: PENDING } }] as never,
      tagIds: [],
    }),
    null
  );
  assert.equal(
    describeUnresolvedMedia({ fields: { title: "x", voice_note: note() }, blocks: [], tagIds: [] }),
    null
  );
});

test("a conflict names the voice note when the two recordings differ", () => {
  const mine = { fields: { title: "t", voice_note: note() }, blocks: [], tagIds: [] };
  const theirs = {
    fields: { title: "t", voice_note: note({ bytes: 2000 }) },
    blocks: [],
    tagIds: [],
  };
  assert.ok(describeConflict(mine, theirs).includes("voice_note"));
});

test("a conflict does not name the voice note when the recordings are the same with keys in another order", () => {
  const reordered = { bytes: 1000, duration_seconds: 261.4, mime_type: "audio/mp4", src: KEY_M4A };
  const mine = { fields: { title: "t", voice_note: note() }, blocks: [], tagIds: [] };
  const theirs = { fields: { title: "t", voice_note: reordered }, blocks: [], tagIds: [] };
  assert.equal(describeConflict(mine, theirs).includes("voice_note"), false);
});

test("a conflict names the project meta when the two meta objects differ", () => {
  const mine = { fields: { title: "t", meta: { a: 1, b: 2 } }, blocks: [], tagIds: [] };
  const theirs = { fields: { title: "t", meta: { a: 1, b: 3 } }, blocks: [], tagIds: [] };
  assert.ok(describeConflict(mine, theirs).includes("meta"));
});

test("a conflict does not name the project meta when equal objects only differ in key order", () => {
  const mine = { fields: { title: "t", meta: { a: 1, b: 2 } }, blocks: [], tagIds: [] };
  const theirs = { fields: { title: "t", meta: { b: 2, a: 1 } }, blocks: [], tagIds: [] };
  assert.equal(describeConflict(mine, theirs).includes("meta"), false);
});

/* ══ E. the database, in a real PostgreSQL ═════════════════ */

test("an insert with a valid recording stores it", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {
    const id = await saveJournal(h, null, journal({ voice_note: note() }));
    assert.deepEqual(await storedNote(h, id), note());
  });
});

test("an update without a voice_note key keeps the stored recording", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {
    const id = await saveJournal(h, null, journal({ voice_note: note() }));
    await saveJournal(h, id, journal({ title: "Changed title" }));

    const [row] = await h.query<{ title: string }>("select title from journal_posts where id = $1", [id]);
    assert.equal(row.title, "Changed title", "the update ran");
    assert.deepEqual(await storedNote(h, id), note(), "and the recording survived it");
  });
});

test("an update with voice_note null clears the stored recording", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {
    const id = await saveJournal(h, null, journal({ voice_note: note() }));
    await saveJournal(h, id, journal({ voice_note: null }));
    assert.equal(await storedNote(h, id), null);
  });
});

test("an update with a different valid recording replaces the stored one", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {
    const id = await saveJournal(h, null, journal({ voice_note: note() }));
    await saveJournal(h, id, journal({ voice_note: mp3Note() }));
    assert.deepEqual(await storedNote(h, id), mp3Note());
  });
});

test("the database refuses every malformed recording with a check violation and keeps the stored one", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {
    const id = await saveJournal(h, null, journal({ voice_note: note() }));

    const refused: Array<[string, unknown]> = [
      ["a pending source", note({ src: PENDING })],
      ["a mime/extension mismatch", note({ mime_type: "audio/mpeg" })],
      ["an extra key", note({ evil: 1 })],
      ["a missing mime type", { src: KEY_M4A, duration_seconds: 1 }],
      ["a null mime type", { src: KEY_M4A, mime_type: null, duration_seconds: 1 }],
      ["a non-numeric duration", note({ duration_seconds: "x" })],
      ["a size over the limit", note({ bytes: 26214401 })],
      ["a fractional size", note({ bytes: 1.5 })],
      ["a JSON string instead of an object", "voice-notes/x.m4a"],
    ];

    for (const [label, bad] of refused) {
      await h.db.exec("savepoint refused");
      try {
        await assert.rejects(
          () => saveJournal(h, id, journal({ voice_note: bad })),
          (err: { code?: string }) => err.code === "23514",
          label
        );
      } finally {
        await h.db.exec("rollback to savepoint refused");
      }
      assert.deepEqual(await storedNote(h, id), note(), `after refusing ${label}`);
    }
  });
});

test("saving through the studio's sync function without a recording key keeps the stored recording", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {
    const id = await saveJournal(h, null, journal({ voice_note: note() }));

    const [{ t }] = await h.query<{ t: string }>(
      "select updated_at::text as t from journal_posts where id = $1",
      [id]
    );
    const [{ out }] = await h.query<{ out: { status: string } }>(
      "select public.save_content_synced(gen_random_uuid(), 'journal', $1::uuid, $2::timestamptz, $3::jsonb, '[]'::jsonb, '{}'::uuid[]) as out",
      [id, t, JSON.stringify(journal({ title: "Revised through sync" }))]
    );

    assert.equal(out.status, "saved");
    assert.deepEqual(await storedNote(h, id), note());
  });
});

test("applying the latest migration a second time succeeds and a stored recording survives", async () => {
  const h = await freshDatabase(LATEST);
  await h.signInAsOwner();
  const id = await saveJournal(h, null, journal({ voice_note: note() }));

  await h.apply(LATEST);

  assert.deepEqual(await storedNote(h, id), note());
  await h.close();
});

test("an entry written before the column existed gains it as null and can then be given a recording", async () => {
  const h = await freshDatabase(13);
  await h.signInAsOwner();
  const id = await saveJournal(h, null, journal({ status: "published" }));

  await h.applyThrough(13, LATEST);

  const [row] = await h.query<{ title: string; voice_note: JournalVoiceNote | null }>(
    "select title, voice_note from journal_posts where id = $1",
    [id]
  );
  assert.equal(row.title, "An entry", "the existing row is still there");
  assert.equal(row.voice_note, null, "with no recording");

  await saveJournal(h, id, journal({ status: "published", voice_note: note() }));
  assert.deepEqual(await storedNote(h, id), note());
  await h.close();
});

after(async () => {
  await closeSharedDatabases();
});

/* ══ F. review follow-ups ══════════════════════════════════ */

test("a conflict does not name a field this save leaves alone", () => {
  const mine = { fields: { title: "Same" }, blocks: [], tagIds: [] };
  const theirs = { fields: { title: "Same", voice_note: note(), created_at: "2026-01-01" }, blocks: [], tagIds: [] };
  assert.deepEqual(describeConflict(mine, theirs), []);
});

test("a recording loaded from the database serialises the same as one patched in during the session", () => {
  // jsonb hands keys back in its own order; the document must not care.
  const reordered = { bytes: 1000, duration_seconds: 261.4, mime_type: "audio/mp4", src: KEY_M4A } as JournalVoiceNote;
  const loaded = docFromInitial(journalRow({ voice_note: reordered }));
  const patched = { ...docFromInitial(journalRow()), voiceNote: checkVoiceNote(note()).ok ? (checkVoiceNote(note()) as { value: JournalVoiceNote }).value : null };
  assert.equal(JSON.stringify(loaded), JSON.stringify(patched));
});
