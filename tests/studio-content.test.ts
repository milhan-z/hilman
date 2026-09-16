import assert from "node:assert/strict";
import test from "node:test";
import { normaliseJournalFields, normaliseProjectFields } from "../lib/studio-content";

/**
 * A save now arrives two ways: as a form post from the editor, and as JSON
 * replayed from the outbox once a phone is back on a network. If those two
 * shapes normalise differently, the same edit would land differently depending
 * on whether there was signal at the time — which is the kind of bug nobody
 * ever reproduces.
 */

test("a form checkbox and a JSON boolean mean the same thing", () => {
  for (const truthy of [true, "on", "true", 1]) {
    assert.equal(normaliseJournalFields({ title: "x", featured: truthy }).featured, true, String(truthy));
  }
  for (const falsy of [false, "off", "", null, undefined, 0]) {
    assert.equal(normaliseJournalFields({ title: "x", featured: falsy }).featured, false, String(falsy));
  }
});

test("only an explicit 'published' publishes", () => {
  assert.equal(normaliseJournalFields({ title: "x", status: "published" }).status, "published");
  for (const value of ["draft", "", "PUBLISHED", null, undefined, true]) {
    assert.equal(normaliseJournalFields({ title: "x", status: value }).status, "draft", String(value));
  }
});

test("a missing slug is derived from the title rather than saved empty", () => {
  assert.equal(normaliseProjectFields({ title: "Pagi di ITS" }).slug, "pagi-di-its");
  assert.equal(normaliseProjectFields({ title: "Pagi di ITS", slug: "  " }).slug, "pagi-di-its");
  assert.equal(normaliseProjectFields({ title: "Pagi di ITS", slug: "Custom Slug" }).slug, "custom-slug");
});

test("an empty stream falls back instead of reaching the database as ''", () => {
  // '' is not a member of the stream_kind enum, so it would fail the cast and
  // the editor would get a Postgres error instead of a default.
  assert.equal(normaliseProjectFields({ title: "x", stream: "" }).stream, "visual-design");
  assert.equal(normaliseProjectFields({ title: "x" }).stream, "visual-design");
  assert.equal(normaliseProjectFields({ title: "x", stream: "digital-lab" }).stream, "digital-lab");
});

test("text fields are trimmed the same from either door", () => {
  const fromForm = normaliseProjectFields({
    title: "  Kopi  ",
    subtitle: "  pagi  ",
    excerpt: "  catatan  ",
    year: " 2026 ",
  });
  const fromJson = normaliseProjectFields({
    title: "Kopi",
    subtitle: "pagi",
    excerpt: "catatan",
    year: 2026,
  });
  assert.deepEqual(fromForm, fromJson);
});

test("meta is only carried through when it is an object", () => {
  assert.deepEqual(normaliseProjectFields({ title: "x", meta: { role: "design" } }).meta, {
    role: "design",
  });
  for (const bad of [null, undefined, "{}", ["a"], 7]) {
    assert.deepEqual(normaliseProjectFields({ title: "x", meta: bad }).meta, {}, String(bad));
  }
});
