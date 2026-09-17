/**
 * What the editor is allowed to claim about your work.
 *
 * The studio confused two different questions and answered both with the word
 * "saved". They are separate and they stay separate here:
 *
 *   Where is this version?   on screen · on this device · on its way · on the site
 *   Who can read it?         only me (Draft) · everyone (Live)
 *
 * A published article you have just edited is `Live · Unsaved changes` — still
 * Live, because the old version is still the one the public gets, and still
 * unsaved, because the new words are nowhere but the textarea. Calling that
 * "Draft" would suggest the site had been taken down; calling it "Saved" would
 * suggest the edit was public. Both are lies this module exists to prevent.
 *
 * Pure on purpose: no React, no browser, no network. The rules are the part
 * worth testing, and tests/studio-editor-state.test.ts does exactly that.
 */

/** Only these two words are ever shown for the public half. */
export type PublishLabel = "Draft" | "Live";

export type EditorState =
  | "NEW_DRAFT"
  | "DRAFT_CLEAN"
  | "DRAFT_DIRTY"
  | "SAVING_DRAFT"
  | "PUBLISHED_CLEAN"
  | "PUBLISHED_DIRTY"
  | "PUBLISHING"
  | "QUEUED"
  | "OFFLINE"
  | "ERROR"
  | "BLOCKED"
  | "MEDIA_WAIT"
  | "MEDIA_ERROR"
  | "CONFLICT";

/**
 * Why the last attempt did not reach the site.
 *
 * Everything used to arrive as one sentence and come out as "Couldn't sync",
 * which is true of a dropped connection and misleading about everything else.
 * A document held back because two paragraphs are still the template's
 * questions has not failed to sync — it has not been finished, and the useful
 * next action is to look at those paragraphs rather than to press Try again.
 *
 * The caller says which kind it was where it can tell. Where it cannot, the
 * sentence alone still works and the old behaviour is what happens.
 */
export type FailureKind =
  | "CONTENT_BLOCKED"
  | "MEDIA_PENDING"
  | "MEDIA_FAILED"
  | "CONFLICT"
  | "OFFLINE"
  | "SERVER_ERROR"
  | "AUTH_ERROR";

/** How much attention the line deserves — never colour alone, see StatusLine. */
export type StatusTone = "neutral" | "pending" | "good" | "warn" | "bad";

export type EditorActionId =
  | "save-draft"
  | "publish"
  | "save-changes"
  | "update-live"
  | "retry"
  | "review"
  | "review-prompts"
  | "remove-prompts"
  | "retry-upload";

export interface EditorAction {
  id: EditorActionId;
  label: string;
  /** `accent` is the filled button; `plain` is the outlined one beside it. */
  emphasis: "accent" | "plain";
}

export interface EditorSnapshot {
  /** Nothing has been created on the server yet. */
  isNew: boolean;
  /** What the *public site* currently serves, not what the form says. */
  published: boolean;
  /** The form differs from the last version written down anywhere. */
  dirty: boolean;
  /** The last change reached this device's storage and stopped there. */
  savedLocally: boolean;
  inFlight: "none" | "saving" | "publishing";
  /** Sitting in the outbox, addressed to the site. */
  queued: boolean;
  /** A request carrying the queue is actually on the wire right now. */
  syncing?: boolean;
  /** Publish was asked for and is waiting on a connection, not on the server. */
  publishQueued?: boolean;
  /** Evidence of a reachable server, not navigator.onLine. See sync.ts. */
  reachable: boolean;
  error: string | null;
  /** What kind of failure `error` is, when the caller could tell. */
  failure?: FailureKind;
  /**
   * How many starter prompts are still unanswered.
   *
   * Only the count: this module turns state into a sentence, and the sentences
   * that name the prompts belong to the sheet that can show them.
   */
  blockedPrompts?: number;
  conflict: boolean;
  /** Queued behind a file that has not been uploaded yet. */
  waitingOnMedia?: boolean;
  /** Files still going up, ones that have given up, and what they are. */
  uploads?: { pending: number; failed: number; noun?: UploadNoun };
}

export interface EditorStatus {
  state: EditorState;
  publishLabel: PublishLabel;
  /** "Unsaved changes", "Saved on this iPhone", "Synced"… */
  localLabel: string;
  /** "Live · Unsaved changes" — the one line the top bar shows. */
  statusLine: string;
  tone: StatusTone;
  /** A sentence, only when the short line would leave something unsaid. */
  note: string | null;
  primary: EditorAction | null;
  secondary: EditorAction | null;
}

/**
 * The phone in your hand, named.
 *
 * "Saved on this iPhone" is worth more than "saved locally" because it says
 * exactly which object the writing is sitting inside. On a laptop that word
 * would be wrong, so the caller supplies it.
 */
export const DEFAULT_DEVICE = "this device";

const SAVE_DRAFT: EditorAction = { id: "save-draft", label: "Save draft", emphasis: "plain" };
const PUBLISH: EditorAction = { id: "publish", label: "Publish", emphasis: "accent" };
const PUBLISH_WHEN_ONLINE: EditorAction = {
  id: "publish",
  label: "Publish when online",
  emphasis: "accent",
};
const SAVE_CHANGES: EditorAction = { id: "save-changes", label: "Save changes", emphasis: "plain" };
const UPDATE_LIVE: EditorAction = { id: "update-live", label: "Update live", emphasis: "accent" };
const RETRY: EditorAction = { id: "retry", label: "Try again", emphasis: "accent" };
const REVIEW: EditorAction = { id: "review", label: "Review changes", emphasis: "accent" };
const SHOW_PROMPTS: EditorAction = { id: "review-prompts", label: "Show them", emphasis: "accent" };
const REMOVE_PROMPTS: EditorAction = { id: "remove-prompts", label: "Remove them", emphasis: "plain" };
/**
 * What is being uploaded, so the sentence can name it.
 *
 * This used to be the word "photo", hard-coded, because photographs were the
 * only thing that could be waiting. Loop clips go through the same queue now,
 * and a stuck video that says "Retry photo" sends the author looking for a
 * photograph that is not the problem.
 *
 * `"file"` is the honest answer when a photo and a clip are both waiting: it
 * covers both without claiming the queue is one or the other.
 */
export type UploadNoun = "photo" | "clip" | "file";

const DEFAULT_NOUN: UploadNoun = "photo";

/** "photo" / "2 clips" — the count included only when there is more than one. */
const many = (count: number, noun: UploadNoun) => `${noun}${count === 1 ? "" : "s"}`;

const retryUpload = (noun: UploadNoun): EditorAction => ({
  id: "retry-upload",
  label: `Retry ${noun}`,
  emphasis: "accent",
});

const savedOn = (device: string) => `Saved on ${device}`;

/**
 * Turns everything the editor knows into one sentence and at most two buttons.
 *
 * The order of the checks is the whole design. A conflict outranks an error
 * outranks a request in flight outranks a queue outranks unsaved text, because
 * that is the order in which the answers stop being true: once two versions of
 * a paragraph exist, what the save bar was about to say no longer matters.
 */
export function describeEditor(
  snapshot: EditorSnapshot,
  device: string = DEFAULT_DEVICE
): EditorStatus {
  const publishLabel: PublishLabel = snapshot.published ? "Live" : "Draft";
  const line = (localLabel: string) => `${publishLabel} · ${localLabel}`;

  /* ── two versions of the same writing ── */
  if (snapshot.conflict) {
    return {
      state: "CONFLICT",
      publishLabel,
      localLabel: "Needs review",
      statusLine: line("Needs review"),
      tone: "bad",
      note: "This was also edited somewhere else. Nothing has been overwritten.",
      primary: REVIEW,
      secondary: null,
    };
  }

  /* ── a photograph gave up ──
     Before the generic error, because "couldn't sync" would describe the
     writing, and the writing is fine: it is one upload that is stuck. */
  if (snapshot.failure === "MEDIA_FAILED" || (snapshot.uploads?.failed ?? 0) > 0) {
    const failed = snapshot.uploads?.failed ?? 1;
    const noun = snapshot.uploads?.noun ?? DEFAULT_NOUN;
    const label = `${noun === "photo" ? "Photo" : noun === "clip" ? "Clip" : "Upload"} problem`;
    return {
      state: "MEDIA_ERROR",
      publishLabel,
      localLabel: label,
      statusLine: line(label),
      tone: "bad",
      note: `${failed === 1 ? `A ${noun}` : `${failed} ${many(failed, noun)}`} couldn't upload. Everything you wrote is safe on ${device}.`,
      primary: retryUpload(noun),
      secondary: null,
    };
  }

  /* ── the writing is not finished ──
     A held-back document is not a failed request, and "Try again" would do
     nothing for it. The two useful moves are to look at the prompts or to
     take them out, so those are the two buttons. */
  if (snapshot.failure === "CONTENT_BLOCKED") {
    const count = snapshot.blockedPrompts ?? 0;
    const subject = count === 1 ? "one starter prompt" : `${count} starter prompts`;
    return {
      state: "BLOCKED",
      publishLabel,
      localLabel: "Needs your words",
      statusLine: line("Needs your words"),
      tone: "warn",
      note: count
        ? `${savedOn(device)}. The site is waiting on ${subject} that still say what the template said.`
        : `${savedOn(device)}. ${snapshot.error ?? ""}`.trim(),
      primary: SHOW_PROMPTS,
      secondary: count ? REMOVE_PROMPTS : null,
    };
  }

  /* ── the server said no, or the network did ── */
  if (snapshot.error) {
    return {
      state: "ERROR",
      publishLabel,
      localLabel: "Couldn't sync",
      statusLine: line("Couldn't sync"),
      tone: "bad",
      // Never "nothing was saved": the local copy is exactly what survived.
      note: `${savedOn(device)}, but the site hasn't got it. ${snapshot.error}`,
      primary: RETRY,
      secondary: snapshot.published ? UPDATE_LIVE : PUBLISH,
    };
  }

  /* ── a request is out ── */
  if (snapshot.inFlight === "publishing") {
    return {
      state: "PUBLISHING",
      publishLabel,
      localLabel: "Publishing…",
      statusLine: snapshot.published ? "Live · Updating…" : "Publishing…",
      tone: "pending",
      note: null,
      primary: null,
      secondary: null,
    };
  }
  if (snapshot.inFlight === "saving") {
    return {
      state: "SAVING_DRAFT",
      publishLabel,
      localLabel: "Saving…",
      statusLine: line("Saving…"),
      tone: "pending",
      note: null,
      primary: null,
      secondary: null,
    };
  }

  /* ── written down here, not there yet ──
     Three different true things, in the order they become the most useful one
     to say. Offline: it is waiting, and it is safe. Mid-request: it is going.
     Otherwise: it is on this device, which is the answer to "can I close the
     app now" — and the only one of the three that is reassuring. */
  if (snapshot.queued) {
    const offline = !snapshot.reachable;
    const pendingUploads = snapshot.uploads?.pending ?? 0;
    const noun = snapshot.uploads?.noun ?? DEFAULT_NOUN;

    // Waiting on a photograph is a different wait from waiting on a signal,
    // and saying so is the difference between "something is wrong" and
    // "something is happening". Only when there is a connection to upload on:
    // offline, the connection is the thing being waited for.
    const uploading = !offline && (snapshot.waitingOnMedia || pendingUploads > 0);

    const localLabel = offline
      ? "Waiting for connection"
      : uploading
        ? pendingUploads > 1
          ? `${pendingUploads} ${many(pendingUploads, noun)} uploading`
          : `${noun === "photo" ? "Photo" : noun === "clip" ? "Clip" : "Upload"} uploading`
        : snapshot.syncing
          ? "Syncing…"
          : savedOn(device);

    const note = snapshot.publishQueued
      ? `${PUBLISH_QUEUED_TITLE} — ${PUBLISH_QUEUED_BODY}`
      : uploading
        ? `Your writing is safe on ${device}. It goes to the site once the ${
            pendingUploads > 1 ? `${many(pendingUploads, noun)} are` : `${noun} is`
          } up.`
        : offline
          ? `${savedOn(device)}. It sends itself when you're back.`
          : null;

    return {
      state: offline ? "OFFLINE" : uploading ? "MEDIA_WAIT" : "QUEUED",
      publishLabel,
      localLabel,
      statusLine: line(localLabel),
      tone: "pending",
      note,
      primary: null,
      secondary: null,
    };
  }

  /* ── the ordinary states ── */
  if (snapshot.dirty) {
    if (snapshot.published) {
      return {
        state: "PUBLISHED_DIRTY",
        publishLabel,
        localLabel: "Unsaved changes",
        statusLine: "Live · Unsaved changes",
        tone: "warn",
        note: "The site still shows the published version.",
        primary: UPDATE_LIVE,
        secondary: SAVE_CHANGES,
      };
    }
    return {
      state: snapshot.isNew ? "NEW_DRAFT" : "DRAFT_DIRTY",
      publishLabel,
      localLabel: "Unsaved changes",
      statusLine: line("Unsaved changes"),
      tone: "warn",
      note: null,
      primary: snapshot.reachable ? PUBLISH : PUBLISH_WHEN_ONLINE,
      secondary: SAVE_DRAFT,
    };
  }

  // Clean, but the last thing that happened was a save that stopped on this
  // device. A published item can sit here indefinitely: the edit is safe, and
  // it is deliberately not out.
  if (snapshot.savedLocally) {
    return {
      state: snapshot.published ? "PUBLISHED_DIRTY" : "DRAFT_CLEAN",
      publishLabel,
      localLabel: savedOn(device),
      statusLine: line(savedOn(device)),
      tone: "neutral",
      note: snapshot.published ? "The site still shows the published version." : null,
      primary: snapshot.published
        ? UPDATE_LIVE
        : snapshot.reachable
          ? PUBLISH
          : PUBLISH_WHEN_ONLINE,
      // Nothing left to save here — that is what savedLocally means. The only
      // thing left to decide is whether the site gets it.
      secondary: snapshot.published ? null : SAVE_DRAFT,
    };
  }

  if (snapshot.isNew) {
    return {
      state: "NEW_DRAFT",
      publishLabel: "Draft",
      localLabel: "Nothing written yet",
      statusLine: "Draft",
      tone: "neutral",
      note: null,
      primary: snapshot.reachable ? PUBLISH : PUBLISH_WHEN_ONLINE,
      secondary: SAVE_DRAFT,
    };
  }

  if (snapshot.published) {
    return {
      state: "PUBLISHED_CLEAN",
      publishLabel,
      localLabel: "Synced",
      statusLine: "Live · Synced",
      tone: "good",
      note: null,
      // Nothing to save. A permanently disabled Save button here is furniture.
      primary: null,
      secondary: null,
    };
  }

  return {
    state: "DRAFT_CLEAN",
    publishLabel,
    localLabel: "Synced",
    statusLine: "Draft · Synced",
    tone: "good",
    note: null,
    primary: snapshot.reachable ? PUBLISH : PUBLISH_WHEN_ONLINE,
    secondary: null,
  };
}

/**
 * What a list row says under the title.
 *
 * The lists know less than the editor — there is no form on screen to be dirty
 * — so this is deliberately a smaller vocabulary: the public status, plus the
 * one fact that there is unsent work for this row.
 */
export function describeRow(row: {
  published: boolean;
  /** An unsent save or an unsaved local draft exists for this item. */
  pending?: boolean;
  reachable?: boolean;
}): { publishLabel: PublishLabel; localLabel: string | null; tone: StatusTone } {
  const publishLabel: PublishLabel = row.published ? "Live" : "Draft";
  if (!row.pending) {
    return { publishLabel, localLabel: null, tone: row.published ? "good" : "neutral" };
  }
  return {
    publishLabel,
    localLabel: row.reachable === false ? "Waiting for connection" : "Not sent yet",
    tone: "pending",
  };
}

/** Exported so the action bar and the confirmation agree on the wording. */
export const PUBLISH_QUEUED_TITLE = "Publish queued";
export const PUBLISH_QUEUED_BODY = "Will go live when Studio reconnects.";
