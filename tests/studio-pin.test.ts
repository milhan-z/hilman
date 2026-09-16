import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPin,
  checkPinBuckets,
  GLOBAL_MAX_ATTEMPTS,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  NO_ATTEMPTS,
} from "../lib/studio-pin";

const PIN = "123456";
const NOW = 1_700_000_000_000;

test("a missing or malformed STUDIO_PIN never opens the door", () => {
  for (const expected of [undefined, "", "   ", "1234", "12345678", "12ab56"]) {
    const decision = checkPin({ entered: PIN, expected, now: NOW });
    assert.equal(decision.gate.ok, false, `"${expected}" must not be accepted as a configured PIN`);
    assert.equal(decision.gate.ok === false && decision.gate.reason, "unconfigured");
  }
});

test("the right PIN opens the door and clears earlier failures", () => {
  const decision = checkPin({
    entered: PIN,
    expected: PIN,
    attempts: { failures: MAX_ATTEMPTS - 1, lockedUntil: 0 },
    now: NOW,
  });
  assert.equal(decision.gate.ok, true);
  assert.deepEqual(decision.attempts, NO_ATTEMPTS);
});

test("a short entry is a typo, not a guess, and does not count towards lockout", () => {
  const decision = checkPin({ entered: "12", expected: PIN, now: NOW });
  assert.equal(decision.gate.ok === false && decision.gate.reason, "malformed");
  assert.equal(decision.attempts.failures, 0);
});

test("wrong PINs accumulate and lock the door", () => {
  let attempts = NO_ATTEMPTS;
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
    const decision = checkPin({ entered: "000000", expected: PIN, attempts, now: NOW });
    assert.equal(decision.gate.ok === false && decision.gate.reason, "wrong");
    assert.equal(decision.attempts.failures, attempt);
    attempts = decision.attempts;
  }

  const final = checkPin({ entered: "000000", expected: PIN, attempts, now: NOW });
  assert.equal(final.gate.ok === false && final.gate.reason, "locked");
  assert.equal(final.attempts.lockedUntil, NOW + LOCKOUT_MS);
});

test("a locked door refuses even the correct PIN until the lockout expires", () => {
  const locked = { failures: 0, lockedUntil: NOW + LOCKOUT_MS };

  const during = checkPin({ entered: PIN, expected: PIN, attempts: locked, now: NOW + 60_000 });
  assert.equal(during.gate.ok, false, "The correct PIN must not shortcut an active lockout");
  assert.equal(during.gate.ok === false && during.gate.reason, "locked");
  assert.equal(during.attempts.lockedUntil, locked.lockedUntil, "Attempting during a lockout must not extend it");

  const after = checkPin({ entered: PIN, expected: PIN, attempts: locked, now: NOW + LOCKOUT_MS + 1 });
  assert.equal(after.gate.ok, true);
});

/* ── counting the same guess in more than one place ───────── */

const bucket = (key: string, max: number, attempts = NO_ATTEMPTS) => ({
  key,
  attempts,
  maxAttempts: max,
  lockoutMs: LOCKOUT_MS,
});

test("a wrong PIN is counted against every bucket at once", () => {
  const decision = checkPinBuckets({
    entered: "000000",
    expected: PIN,
    buckets: [bucket("ip:abc", MAX_ATTEMPTS), bucket("global", GLOBAL_MAX_ATTEMPTS)],
    now: NOW,
  });

  assert.equal(decision.gate.ok, false);
  assert.deepEqual(
    decision.buckets.map((b) => [b.key, b.attempts.failures]),
    [["ip:abc", 1], ["global", 1]]
  );
});

test("the message reports whichever limit is closest to the edge", () => {
  const decision = checkPinBuckets({
    entered: "000000",
    expected: PIN,
    buckets: [
      bucket("ip:abc", MAX_ATTEMPTS, { failures: 3, lockedUntil: 0 }),
      bucket("global", GLOBAL_MAX_ATTEMPTS, { failures: 3, lockedUntil: 0 }),
    ],
    now: NOW,
  });

  // The per-address bucket has one try left; the global one has sixteen.
  assert.match(decision.gate.ok === false ? decision.gate.message : "", /1 try left/);
});

test("spreading guesses across addresses still trips the whole-door limit", () => {
  // Each guess arrives from a fresh address, so the per-address bucket is
  // always empty — the reason the global one exists.
  let global = NO_ATTEMPTS;
  for (let attempt = 1; attempt < GLOBAL_MAX_ATTEMPTS; attempt += 1) {
    const decision = checkPinBuckets({
      entered: "000000",
      expected: PIN,
      buckets: [bucket(`ip:${attempt}`, MAX_ATTEMPTS), bucket("global", GLOBAL_MAX_ATTEMPTS, global)],
      now: NOW,
    });
    assert.equal(decision.gate.ok === false && decision.gate.reason, "wrong");
    global = decision.buckets.find((b) => b.key === "global")!.attempts;
  }

  const final = checkPinBuckets({
    entered: "000000",
    expected: PIN,
    buckets: [bucket("ip:fresh", MAX_ATTEMPTS), bucket("global", GLOBAL_MAX_ATTEMPTS, global)],
    now: NOW,
  });
  assert.equal(final.gate.ok === false && final.gate.reason, "locked");
});

test("any locked bucket stops the guess before the PIN is compared", () => {
  const decision = checkPinBuckets({
    entered: PIN,
    expected: PIN,
    buckets: [
      bucket("ip:abc", MAX_ATTEMPTS),
      bucket("global", GLOBAL_MAX_ATTEMPTS, { failures: 0, lockedUntil: NOW + LOCKOUT_MS }),
    ],
    now: NOW,
  });

  assert.equal(decision.gate.ok, false, "the right PIN must not shortcut a lockout anywhere");
  assert.equal(decision.gate.ok === false && decision.gate.reason, "locked");
  assert.deepEqual(decision.buckets.map((b) => b.attempts.failures), [0, 0]);
});

test("the right PIN clears every bucket", () => {
  const decision = checkPinBuckets({
    entered: PIN,
    expected: PIN,
    buckets: [
      bucket("ip:abc", MAX_ATTEMPTS, { failures: 4, lockedUntil: 0 }),
      bucket("global", GLOBAL_MAX_ATTEMPTS, { failures: 11, lockedUntil: 0 }),
    ],
    now: NOW,
  });

  assert.equal(decision.gate.ok, true);
  assert.deepEqual(decision.buckets.map((b) => b.attempts), [NO_ATTEMPTS, NO_ATTEMPTS]);
});

test("a typo of the wrong length is not counted anywhere", () => {
  const decision = checkPinBuckets({
    entered: "12",
    expected: PIN,
    buckets: [bucket("ip:abc", MAX_ATTEMPTS), bucket("global", GLOBAL_MAX_ATTEMPTS)],
    now: NOW,
  });

  assert.equal(decision.gate.ok === false && decision.gate.reason, "malformed");
  assert.deepEqual(decision.buckets.map((b) => b.attempts.failures), [0, 0]);
});
