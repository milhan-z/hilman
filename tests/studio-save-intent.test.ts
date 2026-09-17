import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalOnlySaveError,
  assertMayReachServer,
  intentChangesPublicSite,
  intentMayReachServer,
  statusForIntent,
  type SaveIntent,
} from "../lib/studio-save-intent";

/**
 * The line between "keep this for me" and "show this to everyone".
 *
 * The studio has one row per project, so saving a published item to the
 * database is the same act as republishing it. Everything below exists so that
 * distinction cannot be lost to a refactor: a local save that quietly reached
 * the server would replace a finished article with a half-written one, and it
 * would do it silently.
 */

const ALL: SaveIntent[] = ["LOCAL_ONLY", "SYNC_DRAFT", "PUBLISH", "UPDATE_LIVE"];

test("a local-only save is the one intent that may not leave the device", () => {
  assert.equal(intentMayReachServer("LOCAL_ONLY"), false);
  for (const intent of ALL.filter((i) => i !== "LOCAL_ONLY")) {
    assert.equal(intentMayReachServer(intent), true, intent);
  }
});

test("only publishing changes what the public can read", () => {
  assert.equal(intentChangesPublicSite("PUBLISH"), true);
  assert.equal(intentChangesPublicSite("UPDATE_LIVE"), true);
  assert.equal(intentChangesPublicSite("SYNC_DRAFT"), false);
  assert.equal(intentChangesPublicSite("LOCAL_ONLY"), false);
});

test("a synced draft is written to the database as a draft", () => {
  assert.equal(statusForIntent("SYNC_DRAFT"), "draft");
  assert.equal(statusForIntent("PUBLISH"), "published");
  assert.equal(statusForIntent("UPDATE_LIVE"), "published");
});

test("asking the network layer to send a local-only save throws", () => {
  assert.throws(() => assertMayReachServer("LOCAL_ONLY"), LocalOnlySaveError);
});

test("every other intent passes the guard", () => {
  for (const intent of ALL.filter((i) => i !== "LOCAL_ONLY")) {
    assert.doesNotThrow(() => assertMayReachServer(intent), intent);
  }
});

test("the refusal explains where the save should have gone instead", () => {
  // The message is read by whoever hits this in development; "invalid intent"
  // would tell them nothing about what to do.
  assert.throws(() => assertMayReachServer("LOCAL_ONLY"), /device/i);
});

test("no intent both stays local and changes the public site", () => {
  for (const intent of ALL) {
    if (intentChangesPublicSite(intent)) {
      assert.equal(intentMayReachServer(intent), true, intent);
    }
  }
});
