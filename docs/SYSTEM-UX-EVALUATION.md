# System evaluation and Journal Voice Notes — Pass 0

> **Status correction, 12 October 2026:** this is a historical implementation
> log, not the current release state. Voice Notes Phase 1A and the later
> outbox/media and atomic bulk-delete fixes are present on remote `master`
> at `8f6d31a`. The old “local only” branch claim below no longer describes
> that code. Migration `0014` exists and runs in local tests; its presence
> does **not** establish the live schema. No live schema or owner session was
> available in this audit. Current findings, local fixes and verification are
> recorded in [the October audit](PORTFOLIO-STUDIO-AUDIT-2026-10.md).

Date: 8 October 2026. Branch `feature/journal-voice-notes`, created from `origin/master` at `29dc2df`. This pass was read-only: no feature code, no migrations applied, no uploads, no production access.

Scope, as agreed: this evaluation exists to understand what Voice Notes depend on and to find blockers. Unrelated issues are logged in §6, not fixed.

## 1. Baseline

| Item | Value |
| --- | --- |
| Baseline commit | `29dc2df` feat(bits): two Lottie moments … (= `origin/master`) |
| Local `master` | `5ac595d`, 38 commits behind `origin/master` — not used as a base |
| Branch upstream | removed, so a bare `git push` cannot target `master` |
| `npm test` (baseline) | 893 tests: 834 pass, **2 fail**, 57 skip. Duration about 39 seconds. |

The 2 failures and 57 skips are unrelated to Voice Notes:
- **Failures:** both are in `tests/bits-contract.test.ts:48,78`. The test expects POSIX path separators and fails on Windows.
- **Skips:** these are real-Postgres tests that need `HILMAN_TEST_PG`. The PGlite tests do run.

### `codex/ui-ux-evaluation` vs `origin/master`

Six local commits are not on master:

| Commit | Summary | Needed by Voice Notes? |
| --- | --- | --- |
| `32e90f3` | Journal search reset and sticky-header scroll offsets | No |
| `22fcf14` | Studio dialog focus hook, desktop drawer focus, media picker keyboard | No. Master fixed the sheet-typing bug independently in `3687e1f`, and the two fixes overlap in `mobile-sheet.tsx`. |
| `0195feb` | Audit doc | No |
| `e122c70` | Mobile control sizes, page navigation | No |
| `3e05412` | Homepage story and `journal-card.tsx` copy | No. It does touch `journal-card.tsx`, which Voice Notes also edits, so the two would conflict if both are merged later. |
| `984abac` | Audit doc | No |

Nothing was cherry-picked or merged. If those commits are wanted later, they need their own review and rebase onto master.

## 2. Architecture map (what Voice Notes touch)

```
Studio editor (EditorDoc)            components/admin/editor-doc.ts
  └ fieldsFor("journal")  ──────────► payload.fields
local-first save                     lib/studio-local/save.ts, outbox.ts (IndexedDB)
  └ hasPendingRefs gate (client)     lib/studio-local/sync.ts:291   (sendDirect :573 has none)
media stash  pending:<uuid>          lib/studio-local/media.ts (kinds: image | loop-clip)
  └ flushPendingMedia → uploader     image → Cloudinary, loop-clip → R2 (/api/r2/sign)
  └ applyResolutions                 rewrites pending refs in queue/drafts/conflicts (field-agnostic)
/api/studio/sync                     normaliseJournalFields allowlist (lib/studio-content.ts:82)
  └ save_content_synced (0009)       digest/idempotency wrapper, passes p_data through
      └ save_journal_post (0012)     explicit column list; every listed column overwritten
public read                          lib/data.ts JOURNAL_SELECT = "*" + tags; RLS status='published'
  └ /journal/[slug] (server comp.)   header: meta → title → excerpt → tags → <hr> → blocks
  └ JournalCard                      "N min read · readers" mono line (journal-card.tsx:27-29)
R2 public                            /api/r2/media/[...path] — clips/*.mp4 only, Range/206/416, HEAD
```

## 3. Findings that block or shape Voice Notes

These come from the reliability-reviewer audit. I re-verified every P1 by reading the code.

| ID | Sev | Finding | Consequence for the plan |
| --- | --- | --- | --- |
| VN-1 | P1 | `normaliseJournalFields` is a strict allowlist, and `save_journal_post` lists its columns explicitly. A `voice_note` key would be silently dropped. | Add the field deliberately in both places. |
| VN-2 | P1 | The RPC overwrites every listed column on each save. Payloads without the new key will persist after deploy: queued outbox entries, old open tabs or PWA bundles, and restored recovery drafts. | **An absent key means keep. Explicit `null` means remove. An object means set.** This is the same rule `published_at` already uses. |
| VN-3 | P1 | Nothing on the server refuses `pending:` refs. `sendDirect`, the fallback used when the outbox write fails (for example on quota), skips the client check. Storing 25 MB of audio locally makes quota failures more likely. | Add a server-side pending guard in the sync route, a SQL CHECK on `voice_note`, and a check in `sendDirect`. |
| VN-4 | P1 | Media dispatch is binary: anything that is not `loop-clip` is treated as an image. A voice note would be "optimised" as an image and uploaded to Cloudinary. | Make every kind dispatch an exhaustive `switch` with a `never` check, and give voice notes their own path. |
| VN-5 | P1 | The R2 sign route is hard-wired to `video/mp4`, 50 MB and `.mp4`, and **the folder is chosen by the client**. The proxy allows only `clips/*.mp4`. | Move to a server-side policy table keyed by kind, which sets prefix, MIME, size and extension. The proxy uses the same allowlist. |
| VN-6 | P2 | `describeConflict` compares values with `String(a)`, so two different objects look identical. Project `meta` already has this bug. | Compare structurally. |
| VN-7 | P2 | Recovery and dirty checks compare serialised `EditorDoc`s. A new key that is always present would make every old recovery copy look different. | Leave `voiceNote` out of the doc when there is no note, the same way `newTags` works. |
| VN-8 | P2 | R2 objects are public by URL and cached as `immutable` for a year. With no deletion in V1, a removed note stays fetchable by anyone who has its URL. | Accepted by design for V1. Studio copy will say so honestly, and orphans are documented. |
| VN-9 | P2 | R2 has no backup story (`docs/BACKUP.md` covers only Supabase and Cloudinary). | Document it. |
| VN-10 | P2 | No test covers the sign route or the media proxy. | Add tests for both in Pass 2. |

The audit also confirmed these properties, with no change needed:
- **Deletion:** nothing in the repo deletes or lists R2 objects, and there is no cron, so a referenced note cannot be auto-deleted.
- **Retries and replacement:** a retry reuses the same UUID key, so it is idempotent. A replacement gets a new key, so it never overwrites the old file.
- **Pending refs:** the walkers and `applyResolutions` already cover nested objects such as `voice_note.src`.
- **Public reads:** queries use `*`, so the new column flows through, and the anon RLS policy still hides drafts.
- **Service worker:** it never intercepts `/api/`.
- **Test harness:** it applies the latest migration automatically and includes an idempotency test, so migration 0014 is exercised without extra wiring.

## 4. Proposed design

### 4.1 Data model

```ts
// lib/types.ts
export interface JournalVoiceNote {
  src: string;                    // R2 key: "voice-notes/<uuid>.m4a" | "voice-notes/<uuid>.mp3"
  mime_type: "audio/mp4" | "audio/mpeg";
  duration_seconds: number | null; // null when it could not be read; never a blocker
  bytes?: number;
}
// JournalPost
voice_note?: JournalVoiceNote | null;
```

- **`src` holds the R2 key, not a URL.** The public URL is resolved on the server at render time from the existing R2 config, the same way the sign route chooses between the proxy and the custom domain. Storing a key keeps the DB valid if the media domain changes, and lets SQL validate the shape strictly.
- **`audio/x-m4a` is normalised to `audio/mp4` before signing.** `audio/mp4` is the standard type and is what R2 will serve.

### 4.2 Migration `0014_journal_voice_note.sql` (historical proposal; implemented in master)

The migration will:
- `alter table journal_posts add column if not exists voice_note jsonb;`
- add a CHECK constraint, `journal_voice_note_shape`. It requires that `voice_note` is either null, or an object where:
  - `src` matches `^voice-notes/[0-9a-f-]{36}\.(m4a|mp3)$`, which also rules out `pending:`;
  - `mime_type` is `audio/mp4` or `audio/mpeg`;
  - `duration_seconds` is null or a number between 0 and 7200;
  - `bytes` is null or a number between 0 and 26214400.
- restate `save_journal_post` from 0012 with exactly one change. On insert it stores the object, or null when the key is absent. On update:
  ```sql
  voice_note = case
    when not (p_data ? 'voice_note')                     then voice_note   -- absent: keep
    when jsonb_typeof(p_data -> 'voice_note') = 'null'   then null         -- explicit remove
    else p_data -> 'voice_note' end
  ```
- restate the grants from 0012 and run `notify pgrst, 'reload schema'`. Every statement is idempotent.
- leave `save_content_synced` untouched.

### 4.3 Save path

- **`EditorDoc.voiceNote?: JournalVoiceNote | null`.** It is omitted when there is no note.
  - `docFromInitial` sets it only when the row has a note.
  - Remove sets it to `null`.
  - `fieldsFor("journal")` sends the key only when it is not `undefined`.
- **`normaliseJournalFields`.** An absent key stays absent. `null` stays `null`. A valid object passes through. An invalid object, or one with a `pending:` src, is refused as a 400, never silently dropped.
- **Sync route.** A server guard refuses any payload whose fields or blocks contain `pending:<uuid>`.
- **`sendDirect`.** It gets the same `hasPendingRefs` check as the queued path.
- **`describeConflict`.** It compares values structurally.

### 4.4 Media pipeline (one pipeline, extended)

- **Kinds.** `PendingMediaKind = "image" | "loop-clip" | "voice-note"`, and every dispatch over it becomes an exhaustive switch.
- **Ingest checks** live in a new `lib/studio-local/voice-check.ts`. They run before anything is stored:
  1. Type: the file's MIME type, or its extension (`.m4a`, `.mp3`) when the MIME is empty.
  2. Magic bytes: `ftyp` for M4A, ID3 or an MPEG frame sync for MP3.
  3. Size: 25 MB or less.
  4. A probe using the existing, lazily loaded `mediabunny`. It reads the codec and duration only; there is no transcoding.
     - Allowed codecs are `aac` and `mp3`.
     - **ALAC is refused.** iPhone Voice Memos records ALAC when its "Lossless" setting is on, and Chrome and Firefox do not play ALAC. Copy: *"This recording uses Apple Lossless, which most browsers can't play. In Voice Memos set Audio Quality to Compressed, or export it as M4A or MP3."*
     - If the probe fails, the file is still accepted when the type and magic bytes passed, with `duration_seconds = null`.
  5. Error copy is actionable, for example *"This recording is too large. Export it as M4A or MP3 under 25 MB."*
- **Storage order.** The file goes into IndexedDB before any network attempt. It gets the existing quota check, a `pending:<uuid>` ref, and the existing retry policy, outbox and resolution map.
- **Optimiser.** A passthrough for `voice-note`.
- **Upload.** The R2 uploader is generalised from `uploadClip` into `uploadToR2(kind, blob, contentType, assetId)` and sends the real MIME type.
- **Sign route.** It takes `kind: "loop-clip" | "voice-note"`, and the server derives folder, MIME, size and extension:
  - loop clip: `clips/`, `video/mp4`, 50 MB, `.mp4`;
  - voice note: `voice-notes/`, `audio/mp4` → `.m4a` or `audio/mpeg` → `.mp3`, 25 MB.

  A request without `kind` behaves as a loop clip. The client-chosen folder is ignored, which is a hardening step; current bundles already send `clips`.
- **Proxy.** It allows `(clips, .mp4)` and `(voice-notes, .m4a|.mp3)`, and falls back to a Content-Type based on the extension. Range, HEAD and 416 behaviour is unchanged.
- **Resolver.** A new `lib/voice-note.ts` holds the key validation and the key → public URL resolver, and is shared by the renderer and the tests.

### 4.5 Replace / remove (never delete first)

- **Replace.** The old `voice_note` stays in the DB, and on the public site, until a save containing the new resolved key succeeds. The publish gate already blocks while `pending:` refs exist. The old object becomes an orphan candidate.
- **Remove.** The editor sets `voiceNote = null`, and the save sends an explicit `null`. The object becomes an orphan candidate only after that save succeeds.
- **No deletion code in V1.** There is no `DeleteObject` and no garbage collector. Orphans are documented, and the bucket can be listed against `journal_posts.voice_note` in a later cleanup phase.
- **Removing a note that is still pending** discards its local bytes immediately, the same way Loop Clip does. Those bytes never reached the network, and the author explicitly removed them.

### 4.6 Studio UI

`VoiceNoteField` is a journal-only component placed in Details, both the desktop `meta-bar.tsx` and the mobile `metadata-sheet.tsx`. It is not in the block palette.

- **No note.** Shows "VOICE NOTE · Optional", "Read this entry in your own voice." and an **Upload recording** button. The file input accepts `audio/mp4,audio/x-m4a,audio/mpeg,.m4a,.mp3`.
- **Pending.** Shows "Recording saved on this device", then "Waiting to upload", or "Upload refused" plus the reason. These reuse the existing `PendingClip` and ingest-status language rather than adding a parallel status system.
- **Synced.** Shows a native preview player, the file name (the size when known) and the duration, with **Replace** and **Remove** buttons. The overall save/publish state stays with the existing editor status.
- **Layout.** Targets 390px first. Raw R2 keys are never shown.

### 4.7 Public player

**Component.** `components/journal/voice-note-player.tsx` is a small `"use client"` island. It is rendered only when `voice_note` is valid, between the tags and the `<hr>`, inside the `max-w-3xl` reading column.

**Server shell.** It shows the "VOICE NOTE" label, "Hilman reads this entry" and the duration in mono, and is visible without JavaScript. A `<noscript>` holds a native `<audio controls preload="metadata">` as the no-JS fallback.

**Controls:**
- a real play/pause `<button>` (`aria-label` "Play voice note" / "Pause voice note");
- seeking with an `<input type="range">` that has an `aria-valuetext`;
- elapsed and total time, which is not `aria-live`;
- a rate button cycling 1× → 1.25× → 1.5×.

**Behaviour:**
- `preload="metadata"`, no autoplay, and no animation-frame loop; progress updates come from `timeupdate`.
- The audio pauses and releases its source on unmount.
- A small red dot shows while playing and does not pulse.

**Look.** Paper surface, dark ink, a single yellow stroke, and a handwritten "read by h." in the existing handwriting font. No waveform, gradient or glass.

**Size.** The client island should be about 3 KB. Entries without a note ship nothing.

### 4.8 Journal card

`JournalCard` adds "voice note" to the existing mono meta line when `post.voice_note` is present. The public query already selects `*`, so there is no extra query; the only cost is a few bytes of JSON per row.

## 5. Implementation plan

Each pass is one commit. Each worker gets exact files and completion criteria.

| Pass | Work | Who | Opus review |
| --- | --- | --- | --- |
| 1 | Types, `JournalVoiceNote` validation (`lib/voice-note.ts`), migration 0014, `normaliseJournalFields`, `EditorDoc`/`fieldsFor`, server pending guard, `sendDirect` guard, `describeConflict`. Tests: absent=keep, null=remove, object=set, malformed/pending refused (TS and SQL), migration idempotent, upgrade from 0007/0012, old payloads keep the note. | Leader writes the code; `test-writer` writes tests from my case list | **Yes** |
| 2 | Media kind `voice-note`, `voice-check.ts`, passthrough optimiser, generalised R2 uploader, sign-route policy table, proxy allowlist. Tests with mocked R2: signing per kind, path validation, Range/206/416/HEAD, MIME and size rejection, ALAC refusal, offline stash survives, resolution replaces pending, failed upload keeps old note. | Leader; `test-writer` | **Yes** |
| 3 | `VoiceNoteField` in desktop and mobile Details | Leader; `ux-qa` at 390/430/768/1440 (**needs your login**) | No |
| 4 | Public player and its placement | Leader; `ux-qa` covering keyboard, reduced motion, JS-off and widths | No |
| 5 | Card marker | `scoped-implementer` | No |
| 6 | Regression run (`npm test`, `typecheck`, `build`), bundle check, accessibility pass, final report, `docs/BACKUP.md` R2 note | Leader, `ux-qa` | **Yes, final** |

## 6. Unrelated issues (logged, not fixed)

| Sev | Issue |
| --- | --- |
| P1 | `bulkDeleteItems` (`app/admin/actions.ts:372-398`) still deletes blocks and then rows in two separate statements. This is the non-atomic pattern that 0012 fixed for single deletes. It should call `delete_content`. |
| P2 | `tests/bits-contract.test.ts` fails on Windows because of path separators. |
| P2 | A stale comment in `app/api/r2/sign/route.ts:43-48` refers to a constant, `MAX_LOOP_CLIP_BYTES`, that does not exist. |
| P2 | `describeConflict` hides differences in project `meta`. This is fixed as a side effect of VN-6. |
| P2 | Removing a pending Loop Clip discards its bytes immediately. If a recovery copy still references that ref, its save is held back indefinitely, and nothing detects the orphaned ref. |
| P2 | R2 objects have no backup or restore procedure. |
| Process | Local `master` is 38 commits behind `origin/master`. |
| P2 | When a direct send (the no-storage path) is rejected, `live-editor.tsx:628` still advances the "kept" snapshot, so the editor no longer looks dirty. The text stays on screen, the error is shown, and the leave-page warning still fires. Pre-existing; found in the Pass 1 review. |

## 7. Progress log

### Pass 1: data model, migration, save path

The opus reliability review found no P0 or P1. I fixed these P2s before committing:
- **Missing `mime_type`.** The CHECK accepted a note with no `mime_type`, because NULL passes a CHECK. Fixed with `coalesce(…, false)`.
- **Unreadable duration or size.** These are now dropped (duration becomes null, size is omitted) instead of refusing the whole save, so the author's writing still syncs.
- **Rejection message.** The pending-media rejection said the save would go automatically; it now tells the author to press Retry.
- **Conflict screen.** It no longer lists keys that the save does not send.
- **Key order.** A recording loaded from the DB and one patched in during the session now serialise identically, so there is no spurious recovery offer.

What the review checked:
- 0014's `save_journal_post` differs from 0012 only in `voice_note`.
- Absent = keep holds end to end, including mutation-id replay through `save_content_synced`.
- No other writer drops or clears the column.
- A CHECK violation (23514) maps to "rejected", not to a retry loop.

Tests: `tests/journal-voice-note.test.ts` (42 tests). The full suite is 876 pass, plus the 2 known Windows failures in `bits-contract` and the 57 real-Postgres skips. Typecheck is clean.

### Pass 2: media pipeline and R2

What changed:
- **Media kind.** `voice-note` is now a third `PendingMediaKind`. Every dispatch over kinds is an exhaustive `switch`, so a voice note cannot reach Cloudinary.
- **Ingest check.** `lib/studio-local/voice-check.ts` decides from the file's own bytes; the label only turns away files that are plainly not audio.
  - M4A: it walks the MP4 boxes to `moov` to read the codec and duration. ALAC, a video track, an unknown codec, and a missing index are all refused with actionable copy.
  - MP3: it looks for two consecutive valid frame headers after any ID3 tags.
  - No transcoding, and no new dependency.
- **Signing.** `lib/r2-policy.ts` is the server-side table that maps a kind to its folder, allowed types, size limit and file extension. The client's `folder` is ignored. A request without `kind` is treated as a Loop Clip.
- **Proxy.** `lib/r2-serve.ts` serves `clips/*.mp4` and `voice-notes/<uuid>.m4a|.mp3`. It supports Range, 206, 416 and HEAD. It always serves the allowlisted Content-Type, never the stored one.
- **Upload deadline.** It now grows with file size, at about 64 KB/s, so a 25 MB recording is not timed out on weak signal.

The opus review found no P0 or P1. I fixed these P2s before committing:
1. A valid file with an unusual label (`audio/aac`, `video/mp4`) is now judged by its bytes.
2. The MP3 check tolerates padding and stacked ID3 tags.
3. The proxy no longer serves the stored Content-Type, which a presigned PUT does not bind.
4. A voice-note key from the server is validated before the local bytes are released.
5. The sync drawer no longer offers Remove for recordings. Removing one there would have left the entry naming a recording that no longer exists.
6. Storing a file no longer waits on a browser duration probe.
7. A truncated file is told apart from one this reader cannot parse.

**Open risk, to settle in the approved real smoke test:** presigned URLs from `@aws-sdk` 3.1134 carry `x-amz-checksum-crc32` of an empty body. If R2 enforces it, every non-empty PUT fails with 400, and that would already affect Loop Clips. I did not change the shared client without evidence. If the smoke test shows the failure, set `requestChecksumCalculation: "WHEN_REQUIRED"` in `lib/r2-server.ts`.

Tests: `tests/voice-note-media.test.ts` (93). `media-optimize` now asks the policy table for the clip limit instead of grepping the route file. The full suite is 969 pass, with only the 2 known `bits-contract` failures, plus 57 skips.

### Passes 3–5: Studio field, public player, card marker

- **Pass 3 (Studio field).** Voice Note sits in Details, desktop and mobile, for Journal entries only.
- **Pass 4 (public player).** The player renders between the tags and the divider. It is server-rendered as a native `<audio controls>`, so it plays without JavaScript, and hydration swaps in the custom controls.
- **Pass 5 (card marker).** Cards show "voice note" in the existing meta row.

Player QA used a temporary dev-only page, never committed:
- **Behaviour:** play, keyboard seek, the 1×/1.25×/1.5× speed control, only one narration playing at a time, a broken source, an unknown duration, and server HTML with native controls and no autoplay.
- **Geometry:** no overflow at 390/430/768/1440, the player stays within the reading column, and every tap target is at least 44px.
- **Contrast:** at least 6.5:1 in both themes.
- **Bug found and fixed:** the cleanup removed `src`, which broke playback after a React StrictMode remount.

Build: `npm run build` passes. The player costs about 5.2 KB minified, about 2.2 KB gzip, on every Journal entry page. Next 16 does not code-split a client component that a Server Component imports dynamically, so there is no cheaper split.

### Pass 6: final reliability review

No P0, and a `pending:` ref cannot reach the database on any path. Fixed:
- **P1, stuck queued save.** Replacing or removing a still-pending recording deleted its bytes even when a queued save named it, so that save could never be sent. The fix, `releaseIfUnreferenced`, releases the bytes only when no queued save or stored conflict names the recording. Otherwise the recording uploads and becomes an orphan. Tested.
- **No way out of a missing recording.** A recording whose bytes are missing can now be removed, and "still loading" is told apart from "missing".
- **Remove copy.** It now distinguishes a recording that never uploaded from a stored one, and states when a published entry actually changes.
- **Wrong "not on the site" message.** Saves handed over before an upload finished now have their pending refs resolved too, so the editor no longer says the site didn't get the save.
- **Early player errors.** The player notices a load error that happened before hydration.
- **Cleanup guidance.** `docs/BACKUP.md` now says to clean up only objects that are old enough and not waiting on any device.

Logged and not changed:
- The same discard-immediately pattern in the photo and Loop Clip fields.
- `applyResolutions` reads and rewrites the queue in two steps instead of one transaction.
- A 25 MB upload makes text saves wait.
- An MP3's duration arrives after the save, which marks the document unsaved.
- The player does not handle iOS lock-screen controls.

Full suite: 974 pass, plus the 2 known `bits-contract` failures and 57 skips.

### Real R2 smoke test (owner-approved, 11 October 2026)

One object was written with the application's own client (`lib/r2-server.ts`, default SDK checksum settings), to `voice-notes/_qa/294eed7a-055a-47b4-8c59-18ae1e7bfe2b/smoke.m4a`. It is a 4 KB body and is deliberately left in the bucket as a QA orphan.

- **Checksum risk closed.** The presigned URL does carry `x-amz-checksum-crc32`, and its signed headers are `content-length;host`. R2 still accepted a non-empty PUT with **200**, so it does not enforce that checksum and `lib/r2-server.ts` needs no change.
- **Stored metadata:** HEAD returned `audio/mp4`, 4096 bytes.
- **Range:** `bytes=0-99` returned `Content-Range: bytes 0-99/4096`, 100 bytes.
- **Public serving:** the configured public base is an `r2.dev` host, so `r2PublicUrl()` sends visitors through the site's own `/api/r2/media` proxy. That proxy serves the allowlisted Content-Type and passes Range through. The proxy is unit-tested; a real-file check through it remains a post-deploy item. If a custom domain is added later, R2 will serve whatever Content-Type it stored. That is the type the uploader sent, which the client always normalises.

### Studio QA (owner-logged-in, R2 disabled, 11 October 2026)

**Setup.** The dev server ran on `localhost:3011` against the owner's Supabase, with the R2 variables blanked, so `/api/r2/*` answered 503. I worked in the disposable draft "UX audit — disposable draft — mobile pass". I pressed neither Save nor Publish. Test files were built in the browser and injected into the file input.

| Check | Result |
| --- | --- |
| Empty state, 390px | "Voice note · Optional", one-line hint, "Upload recording" at 48px tall, correct `accept` list, no overflow |
| WAV | Refused with actionable copy. After QA the copy names the format: "This is a WAV recording…" |
| ALAC M4A (labelled `audio/x-m4a`) | Refused: "uses Apple Lossless… set Audio Quality to Compressed…" |
| AAC M4A | Stored on the device. Shows "Saved on this device — waiting to upload", the file name, and `M4A · 4:21`, with the length read from the file. The status pill reads "1 recording waiting to send". |
| Network | Only `POST /api/r2/sign → 503`. Outbox has 0 entries, so no save was sent. |
| Replace with MP3 | The old M4A was released, because nothing queued named it. Only the MP3 remains, stored as `audio/mpeg`. |
| Remove | "Removed. The entry is text only again." The media and outbox stores are both empty. |
| Keyboard | Tab moves "Choose from your photos" → "Upload recording" with a visible focus outline. The hidden file input is skipped. |
| 430 / 768 / 1440 | Field contained, no overflow. On desktop it sits in the expanded Details grid. |
| Clean-up | Discarded the local recovery copy the QA edits left; it held only the QA change. The draft on the server was never changed. |

## 8. Historical final report — Journal Voice Notes Phase 1A

- **Baseline:** `29dc2df` (`origin/master`, 8 October 2026).
- **Branch at this report's original date:** `feature/journal-voice-notes`, then local only. Superseded for code status: Phase 1A is present on `master` at `8f6d31a`. Production schema/deployment state remains separately unverified in the 12 October audit.
- **Commits:**
  - `b60a511` Pass 0 audit
  - `924eb59` Pass 1 data and save
  - `ce682e5` Pass 2 media and R2
  - `4a902d7` Pass 3 Studio field
  - `b265f67` Pass 4 public player
  - `0072baf` Pass 5 card marker
  - `994dca4` backup docs
  - `249de13` final-review fixes
  - `4fcb7ca` R2 smoke test
  - the Studio-QA fix commit after it
- **Schema:** `supabase/migrations/0014_journal_voice_note.sql`, prepared and tested only in PGlite, including running it twice and upgrading from 0013. It adds `journal_posts.voice_note jsonb`, null meaning text only. The `journal_voice_note_shape` CHECK requires:
  - an R2 key `voice-notes/<uuid>.m4a|.mp3`, never `pending:`
  - a matching `audio/mp4` or `audio/mpeg` type
  - a duration that is null or between 0 and 7200 seconds
  - a size that is null or a whole number up to 25 MB
  - no unknown keys

  `save_journal_post` is restated from 0012 with one change: an absent key keeps the stored recording and an explicit null removes it. **It needs the owner's approval before it is applied to production.**
- **Files changed:** 34 files, +3802 / −260 (`git diff --stat 29dc2df..HEAD`).
- **Media architecture:** the existing local-first pipeline, extended rather than duplicated.
  1. The file is stored in IndexedDB first, as `pending:<uuid>`.
  2. The existing outbox, retry policy and resolution map send it.
  3. A presigned PUT puts it under `voice-notes/<uuid>.<ext>`.
  4. The placeholder is resolved to the R2 key.
  5. The save goes through `/api/studio/sync` → `save_content_synced` → `save_journal_post`.

  A `pending:` ref is refused at five layers: the outbox filter, `sendDirect`, the sync route, `normaliseFields` / `checkVoiceNote`, and the database CHECK. Nothing deletes from R2. Replace and remove leave documented orphans.
- **Formats:**
  - **Accepted:** M4A/AAC (`audio/mp4`; `audio/x-m4a` is normalised to it) and MP3 (`audio/mpeg`), up to 25 MB, decided from the file's bytes. Every target browser plays both natively, and Voice Memos and most recorders produce them.
  - **Refused, with actionable copy:** Apple Lossless (Safari plays it, Chrome and Firefox do not), video, unknown codecs, recordings with no index, WAV, Ogg, FLAC and WebM.
  - Nothing is transcoded, and there is no new dependency.
- **Tests:** `tests/journal-voice-note.test.ts` (42) and `tests/voice-note-media.test.ts` (99). The full suite is 975 pass, 2 fail (the pre-existing Windows path issue in `bits-contract`), 57 skipped (need `HILMAN_TEST_PG`).
- **Typecheck:** passes.
- **Build:** `npm run build` passes.
- **Mobile QA:** public player at 390/430/768/1440 and Studio field at 390/430/768/1440 (above). These are viewport checks, not device certification.
- **Accessibility QA:**
  - real buttons with their own names
  - a seek slider with spoken `aria-valuetext`
  - no per-second announcements
  - visible focus, keyboard seek
  - the native `<audio controls>` fallback without JavaScript, no autoplay
  - contrast of at least 6.5:1 in both themes

  A VoiceOver pass has not been done.
- **Performance and bundle:**
  - The player is about 5.2 KB minified, about 2.2 KB gzip, shipped with every Journal entry page; Next 16 cannot split it from a Server Component.
  - `preload="metadata"`, Range streaming, no frame loop.
  - Studio's ingest check reads only the box headers and the `moov` box.
  - The card marker costs no extra query.
- **Risks recorded at that time (not all still open):**
  - The discard-immediately, queue rewrite, upload-blocking-text, and late-duration dirty-state findings below were subsequently addressed on master. The October audit rechecks those paths and closes additional local recovery races; see its evidence and current gaps.
  - The same discard-immediately pattern is still in the photo and Loop Clip fields.
  - `applyResolutions` reads and rewrites the queue in two steps.
  - A 25 MB upload delays queued text saves.
  - A late MP3 duration marks the document unsaved.
  - Visitors are served through the site proxy, because the public base is `r2.dev`, so audio streams through the hosting functions. A custom R2 domain is the long-term fix, and it would serve R2's stored Content-Type.
  - Removed recordings stay reachable by exact URL until a cleanup.
  - The QA orphan `voice-notes/_qa/294eed7a-…/smoke.m4a` is in the bucket.
- **Needs real iPhone testing:**
  - Voice Memos files, Compressed versus Lossless, and the file picker offering `.m4a`
  - `readVoiceDuration` on iOS for MP3
  - backgrounding or killing the app mid-upload, then resuming
  - the offline publish → Replace → online sequence
  - a 25 MB upload on weak signal
  - Safari playback: gesture, playback rate, lock screen
  - real playback through `/api/r2/media` after deploy
- **Phase 1B recommendation (recording in Studio):** postpone. Chrome's MediaRecorder produces WebM/Opus, which V1 deliberately refuses. Safari produces fragmented MP4 whose `mvhd` duration is 0. Before building anything:
  1. Measure the actual `MediaRecorder.isTypeSupported('audio/mp4')` output on the iPhone and on Chromium.
  2. Decide whether a fragmented-MP4 recording needs its own validation path.
  3. Design for interruption and screen lock.

  Store recordings locally in chunks during recording, never only at Stop.

### A real iPhone recording (owner-supplied, 11 October 2026)

The file is `Jalan Marina Emas No. F117 8.m4a.mp4`, 48 KB. I read it as data only, and it was not added to the repo.
- **Structure:** `ftyp(M4A, isom, mp42)`, then `mdat`, then `moov`. The index comes after the audio, which is typical of iPhone recordings. The codec is `mp4a` (AAC, the "Compressed" setting), there is no video track, and the length is 4.84 s.
- **Studio check:** `checkVoiceFile` accepts it as `audio/mp4` with the 4.84 s duration under every label it could arrive with (`video/mp4`, `audio/mp4`, `audio/x-m4a`, none).
- **Browser:** Chromium decodes and plays it, reading the same 4.84 s. `canPlayType('audio/mp4; codecs="alac"')` is empty, which confirms that refusing Apple Lossless is necessary.
- **Problem found and fixed:** the `.m4a.mp4` name, which comes from sharing through another app, makes pickers label the file as video. The field's `accept` list now includes `video/mp4` and `.mp4`, so the file can be chosen. Real video is still refused by the byte check.
- **Still to test on the device:** picking the original `.m4a` straight from Files or Voice Memos, and a Lossless recording.
