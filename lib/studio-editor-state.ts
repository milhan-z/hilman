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
  | "CONFLICT";

/** How much attention the line deserves — never colour alone, see StatusLine. */
export type StatusTone = "neutral" | "pending" | "good" | "warn" | "bad";

export type EditorActionId =
  | "save-draft"
  | "publish"
  | "save-changes"
  | "update-live"
  | "retry"
  | "review";

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
  conflict: boolean;
  /** Queued behind a photograph that has not been uploaded yet. */
  waitingOnPhoto?: boolean;
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
    const localLabel = offline
      ? "Waiting for connection"
      : snapshot.syncing
        ? "Syncing…"
        : savedOn(device);

    const note = snapshot.publishQueued
      ? `${PUBLISH_QUEUED_TITLE} — ${PUBLISH_QUEUED_BODY}`
      : snapshot.waitingOnPhoto
        ? `${savedOn(device)}. The photo goes up first, then the writing.`
        : offline
          ? `${savedOn(device)}. It sends itself when you're back.`
          : null;

    return {
      state: offline ? "OFFLINE" : "QUEUED",
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
