import assert from "node:assert/strict";
import test from "node:test";
import { decideOwnerAccess } from "../lib/owner-policy";

test("only a confirmed authenticated owner can access the studio", () => {
  assert.deepEqual(decideOwnerAccess("owner-id", true, null), {
    ok: true, userId: "owner-id", degraded: false,
  });
  assert.equal(decideOwnerAccess(null, true, null).ok, false);
  for (const result of [false, null, undefined, "true", 1, {}, []]) {
    assert.equal(decideOwnerAccess("signed-in-id", result, null).ok, false);
  }
});

test("missing or ambiguous owner RPC never falls back to authenticated access", () => {
  for (const code of ["42883", "PGRST202", "PGRST203"]) {
    const decision = decideOwnerAccess("signed-in-id", true, { code });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, "unavailable");
      assert.match(decision.message, /0003_owner_and_integrity/);
    }
  }
});

test("unexpected database errors deny access without exposing internal details", () => {
  const decision = decideOwnerAccess("signed-in-id", true, {
    code: "XX000", message: "private schema diagnostic",
  });
  assert.equal(decision.ok, false);
  if (!decision.ok) assert.doesNotMatch(decision.message, /private schema diagnostic/);
});
