import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMayReachServer,
  intentChangesPublicSite,
  intentFor,
  intentMayReachServer,
  statusForIntent,
  LocalOnlySaveError,
} from "../lib/studio-save-intent";
import { connectivityFrom } from "../components/admin/connectivity-pill";
import { describeEditor } from "../lib/studio-editor-state";
import { getJournalQualityIssues, getProjectQualityIssues } from "../lib/content-quality";
import { stripStarterPrompts } from "../lib/starter-prompts";
import { BLOCK_TEMPLATES } from "../lib/block-templates";

/**
 * Getting a document onto the site, and saying so honestly when it did not.
 *
 * Two real failures are pinned here.
 *
 * The first is the one the owner hit on a phone: publishing was refused for
 * almost every document, because the quality gate had been taught that a
 * gallery's `layout: "grid"` was an unreplaced starter prompt. That is defended
 * in tests/starter-prompts.test.ts; what this file adds is the publication
 * semantics around it — that a refusal is never reported as "Synced".
 *
 * The second is "Remove & publish": it took the prompts out and then published
 * the document it had captured *before* the removal, so the site refused the
 * very thing the button had just fixed. The repair was to make the outgoing
 * version an argument rather than a closure, and the shape of that is tested
 * here through the pure pieces.
 */

/* ── the four intents stay four ────────────────────────────── */

test("a first publication and an update are different intents", () => {
  assert.equal(intentFor({ nextStatus: "published", published: false }), "PUBLISH");
  assert.equal(intentFor({ nextStatus: "published", published: true }), "UPDATE_LIVE");
});

test("saving a draft never becomes a publication, whatever the site currently serves", () => {
  assert.equal(intentFor({ nextStatus: "draft", published: false }), "SYNC_DRAFT");
  assert.equal(intentFor({ nextStatus: "draft", published: true }), "SYNC_DRAFT");
});

test("only the two publishing intents change what the public reads", () => {
  assert.equal(intentChangesPublicSite("PUBLISH"), true);
  assert.equal(intentChangesPublicSite("UPDATE_LIVE"), true);
  assert.equal(intentChangesPublicSite("SYNC_DRAFT"), false);
  assert.equal(intentChangesPublicSite("LOCAL_ONLY"), false);
});

test("a publishing intent writes published, everything else writes draft", () => {
  assert.equal(statusForIntent("PUBLISH"), "published");
  assert.equal(statusForIntent("UPDATE_LIVE"), "published");
  assert.equal(statusForIntent("SYNC_DRAFT"), "draft");
  assert.equal(statusForIntent("LOCAL_ONLY"), "draft");
});

test("a local-only save can never reach the network, and says so by throwing", () => {
  assert.equal(intentMayReachServer("LOCAL_ONLY"), false);
  assert.throws(() => assertMayReachServer("LOCAL_ONLY"), LocalOnlySaveError);
  for (const intent of ["SYNC_DRAFT", "PUBLISH", "UPDATE_LIVE"] as const) {
    assert.doesNotThrow(() => assertMayReachServer(intent));
  }
});

/* ── a refusal is never reported as success ────────────────── */

const quiet = {
  reachable: true,
  syncing: false,
  queued: 0,
  blocked: 0,
  conflicts: 0,
  media: 0,
};

test("with nothing waiting, the studio says it is up to date", () => {
  const summary = connectivityFrom(quiet);
  assert.equal(summary.kind, "synced");
});

test("a publication the site refused is never reported as Synced", () => {
  // A rejected mutation stays in the outbox as `blocked` — it will not succeed
  // on a retry, so it waits for a decision rather than for a connection.
  const summary = connectivityFrom({ ...quiet, blocked: 1 });
  assert.notEqual(summary.kind, "synced");
  assert.equal(summary.kind, "attention");
  assert.equal(summary.label, "Needs a fix");
  assert.match(summary.detail, /needs your decision/);
});

test("work waiting to send is not Synced either", () => {
  assert.equal(connectivityFrom({ ...quiet, queued: 2 }).kind, "queued");
  assert.equal(connectivityFrom({ ...quiet, media: 1 }).kind, "queued");
  assert.equal(connectivityFrom({ ...quiet, reachable: false, queued: 1 }).kind, "offline");
});

test("a conflict outranks everything, because it needs a person", () => {
  const summary = connectivityFrom({ ...quiet, conflicts: 1, queued: 5, media: 3 });
  assert.equal(summary.kind, "attention");
  assert.equal(summary.label, "Conflict");
});

/* ── the editor's own account of a failed publication ──────── */

const editing = {
  isNew: false,
  published: true,
  dirty: false,
  savedLocally: true,
  inFlight: "none" as const,
  queued: false,
  reachable: true,
  conflict: false,
};

test("a failed publication keeps the document Live and offers a way forward", () => {
  const status = describeEditor(
    { ...editing, error: "The server is unavailable.", failure: "SERVER_ERROR" },
    "this iPhone"
  );
  assert.equal(status.publishLabel, "Live", "the site still serves the old version");
  assert.equal(status.state, "ERROR");
  assert.equal(status.primary?.id, "retry");
  assert.match(status.note ?? "", /Saved on this iPhone/, "the local copy is named as safe");
});

test("a first publication that failed still says Draft, not Live", () => {
  const status = describeEditor(
    { ...editing, published: false, error: "Nope.", failure: "SERVER_ERROR" },
    "this iPhone"
  );
  assert.equal(status.publishLabel, "Draft");
  assert.equal(status.statusLine, "Draft · Couldn't sync");
});

test("a held-back document points at the words, not at Try again", () => {
  const status = describeEditor(
    { ...editing, error: "2 starter prompts…", failure: "CONTENT_BLOCKED", blockedPrompts: 2 },
    "this iPhone"
  );
  assert.equal(status.state, "BLOCKED");
  assert.equal(status.primary?.id, "review-prompts");
  assert.notEqual(status.localLabel, "Couldn't sync");
});

/* ── "Remove & publish" publishes what it removed from ─────── */

/**
 * The button strips the unanswered prompts and continues the publication the
 * author already asked for. It used to send the document as it was *before*
 * the strip, so the site refused it and the editor showed a complaint about
 * prompts that were no longer there. The fix is that the cleaned version is
 * passed explicitly; this is the property that made the old behaviour wrong.
 */
test("the cleaned document is publishable and the original is not", () => {
  for (const template of BLOCK_TEMPLATES) {
    const original = template.build().map((b) => ({ type: b.type, data: b.data ?? {} }));
    const issues = template.kind === "project" ? getProjectQualityIssues : getJournalQualityIssues;

    const before = issues({ title: "A title", excerpt: "An excerpt", blocks: original });
    const cleaned = stripStarterPrompts(original);
    const after = issues({ title: "A title", excerpt: "An excerpt", blocks: cleaned });

    const hadPrompts = before.some((issue) => issue.code === "template");
    if (!hadPrompts) continue;

    assert.equal(
      after.some((issue) => issue.code === "template"),
      false,
      `${template.id}: removing the prompts must make it publishable — sending the ` +
        `pre-removal version is what made this fail`
    );
  }
});

test("removing prompts leaves the structure the author kept", () => {
  const blocks = BLOCK_TEMPLATES.find((t) => t.id === "visual-design")!
    .build()
    .map((b) => ({ type: b.type, data: b.data ?? {} }));
  const cleaned = stripStarterPrompts(blocks);

  const headings = cleaned.filter((b) => b.type === "heading");
  assert.ok(headings.length >= 3, "the headings are structure and must survive");
  assert.equal(
    cleaned.some((b) => b.type === "paragraph" && String(b.data.text ?? "").trim()),
    false,
    "every unanswered paragraph prompt is gone"
  );
});

/* ── an empty document is not publishable by accident ──────── */

test("publishing nothing is still refused by the title rule, not by the gate", () => {
  // blockingReason() owns "no title"; the quality gate must not also claim it,
  // or the author gets two different sentences for one missing field.
  assert.deepEqual(getJournalQualityIssues({ title: "", excerpt: "", blocks: [] }), []);
});
