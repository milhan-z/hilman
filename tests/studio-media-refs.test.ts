import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPendingRefs,
  hasPendingRefs,
  isPendingRef,
  replacePendingRefs,
} from "../lib/studio-media-refs";

/**
 * A photo taken with no signal is represented by a placeholder string until it
 * is uploaded. The single rule these tests exist to protect: a placeholder
 * must never survive into something the public site reads.
 *
 * That means finding every one of them, wherever it is hiding, and replacing
 * every one of them when the upload lands.
 */

const REF_A = "pending:11111111-2222-4333-8444-555555555555";
const REF_B = "pending:99999999-8888-4777-8666-555555555555";

test("a placeholder is recognisable, a Cloudinary id is not", () => {
  assert.equal(isPendingRef(REF_A), true);
  assert.equal(isPendingRef("hilman/kopi-pagi"), false);
  assert.equal(isPendingRef("https://res.cloudinary.com/x/image/upload/a.jpg"), false);
  assert.equal(isPendingRef(null), false);
  assert.equal(isPendingRef(undefined), false);
});

test("placeholders are found wherever they are nested", () => {
  const block = {
    type: "gallery",
    data: {
      items: [{ public_id: REF_A }, { public_id: "hilman/real-one" }, { public_id: REF_B }],
      caption: "pagi",
    },
  };
  assert.deepEqual(collectPendingRefs(block).sort(), [REF_A, REF_B].sort());
  assert.equal(hasPendingRefs(block), true);
  assert.equal(hasPendingRefs({ data: { public_id: "hilman/real-one" } }), false);
});

test("a placeholder buried in a serialised draft is still found", () => {
  // The editor stores its whole form as one JSON string. A check that only
  // looked at known fields would walk straight past this one.
  const draft = { key: "journal:new", value: { snapshot: JSON.stringify({ blocks: [{ data: { public_id: REF_A } }] }) } };
  assert.deepEqual(collectPendingRefs(draft), [REF_A]);
});

test("resolving swaps every occurrence, including inside a serialised draft", () => {
  const draft = {
    key: "journal:new",
    value: { snapshot: JSON.stringify({ cover: REF_A, blocks: [{ data: { public_id: REF_A } }] }) },
  };

  const swapped = replacePendingRefs(draft, { [REF_A]: "hilman/kopi-pagi" });

  assert.equal(collectPendingRefs(swapped).length, 0);
  const snapshot = JSON.parse(swapped.value.snapshot);
  assert.equal(snapshot.cover, "hilman/kopi-pagi");
  assert.equal(snapshot.blocks[0].data.public_id, "hilman/kopi-pagi");
});

test("a placeholder with no upload yet is left exactly as it was", () => {
  const block = { data: { items: [{ public_id: REF_A }, { public_id: REF_B }] } };
  const swapped = replacePendingRefs(block, { [REF_A]: "hilman/one" });

  assert.equal(swapped.data.items[0].public_id, "hilman/one");
  assert.equal(swapped.data.items[1].public_id, REF_B, "the unresolved one must survive");
});

test("an empty resolution map returns the same object, so callers can skip a write", () => {
  const block = { data: { public_id: REF_A } };
  assert.equal(replacePendingRefs(block, {}), block);
});

test("values that are not content are carried through untouched", () => {
  // A stashed photo's own record holds a Blob. Rebuilding it as a plain object
  // would quietly destroy the bytes.
  const blob = { size: 12, type: "image/jpeg" }; // stand-in for a Blob
  Object.setPrototypeOf(blob, { constructor: function Blob() {} });

  const entry = { ref: REF_A, blob, name: "photo.jpg" };
  const swapped = replacePendingRefs(entry, { [REF_A]: "hilman/one" });

  assert.equal(swapped.ref, "hilman/one");
  assert.equal(swapped.blob, blob, "a non-plain object must come back by reference");
});

test("matching is case-insensitive but resolution is keyed consistently", () => {
  const upper = REF_A.toUpperCase().replace("PENDING:", "pending:");
  assert.deepEqual(collectPendingRefs({ id: upper }), [REF_A]);
  assert.equal(replacePendingRefs({ id: upper }, { [REF_A]: "hilman/one" }).id, "hilman/one");
});
