import assert from "node:assert/strict";
import test from "node:test";
import {
  describeConflict,
  describeMalformedMutation,
  outcomeIsTerminal,
  rebaseQueued,
  type SyncMutation,
} from "../lib/studio-sync-contract";

/**
 * The rules that decide whether queued work survives a bad network.
 *
 * These are the parts worth testing without a browser or a database: what the
 * server will refuse, what a retry is allowed to do, and how two versions of
 * the same entry are told apart.
 */

const MUTATION_ID = "11111111-2222-4333-8444-555555555555";
const ENTITY_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TAG_ID = "99999999-8888-4777-8666-555555555555";

const valid = (over: Partial<SyncMutation> = {}): SyncMutation => ({
  mutationId: MUTATION_ID,
  entity: "journal",
  entityId: null,
  localId: "journal:new-abc",
  baseUpdatedAt: null,
  payload: {
    fields: { title: "A morning note", status: "draft" },
    blocks: [{ id: "b1", type: "paragraph", position: 0, data: { text: "hello" } }],
    tagIds: [],
  },
  queuedAt: "2026-09-16T04:00:00.000Z",
  attempts: 0,
  ...over,
});

test("a well-formed queued save is accepted", () => {
  assert.equal(describeMalformedMutation(valid()), null);
  assert.equal(
    describeMalformedMutation(
      valid({ entityId: ENTITY_ID, baseUpdatedAt: "2026-09-16T03:00:00+00:00" })
    ),
    null
  );
});

test("an edit must say which version it was made against", () => {
  // Without a base there is nothing to compare, so the server would have to
  // either overwrite blindly or refuse. It refuses, and so does the client.
  const reason = describeMalformedMutation(valid({ entityId: ENTITY_ID, baseUpdatedAt: null }));
  assert.match(String(reason), /which version/i);
});

test("a save with no title never leaves the queue", () => {
  const reason = describeMalformedMutation(
    valid({ payload: { fields: { title: "   " }, blocks: [], tagIds: [] } })
  );
  assert.match(String(reason), /title/i);
});

test("identifiers must be UUIDs, so a retry cannot be mistaken for a new write", () => {
  assert.notEqual(describeMalformedMutation(valid({ mutationId: "not-a-uuid" as string })), null);
  assert.notEqual(describeMalformedMutation(valid({ entityId: "42" })), null);
});

test("a malformed payload is described rather than sent", () => {
  assert.notEqual(
    describeMalformedMutation(valid({ payload: { fields: { title: "x" }, blocks: null as any, tagIds: [] } })),
    null
  );
  assert.notEqual(
    describeMalformedMutation(
      valid({ payload: { fields: { title: "x" }, blocks: [], tagIds: ["nope"] } })
    ),
    null
  );
  assert.equal(
    describeMalformedMutation(
      valid({ payload: { fields: { title: "x" }, blocks: [], tagIds: [TAG_ID] } })
    ),
    null
  );
});

test("only a network failure is worth retrying", () => {
  const base = { mutationId: MUTATION_ID, localId: "journal:new-abc" };
  assert.equal(outcomeIsTerminal({ ...base, status: "retry", message: "offline" }), false);
  assert.equal(outcomeIsTerminal({ ...base, status: "rejected", message: "no title" }), true);
  assert.equal(
    outcomeIsTerminal({ ...base, status: "saved", id: ENTITY_ID, updatedAt: "t", replayed: false }),
    true
  );
});

test("a second edit made while the first was in flight is rebased, not conflicted", () => {
  // Both were written on this phone. The later one sits on top of the earlier
  // one, so once the earlier one lands it becomes the later one's base.
  const queued = [
    valid({ mutationId: "22222222-2222-4222-8222-222222222222", localId: "journal:new-abc" }),
    valid({
      mutationId: "33333333-3333-4333-8333-333333333333",
      localId: "journal:other",
      entity: "journal",
    }),
  ];

  const rebased = rebaseQueued(queued, {
    localId: "journal:new-abc",
    entity: "journal",
    id: ENTITY_ID,
    updatedAt: "2026-09-16T05:00:00+00:00",
  });

  assert.equal(rebased[0].entityId, ENTITY_ID, "the create's id now points at a real row");
  assert.equal(rebased[0].baseUpdatedAt, "2026-09-16T05:00:00+00:00");
  assert.equal(rebased[1].entityId, null, "an unrelated entry is left alone");
  assert.equal(rebased[1].baseUpdatedAt, null);
});

test("rebasing matches on the server id too, not just the local one", () => {
  const queued = [valid({ entityId: ENTITY_ID, localId: "journal:different", baseUpdatedAt: "old" })];
  const rebased = rebaseQueued(queued, {
    localId: "journal:new-abc",
    entity: "journal",
    id: ENTITY_ID,
    updatedAt: "new",
  });
  assert.equal(rebased[0].baseUpdatedAt, "new");
});

test("a conflict names the fields that actually differ", () => {
  const mine = {
    fields: { title: "Kembali menulis", status: "draft", excerpt: "pagi" },
    blocks: [{ id: "b1", type: "paragraph" as const, position: 0, data: { text: "mine" } }],
    tagIds: [TAG_ID],
  };
  const theirs = {
    fields: { title: "Kembali menulis", status: "published", excerpt: "pagi" },
    blocks: [{ id: "server-1", type: "paragraph" as const, position: 0, data: { text: "theirs" } }],
    tagIds: [TAG_ID],
  };

  assert.deepEqual(describeConflict(mine, theirs), ["content", "status"]);
});

test("identical bodies do not count as a difference just because block ids differ", () => {
  const body = [{ type: "paragraph" as const, position: 0, data: { text: "same" } }];
  const mine = {
    fields: { title: "t" },
    blocks: body.map((b, i) => ({ ...b, id: `local-${i}` })),
    tagIds: [],
  };
  const theirs = {
    fields: { title: "t" },
    blocks: body.map((b, i) => ({ ...b, id: `server-${i}` })),
    tagIds: [],
  };

  assert.deepEqual(describeConflict(mine, theirs), []);
});
