import assert from "node:assert/strict";
import test from "node:test";
import {
  checkPin,
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

/*
   The bucket tests that were here moved with the code they covered.

   Counting one guess against an address and against the whole door is now
   studio_pin_attempt() — tests/pin-throttle.test.ts exercises it against a
   real PostgreSQL, including the concurrency that broke the JavaScript
   version. What the studio does when that counter cannot be reached is
   tests/pin-store.test.ts.

   The behaviours those tests pinned are all still pinned:

     counted against every bucket at once  -> pin-throttle "a guess is counted
                                              against the address and the whole door"
     strictest limit is reported           -> pin-throttle "the strictest bucket
                                              is the one that shuts the door"
     spreading across addresses trips the  -> pin-throttle "spreading guesses
     whole-door limit                         across addresses still trips it"
     a locked bucket stops the guess       -> pin-throttle "attempts against a
                                              locked bucket are refused without counting"
     the right PIN clears every bucket     -> pin-throttle "clearing resets only
                                              the buckets it was given"
     a typo is not counted anywhere        -> the malformed test above, which is
                                              decided before the counter is touched
*/
