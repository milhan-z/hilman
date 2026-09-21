import assert from "node:assert/strict";
import test from "node:test";

/**
 * Not being able to check is not permission to delete.
 *
 * ── the two fail-open boundaries ──
 *
 * `getMediaReferences` returned `MediaReference[]`, and answered `[]` in three
 * different situations: the asset really is unused, the lookup errored, and
 * the caller turned out not to be the owner.
 *
 *     if (error) {
 *       console.error("[media] reference lookup failed:", error.message);
 *       return [];
 *     }
 *
 * The one caller read an empty list as "safe to delete". So a database hiccup
 * during the usage check became permission to destroy the thing being checked.
 *
 * `destroyAsset` returned nothing at all:
 *
 *     if (!cloudinaryServerConfigured) return;
 *     …
 *     await fetch(…/destroy, { method: "POST", body });
 *
 * A missing configuration looked exactly like a successful delete, and so did
 * a 500, and so did Cloudinary's own `{"result":"not found"}` — which it
 * answers with HTTP 200. The caller then deleted the media row, which was the
 * only record that the remote object existed, and the file stayed in
 * Cloudinary for ever with nothing in the CMS pointing at it.
 *
 * These exercise the real `destroyAsset` against a stubbed `fetch`, because
 * the part that was wrong is how it reads an answer.
 */

import { cloudinaryConfigured, destroyAsset } from "../lib/cloudinary-server";

const CLOUD = "test-cloud";

/**
 * Runs `body` with Cloudinary configured, or with it deliberately absent.
 *
 * No module cache games. `lib/cloudinary-server.ts` reads its configuration
 * when asked rather than capturing it at import, which is what makes the
 * unconfigured branch reachable from a test at all — a constant baked in at
 * import time cannot be exercised both ways in one process, and that branch is
 * the one that used to delete library rows while every file stayed put.
 */
async function withCloudinary<T>(configured: boolean, body: () => Promise<T>): Promise<T> {
  const previous = {
    cloud: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    key: process.env.CLOUDINARY_API_KEY,
    secret: process.env.CLOUDINARY_API_SECRET,
  };
  const restore = () => {
    for (const [name, value] of [
      ["NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", previous.cloud],
      ["CLOUDINARY_API_KEY", previous.key],
      ["CLOUDINARY_API_SECRET", previous.secret],
    ] as const) {
      // Assigning undefined would store the string "undefined", which is
      // truthy and would quietly make everything after it look configured.
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };

  if (configured) {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = CLOUD;
    process.env.CLOUDINARY_API_KEY = "key";
    process.env.CLOUDINARY_API_SECRET = "secret";
  } else {
    delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
  }

  try {
    return await body();
  } finally {
    restore();
  }
}

/** Replaces global fetch for one call and puts it back afterwards. */
async function withFetch<T>(stub: typeof fetch, run: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = stub;
  try {
    return await run();
  } finally {
    (globalThis as { fetch: typeof fetch }).fetch = real;
  }
}

const answering = (status: number, body: unknown) =>
  (async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;

/* ══ 1. no configuration is not a silent success ═══════════ */

// First in the file on purpose. The module reads its configuration once, at
// import, and modules are cached — so this is the one question that has to be
// asked before anything else has loaded it with credentials present.
test("no configuration at all is emphatically not a delete", async () => {
  // Previously an early `return` indistinguishable from success — so an
  // environment without Cloudinary credentials deleted every library row it
  // was asked to while every file stayed exactly where it was.
  await withCloudinary(false, async () => {
    assert.equal(cloudinaryConfigured(), false);

    let called = false;
    const result = await withFetch(
      (async () => {
        called = true;
        return { ok: true, status: 200, json: async () => ({ result: "ok" }) };
      }) as unknown as typeof fetch,
      () => destroyAsset("hilman/photo")
    );

    assert.equal(result.status, "failed");
    assert.equal(called, false, "and it does not pretend to have asked");
    if (result.status !== "failed") return;
    assert.match(result.reason, /isn't configured/i);
  });
});


/* ══ 2. what counts as deleted ═════════════════════════════ */

test("Cloudinary saying ok is deleted", async () => {
  await withCloudinary(true, async () => {
    const result = await withFetch(answering(200, { result: "ok" }), () =>
      destroyAsset("hilman/photo")
    );
    assert.deepEqual(result, { status: "deleted" });
  });
});

test("Cloudinary saying not found is also deleted", async () => {
  await withCloudinary(true, async () => {
    // The goal is that the object is not there, and it is not there. Treating
    // this as a failure would leave a library row nothing can ever clear.
    const result = await withFetch(answering(200, { result: "not found" }), () =>
      destroyAsset("hilman/photo")
    );
    assert.deepEqual(result, { status: "deleted" });
  });
});

/* ══ 2. what does not ══════════════════════════════════════ */

test("an HTTP 200 with any other answer is not a delete", async () => {
  await withCloudinary(true, async () => {
    // This is the one that used to pass silently: 200, so no error was thrown,
    // and nothing looked at `result` at all.
    for (const body of [{ result: "error" }, { error: { message: "no" } }, {}, null]) {
      const result = await withFetch(answering(200, body), () => destroyAsset("hilman/photo"));
      assert.equal(result.status, "failed", JSON.stringify(body));
    }
  });
});

test("a refusal is not a delete", async () => {
  await withCloudinary(true, async () => {
    for (const status of [400, 401, 404, 420]) {
      const result = await withFetch(answering(status, { error: "no" }), () =>
        destroyAsset("hilman/photo")
      );
      assert.equal(result.status, "failed", String(status));
      if (result.status !== "failed") return;
      assert.match(result.reason, new RegExp(String(status)));
    }
  });
});

test("a server error is not a delete", async () => {
  await withCloudinary(true, async () => {
    const result = await withFetch(answering(500, { error: "boom" }), () =>
      destroyAsset("hilman/photo")
    );
    assert.equal(result.status, "failed");
  });
});

test("an unreachable provider is not a delete", async () => {
  await withCloudinary(true, async () => {
    const result = await withFetch(
      (async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
      () => destroyAsset("hilman/photo")
    );
    assert.equal(result.status, "failed");
    if (result.status !== "failed") return;
    assert.match(result.reason, /could not be reached/i);
  });
});

/* ══ 3. it asks the right thing ════════════════════════════ */

test("the request is signed and names the asset", async () => {
  await withCloudinary(true, async () => {
    let seen: { url: string; body: URLSearchParams } | null = null;

    await withFetch(
      (async (url: string, init: { body: URLSearchParams }) => {
        seen = { url, body: init.body };
        return { ok: true, status: 200, json: async () => ({ result: "ok" }) };
      }) as unknown as typeof fetch,
      () => destroyAsset("hilman/photo", "raw")
    );

    assert.ok(seen, "it asked");
    const asked = seen as unknown as { url: string; body: URLSearchParams };
    assert.match(asked.url, new RegExp(`/${CLOUD}/raw/destroy$`), "the right resource type");
    assert.equal(asked.body.get("public_id"), "hilman/photo");
    assert.ok(asked.body.get("signature"), "signed");
    assert.ok(!asked.url.includes("secret"), "and the secret is not in the URL");
  });
});

test("an image and a raw file go to different endpoints", async () => {
  await withCloudinary(true, async () => {
    const urls: string[] = [];
    const record = (async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ result: "ok" }) };
    }) as unknown as typeof fetch;

    await withFetch(record, () => destroyAsset("a", "image"));
    await withFetch(record, () => destroyAsset("b", "raw"));

    assert.match(urls[0], /\/image\/destroy$/);
    assert.match(urls[1], /\/raw\/destroy$/);
  });
});

/* ══ 4. the shape the caller depends on ════════════════════ */

test("every answer is one of exactly two shapes", async () => {
  await withCloudinary(true, async () => {
    // deleteMedia() branches on this and keeps the library row on "failed",
    // because that row is the only thing that knows the file is out there.

    for (const stub of [
      answering(200, { result: "ok" }),
      answering(200, { result: "not found" }),
      answering(500, {}),
      answering(200, {}),
    ]) {
      const result = await withFetch(stub, () => destroyAsset("hilman/photo"));
      assert.ok(
        result.status === "deleted" || result.status === "failed",
        `unexpected shape: ${JSON.stringify(result)}`
      );
      if (result.status === "failed") assert.equal(typeof result.reason, "string");
    }
  });
});
