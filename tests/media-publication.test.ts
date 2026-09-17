import assert from "node:assert/strict";
import test from "node:test";
import { collectPendingRefs, hasPendingRefs, replacePendingRefs } from "../lib/studio-media-refs";
import { getJournalQualityIssues } from "../lib/content-quality";
import { describeEditor } from "../lib/studio-editor-state";
import { readTimeMinutes } from "../lib/read-time";

/**
 * Publishing a Journal that has photographs in it.
 *
 * The reported failure looked like a media problem — it appeared the moment
 * photographs were added — and was not one: the quality gate was refusing the
 * document because a gallery block carries `layout: "grid"`. That is fixed in
 * tests/starter-prompts.test.ts. This file checks the media path separately, so
 * "it was the gate" is a conclusion rather than an assumption.
 *
 * The invariant that matters: a public document must never be stored naming a
 * photograph that exists only on one phone. `pending:<uuid>` is that
 * placeholder, and the outbox holds back any payload still carrying one.
 */

const PENDING_A = "pending:11111111-2222-4333-8444-555555555555";
const PENDING_B = "pending:66666666-7777-4888-8999-aaaaaaaaaaaa";

const prose = [
  { type: "paragraph" as const, data: { text: "The port works hardest when nobody is watching." } },
];

const journalIssues = (blocks: any[]) =>
  getJournalQualityIssues({ title: "Harbour", excerpt: "A note.", blocks });

/* ── the cases §5 asks for, each published on its own ─────── */

test("text only publishes", () => {
  assert.deepEqual(journalIssues(prose), []);
  assert.equal(hasPendingRefs({ blocks: prose }), false);
});

test("text plus one resolved photograph publishes", () => {
  const blocks = [
    ...prose,
    { type: "image", data: { public_id: "journal/harbour", alt: "Cranes", caption: "Six a.m." } },
  ];
  assert.deepEqual(journalIssues(blocks), []);
  assert.equal(hasPendingRefs({ blocks }), false);
});

test("a gallery of two resolved photographs publishes", () => {
  const blocks = [
    ...prose,
    {
      type: "gallery",
      data: {
        layout: "grid",
        items: [
          { public_id: "journal/a", alt: "", caption: "" },
          { public_id: "journal/b", alt: "", caption: "" },
        ],
      },
    },
  ];
  assert.deepEqual(journalIssues(blocks), []);
  assert.equal(hasPendingRefs({ blocks }), false);
});

test("a gallery of six resolved photographs publishes", () => {
  const blocks = [
    ...prose,
    {
      type: "gallery",
      data: {
        layout: "grid",
        items: Array.from({ length: 6 }, (_, i) => ({
          public_id: `journal/photo-${i}`,
          alt: "",
          caption: "",
        })),
      },
    },
  ];
  assert.deepEqual(journalIssues(blocks), []);
  assert.equal(hasPendingRefs({ blocks }), false);
  assert.equal(readTimeMinutes({ blocks }), 1, "six photographs are not six minutes of reading");
});

test("mixed text and gallery publishes", () => {
  const blocks = [
    { type: "heading", data: { level: 2, text: "Morning" } },
    ...prose,
    { type: "gallery", data: { layout: "columns", items: [{ public_id: "journal/a" }] } },
    { type: "paragraph", data: { text: "Then the light changed." } },
  ];
  assert.deepEqual(journalIssues(blocks), []);
});

/* ── the invariant: nothing local reaches the site ────────── */

test("an unresolved photograph is detected wherever it is hiding", () => {
  const galleryItem = {
    type: "gallery",
    data: { layout: "grid", items: [{ public_id: "journal/a" }, { public_id: PENDING_B }] },
  };
  assert.equal(hasPendingRefs({ blocks: [galleryItem] }), true);
  assert.deepEqual(collectPendingRefs({ blocks: [galleryItem] }), [PENDING_B]);

  // Including inside a serialised draft, which is how a snapshot is stored.
  assert.equal(hasPendingRefs(JSON.stringify({ blocks: [galleryItem] })), true);
});

test("a payload naming an unresolved photograph is not sendable", () => {
  // The rule the outbox applies, stated here so it cannot be quietly dropped:
  // lib/studio-local/sync.ts filters the queue by exactly this predicate.
  const ready = { blocks: [{ type: "image", data: { public_id: "journal/a" } }] };
  const notReady = { blocks: [{ type: "image", data: { public_id: PENDING_A } }] };

  assert.equal(hasPendingRefs(ready), false, "a resolved payload goes");
  assert.equal(hasPendingRefs(notReady), true, "an unresolved one waits");
});

test("a finished upload turns the whole document sendable", () => {
  const before = {
    blocks: [
      { type: "image", data: { public_id: PENDING_A, alt: "One" } },
      { type: "gallery", data: { layout: "grid", items: [{ public_id: PENDING_B }] } },
    ],
  };
  assert.equal(hasPendingRefs(before), true);

  const after = replacePendingRefs(before, {
    [PENDING_A]: "journal/uploaded-a",
    [PENDING_B]: "journal/uploaded-b",
  });

  assert.equal(hasPendingRefs(after), false);
  assert.equal(after.blocks[0].data.public_id, "journal/uploaded-a");
  assert.equal((after.blocks[1].data.items as any[])[0].public_id, "journal/uploaded-b");
  assert.equal(after.blocks[0].data.alt, "One", "the rest of the block is untouched");
});

test("resolving one photograph does not release a document still waiting on another", () => {
  const doc = {
    blocks: [
      { type: "image", data: { public_id: PENDING_A } },
      { type: "image", data: { public_id: PENDING_B } },
    ],
  };
  const half = replacePendingRefs(doc, { [PENDING_A]: "journal/a" });
  assert.equal(hasPendingRefs(half), true);
  assert.deepEqual(collectPendingRefs(half), [PENDING_B]);
});

/* ── what the author is told while that happens ───────────── */

const base = {
  isNew: false,
  published: true,
  dirty: false,
  savedLocally: true,
  inFlight: "none" as const,
  queued: true,
  reachable: true,
  error: null,
  conflict: false,
};

test("a document waiting on photographs does not claim to have failed", () => {
  const status = describeEditor(
    { ...base, waitingOnPhoto: true, photos: { pending: 2, failed: 0 } },
    "this iPhone"
  );
  assert.equal(status.state, "MEDIA_WAIT");
  assert.equal(status.statusLine, "Live · 2 photos uploading");
  assert.equal(status.tone, "pending");
  assert.match(status.note ?? "", /safe on this iPhone/);
  assert.equal(status.primary, null, "there is nothing useful to press while it uploads");
});

test("one photograph is described in the singular", () => {
  const status = describeEditor(
    { ...base, waitingOnPhoto: true, photos: { pending: 1, failed: 0 } },
    "this iPhone"
  );
  assert.equal(status.statusLine, "Live · Photo uploading");
});

test("a photograph that gave up says so, and offers to retry that", () => {
  const status = describeEditor(
    { ...base, queued: false, photos: { pending: 0, failed: 1 } },
    "this iPhone"
  );
  assert.equal(status.state, "MEDIA_ERROR");
  assert.equal(status.statusLine, "Live · Photo problem");
  assert.equal(status.primary?.id, "retry-photo");
  assert.match(status.note ?? "", /Everything you wrote is safe/);
});

test("offline outranks uploading, because the connection is what is missing", () => {
  const status = describeEditor(
    { ...base, reachable: false, waitingOnPhoto: true, photos: { pending: 2, failed: 0 } },
    "this iPhone"
  );
  assert.equal(status.state, "OFFLINE");
  assert.equal(status.statusLine, "Live · Waiting for connection");
});

/* ── and when the gate is the problem, it says so ─────────── */

test("a held-back document is not reported as a sync failure", () => {
  const status = describeEditor(
    {
      ...base,
      queued: false,
      error: "2 starter prompts still need your words before this can go on the site.",
      failure: "CONTENT_BLOCKED",
      blockedPrompts: 2,
    },
    "this iPhone"
  );
  assert.equal(status.state, "BLOCKED");
  assert.equal(status.statusLine, "Live · Needs your words");
  assert.notEqual(status.statusLine, "Live · Couldn't sync");
  assert.equal(status.primary?.id, "review-prompts");
  assert.equal(status.secondary?.id, "remove-prompts");
  assert.equal(
    status.primary?.label,
    "Show them",
    "the useful move is to look at them, not to try again"
  );
});

test("a real sync failure still says couldn't sync", () => {
  const status = describeEditor(
    { ...base, queued: false, error: "The server is unavailable.", failure: "SERVER_ERROR" },
    "this iPhone"
  );
  assert.equal(status.state, "ERROR");
  assert.equal(status.statusLine, "Live · Couldn't sync");
  assert.equal(status.primary?.id, "retry");
});
