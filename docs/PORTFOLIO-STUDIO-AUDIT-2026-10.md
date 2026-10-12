# Portfolio and Studio: local audit and upgrade

Started 12 October 2026. This document distinguishes current evidence from the
historical Voice Notes report in `SYSTEM-UX-EVALUATION.md`.

## Baseline and access

- Local branch `work`, HEAD `8f6d31adf65d7aeb35e9bc38e77840efef951c3b`.
- Working tree was clean before this task; no pre-existing user edits were moved.
- Read-only remote inspection confirmed `master` is the default branch and has
  the same HEAD. No pull/reset, merge, push, or deployment was performed during
  the local audit. The later direct-push authorization is recorded below.
- `codex/ui-ux-evaluation` is absent locally and was not advertised by the remote.
  Its six historical commits are described in `SYSTEM-UX-EVALUATION.md`; that
  description is not a current branch comparison. Relevant gaps are checked
  against current code, without cherry-picking old patches.
- `MASTER_CONTEXT.md` and `HILMAN-BITS-v2.md` were initially absent, then supplied
  by the user as attachments and read for the relevant Home, Studio durability,
  media, motion, and release constraints. They are historical/design references;
  the current task defines authorization. Attachments and synced references were
  not edited. No `sources/` directory was present.
- No application credential bindings are present. Production origin requests
  were denied by the network proxy. Live schema, authenticated Studio, and
  real media delivery cannot be inferred from the checkout or build.

## Audit map (baseline findings; resolution below)

| System | Evidence | Active issue / status | Risk | Action |
| --- | --- | --- | --- | --- |
| Home | `app/(site)/page.tsx`; local 390/1440 screenshots | Planned project proof sections remain a three-card grid; people precede Journal/Play | UX | Render full-width project proof from existing curated data; reorder chapters |
| Public routes | Local HTTP/browser for Home, Works, Journal, About, Connect, Lab | Baseline routes render at 390px without horizontal overflow; development has no genuine published content | Verified, limited | Test changed layouts, themes, no-JS, keyboard, empty/error states |
| Studio dialogs/pickers | MobileSheet, PropertyDrawer, media selectors | Hidden focus targets, incomplete trap/restore, nested Escape handling | Medium | Shared dialog behavior, named inputs, real thumbnail buttons |
| Journal filter | `journal-explorer.tsx` | Search clear depends on existence of tags | Low | Keep clear available for search-only state |
| Outbox | `claimForSending` + sync candidate snapshot | Concurrent enqueue can replace an unsent payload after listing; stale send can acknowledge newer content away | High | Atomically claim and return exact payload; reproduce interleaving |
| Legacy draft recovery | Legacy migration + `writeDraft` result | Source removal can happen after destination write fails | High | Retain source and retry until durable write succeeds |
| Media resolution | Draft/conflict rewrite paths | Read-then-write may race another local edit | High, investigating | Serialize/transactionally resolve latest records, test failure paths |
| Loop Clip F06/F13 | `clip-check`, conversion, ingest | MP4 container accepted without actual AVC assurance; incomplete input cleanup | High | Explicit codec target, validate actual output, capability refusal and cleanup |
| Voice Notes Phase 1A | Migration0014, field/player, R2 policy tests | Implemented on master; old report still says branch local-only | Historical claim stale | Preserve phase scope, reverify locally, correct dated status |
| Media registry privacy | RLS0002 and later chain | Anonymous SELECT can enumerate draft/unattached media metadata | High | Prepare local additive owner-only registry migration and role tests |
| Delete / publication | Atomic delete RPC, publish gate, local editor states | Historical bulk-delete split statements already fixed in56a18b7 | Implemented; reverify | Run existing atomic-delete/ownership/publication regressions, do not rebuild |
| Backup/restore | `BACKUP.md` | Restore stops at0004 and conflates schema/data dump | High operational | Correct documented scratch restore procedure; no production operations |
| Device and production acceptance | Access inventory | Real iPhone, live schema, owner flows and storage-provider durability not accessible | Unverified | Explicit release checklist; no inferred pass |

## Verification and final status

### Implemented and verified locally

- **Outbox:** the transaction claims and returns the exact current payload;
  concurrent enqueue cannot substitute an unacknowledged document after a stale
  candidate read. The latest payload's pending media is checked at claim time.
- **Recovery:** failed IndexedDB migration keeps the original localStorage copy.
  Cleanup and carry-over use transactions and preserve a different destination
  draft. Synchronous storage refusal is consistently reported as failure.
- **Media durability:** queue, recovery, conflicts and resolution bookkeeping
  update atomically. Small completed identity mappings remain available for
  delayed/background references. A reference scan and byte release share a
  transaction, include recovery drafts, and fail closed on storage refusal.
- **Loop Clip:** request AVC with forced transcoding, then independently demux
  output to verify codec/container/dimensions/duration/frame rate before stash.
  MP4 is no longer codec evidence. Add cancellation, cleanup, a 120-second
  deadline and a decoded-frame ceiling; backgrounding cancels active preparation
  with a retry explanation. Already durable uploads remain in the existing queue.
- **Voice Notes:** unverifiable/corrupt/oversized MP4 indexes and every disallowed
  sample description are refused. Remove/unmount cancels in-flight replacement
  so a delayed result cannot reattach a removed recording. Phase 1A only: no
  recording, waveform, sticky player, GC or provider deletion was added.
- **Studio UX:** one shared focus scope for sheets, drawer, media dialog and
  command palette. Nested Escape closes the top dialog; Tab excludes hidden
  controls; focus restores without scrolling; typing does not reset focus.
  Media thumbnails are keyboard buttons, search is named, and an arriving command
  index preserves the user's query. Narrow toolbar wraps; identified action
  controls in Pages, Settings, Messages, Media and delete confirmation are 44px
  on mobile. Journal search can reset when there are no tags. Missing-config copy
  no longer recommends the destructive seed loader.
- **Data privacy:** local migration `0015_private_media_registry.sql` removes
  anonymous registry enumeration while preserving owner CRUD and public content
  references. Both Studio pickers use the session-aware browser client; otherwise
  the owner-only policy would hide their libraries too. Known provider object
  URLs remain public; this change does not claim private media delivery.
- **Home:** individual static, large-media project sections replace ProjectCard
  teasers. Existing featured pins and sort order curate the page; all pins appear,
  with the previous three-project fallback when none are pinned. Cover/thumbnail,
  subtitle, excerpt and role come from existing records. No invented outcomes,
  clients, metrics or assets. The archive link follows proofs; Journal gets a
  reading-led featured/newest excerpt and two optional title links; NotebookPlay,
  the existing community story, and invitation follow. Empty/error states stay
  distinct. Studio's Home description explains the curation.
- **Docs:** corrected Voice Notes' stale local-only status, migration inventory,
  Home guidance, motion inventory, and schema/data/identity/provider backup
  instructions. Backup rehearsal remains unperformed.

### Historical fixes deliberately retained

`88a5271` already fixed earlier outbox/media handoff issues and `56a18b7` made
bulk delete one atomic RPC per item. Explicit ownership, sanitizer, publish gate,
immutable attempted mutation IDs, exact ACKs, idempotency, bounded retry, stable
upload identity, atomic conflict handoff, LOCAL_ONLY and honest Live editing
states were retained and covered by regression checks. Voice Notes Phase 1A,
0014 and the Windows path test correction were already on master. They were not
reimplemented. A batch delete is still explicitly partial across items; each
item's content deletion is atomic.

### Executed evidence

- Full `npm test`: **1,078 passed, 0 failed, 0 skipped**, including the final picker
  client integration regressions. Includes real PostgreSQL 17.11 multi-connection
  concurrency/delete tests, plus PGlite migration/RLS tests, fake IndexedDB
  quota/race tests, mocked offline/retry/ACK/provider tests, content-quality and
  profile-editor checks. Final run logs are in `hilman-audit/final-tests.log`.
- New reliability regressions were also run against isolated copies of baseline
  modules: 10 initial failures and 3 further recovery failures demonstrate the
  defects, without altering the checkout. Current implementations pass.
- `npm run typecheck` and `npm run build` pass. Google Fonts is reachable now.
  The build emits expected missing-Supabase/site-origin warnings. Production
  server requests render the content-unavailable fallback; this is not a
  successful connected production portfolio or CMS check.
- Public Chromium: **70 route/theme/width combinations** across Home, Works,
  Journal, About, Connect, Lab and the unconfigured Studio login at
  360/390/430/768/1440px in Night/Paper. One H1, no horizontal overflow or
  JavaScript page errors. Six public routes checked with JavaScript disabled.
  Menu tap/Escape focus restoration, NotebookPlay repeated mode selection,
  reduced motion enabled during use, and About hash position checked.
- Actual Home proof/Journal components: **10 no-JS layout combinations** with
  explicitly synthetic portrait/landscape fixtures, long text and real image
  dimensions. This tests layout without inventing portfolio content or loading
  private records. Current local app has no genuine published records; final
  composition with the author's real media remains a release check.
- Studio's actual components, with mocked backend/block fields: focus/keyboard/
  nested Escape/rapid repeat at five widths; Night/Paper touch-equivalent taps at
  three phone widths; scroll restored 593→593px; 21 representative action
  targets at least 44×44px on mobile; no overflow. The final picker harness
  distinguishes session-aware versus anonymous clients. This is not an owner
  login/save/upload session or a physical iPhone test.
- Media Chromium 154: synthetic MOV 2560×1440/60fps → MP4
  **1920×1080/30fps, `avc1.640c28`**; independent `ffprobe` reports H.264 High.
  Missing encoder, HEVC refusal, cancellation while active/queued, and recovery
  of the next job passed. Mocked React checks cover background/cancel/repeated
  input and voice Remove/unmount without stale attachment or upload flush.

Artifacts under `/workspace/hilman-audit/`:

| Evidence | Files |
| --- | --- |
| Public before/after | `before/`, `after/public-results.json`, `after/home-390-light.png`, `after/home-1440-dark.png` |
| Proof fixtures (clearly labelled QA) | `after/proof-results.json`, `after/proofs-fixture-390-light.png`, `after/proofs-fixture-1440-dark.png` |
| Studio component interaction | `studio-harness/results.json`, `touch-results.json`, `actions-results.json`, screenshots and executable scripts |
| Media bytes and interaction | `media-harness/README.md`, codec/normalization/UI JSONL, `ffprobe-output.json`, local output MP4s |
| Commands | `final-tests.log`, `final-typecheck.log`, `final-build.log` |

### Connect follow-up — 12 October 2026

The requested send redesign replaces the large cream Lottie success panel with
a transparent outlined button: a single plane nudge while submitting, then a
check only after the server's success result. The form remains visible, fields
are read-only during submission/after success, and controlled values survive a
returned error. Status text is announced without moving keyboard focus; an
explicit “Write another note” starts over and focuses Name. Reduced motion
removes the motion, including a preference change during submission. No added
dependency or other public-page animation.

Browser reproduction also found two synchronous submissions could queue before
React rendered pending. A synchronous ref latch now rejects the second event;
four-event bursts, returned error/retry and the sent state were independently
verified against the actual component with a mocked action. This is a UI guard,
not server idempotency: a lost acknowledgement and manual retry can still
duplicate a message. Unexpected transport rejection recovery was not changed.

Follow-up evidence: 60 relevant render/performance tests, typecheck and production
build passed. Chromium exercised 20 combinations (360/390/430/768/1440px,
Night/Paper, normal/reduced motion), keyboard, touch-equivalent submission,
retained errors/retry, repeated submits, stable focus, explicit reset, transparent
button background and no Lottie requests/overflow. No-JavaScript Connect content
and form visibility were checked, not a no-JavaScript send. Real site fonts were
loaded in the isolated harness. `hilman-audit/connect-harness/` holds the scripts,
results, screenshots and command logs. The 1,078-test full run above precedes
this follow-up; the obsolete success-illustration markup assertion was removed.
No real messages were sent, and this remains a Chromium viewport check rather
than physical iPhone/VoiceOver evidence.

### Source release authorization — 12 October 2026

After reviewing the local work and Connect follow-up, the user requested a
direct push to `master`. This authorizes committing and pushing the audited
changes; it does not apply migration0015 or authorize production data/media
operations. The remote was rechecked at the baseline HEAD before preparing the
commit. CI or hosting may run automatically after the push; their completion
must be checked separately from local test/build evidence.

### Later local interaction and illustration follow-ups

The earlier source release was committed as `6bb77c0` and pushed to `master`
under the user's direct authorization. The user subsequently reported running
migration0015; this is a user-reported application, not a live schema/ledger
verification from this environment.

The next local follow-ups refine public buttons/navigation/filter controls and
add three original transparent Lottie drawings to Home Play, plus the existing
filed-idea drawing at the invitation. Connect keeps its transparent button-only
feedback. No new dependency or migration is introduced. After local verification,
the user authorized committing and pushing these follow-ups directly to master.
Deployment results remain separate from the source push. Current motion contracts and local verification are in
`HILMAN-BITS.md`; artifacts are under `hilman-audit/button-polish/` and
`hilman-audit/lottie-moments/`.

### Evidence limits and remaining release work

1. The audit initially left changes uncommitted on `work`. The subsequent source
   release is authorized above; consult Git for the resulting commit and remote
   status. No deployment command or remote migration is part of that push.
2. With the user's access, read actual Supabase schema/functions/policies and
   migration ledger separately. Confirm 0014 behavior, review the additive0015
   policy, and plan release against the actual schema. Do not repair history or
   replay old migrations blindly. Apply0015 only under a separate authorized
   release if still needed after checking the actual ledger. The user reports
   applying it, but this environment has not independently verified that state.
3. Verify provider backups and rehearse restore in a scratch project with Auth
   identity mapping and media copies. Local SQL tests are not a backup rehearsal.
4. Use a separate test project and user-provided owner login to exercise real
   Dashboard, editors, taxonomy, media, messages, settings, import/recovery,
   conflict and publication flows. Perform real upload/replace/remove/Range
   checks only when separately authorized. No owner credentials were requested
   in chat or read from files here.
5. Check physical iPhone Safari/PWA: keyboard/safe areas, VoiceOver, Camera/Voice
   Memos formats, HEVC decode/encode, weak network, background/force-close/resume,
   storage pressure/eviction, battery and memory. Chromium viewport is not iPhone;
   the successful MOV fixture does not establish HEVC conversion support.
6. Review pinned real projects, cover framing, excerpts and contributions in
   Home; keep unsubstantiated facts absent. Confirm public origin metadata,
   sitemap, image delivery and live content. No baseline/candidate Lighthouse
   median or real-device performance certification is claimed.
7. Inspect CI/deployment results after the authorized code push, then smoke-test
   production with the required access. Schema application still needs separate
   authorization. GitHub REST/production-origin access was proxy-blocked in this
   environment, so deployment READY and live migration status were not observed.
