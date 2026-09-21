import { firstBlockProblem } from "./block-contract";
import type { Block } from "./types";

/**
 * The shape of a save that travelled through a queue.
 *
 * Kept free of browser and server imports on purpose: the editor, the outbox
 * and /api/studio/sync all speak it, and the rules below are the ones worth
 * unit-testing without a database or a phone.
 *
 * Two ideas carry the whole design.
 *
 * `mutationId` makes a retry safe. A save can reach the server, the response
 * can be lost on a dying connection, and the phone will send it again; the
 * database recognises the id and reports the first attempt's result instead of
 * writing a second time.
 *
 * `baseUpdatedAt` makes a stale save visible. It is the row's `updated_at` as
 * the editor last saw it. If the server has moved on since — an edit made on a
 * laptop while the phone was in a tunnel — the save is refused and both
 * versions are shown, rather than one quietly erasing the other.
 */

export type SyncEntity = "project" | "journal";

export interface SyncPayload {
  /** Scalar columns, exactly as the existing save actions name them. */
  fields: Record<string, unknown>;
  blocks: Block[];
  tagIds: string[];
}

export interface SyncMutation {
  mutationId: string;
  entity: SyncEntity;
  /** Null until a create has been accepted by the server. */
  entityId: string | null;
  /** Stable id for something created offline, so the draft can follow it. */
  localId: string;
  /** Opaque server timestamp. Never re-derive it from a Date — see below. */
  baseUpdatedAt: string | null;
  payload: SyncPayload;
  queuedAt: string;
  attempts: number;
  /** Set when the last attempt came back as something worth showing. */
  lastError?: string;
}

export interface ServerDocument {
  id: string;
  updatedAt: string;
  fields: Record<string, unknown>;
  blocks: Block[];
  tagIds: string[];
}

export type SyncOutcome =
  | { status: "saved"; mutationId: string; localId: string; id: string; updatedAt: string; replayed: boolean }
  | {
      status: "conflict";
      mutationId: string;
      localId: string;
      id: string;
      serverUpdatedAt: string;
      server: ServerDocument;
    }
  /**
   * Will never succeed as written — a validation or permission problem.
   *
   * `reason` says which kind, so the editor can offer the move that would
   * actually help. A document held back because two paragraphs are still the
   * template's questions needs those paragraphs looked at; "Try again" is the
   * one thing that is guaranteed not to work.
   */
  | {
      status: "rejected";
      mutationId: string;
      localId: string;
      message: string;
      reason?: RejectionReason;
      /** How many starter prompts are unanswered, when that is the reason. */
      prompts?: number;
    }
  /** Might succeed later — the network or the server was unavailable. */
  | { status: "retry"; mutationId: string; localId: string; message: string };

/** Why a mutation will never be accepted as written. */
export type RejectionReason =
  | "CONTENT_BLOCKED"
  | "MALFORMED"
  | "AUTH_ERROR"
  | "SERVER_ERROR";

export interface SyncRequest {
  mutations: SyncMutation[];
}

export interface SyncResponse {
  results: SyncOutcome[];
}

/* ── validation, shared by both ends ──────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/**
 * Rejects a mutation the server could never apply, before it is sent.
 *
 * Returns the reason, or null when the mutation is well formed. This runs on
 * the server, where it is the decision; it is exported from shared code so the
 * client can apply the same rules before queueing when it wants to, and so the
 * rules can be tested without either end.
 */
export function describeMalformedMutation(value: unknown): string | null {
  if (!value || typeof value !== "object") return "A queued save must be an object.";
  const m = value as Partial<SyncMutation>;

  if (!isUuid(m.mutationId)) return "A queued save needs a UUID mutation id.";
  if (m.entity !== "project" && m.entity !== "journal")
    return `"${String(m.entity)}" is not something this studio saves.`;
  if (typeof m.localId !== "string" || !m.localId.trim())
    return "A queued save needs a local id.";
  if (m.entityId != null && !isUuid(m.entityId)) return "The content id is not a UUID.";
  if (m.baseUpdatedAt != null && typeof m.baseUpdatedAt !== "string")
    return "The base version must be the timestamp the server sent.";
  if (m.entityId != null && !m.baseUpdatedAt)
    return "An edit has to say which version it was made against.";

  const payload = m.payload;
  if (!payload || typeof payload !== "object") return "The save has no payload.";
  if (!payload.fields || typeof payload.fields !== "object" || Array.isArray(payload.fields))
    return "The payload has no fields.";
  if (!Array.isArray(payload.blocks)) return "The content payload isn't a list of blocks.";
  // The same contract the importer uses. A block of a known type can still
  // carry a payload the renderer cannot draw, and a server component that
  // throws is a 500 on the whole article rather than one missing block.
  const badBlock = firstBlockProblem(payload.blocks);
  if (badBlock) return badBlock;
  if (!Array.isArray(payload.tagIds) || !payload.tagIds.every(isUuid))
    return "The tag list contains an invalid id.";

  const title = String((payload.fields as Record<string, unknown>).title ?? "").trim();
  if (!title) return "A title is needed before this can be saved.";

  return null;
}

/**
 * Whether a failed attempt is worth queueing again.
 *
 * Anything the server *decided* — not the owner, bad payload, a publish that
 * fails the quality gate — will decide the same way tomorrow, so it is handed
 * back to the editor instead of spinning in the queue forever. Anything the
 * network merely failed to deliver is retried.
 */
export function outcomeIsTerminal(outcome: SyncOutcome): boolean {
  return outcome.status !== "retry";
}

/**
 * Local edits are made on top of local state, and local state already contains
 * our own last save. So once a save lands, everything still queued for that
 * same row is by definition based on the version we just created.
 *
 * Without this, a second edit made while the first was in flight would come
 * back as a conflict with the editor's own writing.
 */
export function rebaseQueued<T extends SyncMutation>(
  queued: T[],
  applied: { localId: string; entity: SyncEntity; id: string; updatedAt: string }
): T[] {
  return queued.map((mutation) => {
    const sameRow =
      mutation.entity === applied.entity &&
      (mutation.entityId === applied.id || mutation.localId === applied.localId);
    if (!sameRow) return mutation;
    return { ...mutation, entityId: applied.id, baseUpdatedAt: applied.updatedAt };
  });
}

/**
 * Which fields two versions actually disagree about.
 *
 * A conflict screen that says "the server changed" and nothing else makes the
 * editor guess. This lists the fields worth looking at, and treats the body as
 * one item because a block list does not diff usefully in a sentence.
 */
export function describeConflict(
  mine: SyncPayload,
  theirs: Pick<ServerDocument, "fields" | "blocks" | "tagIds">
): string[] {
  const differences: string[] = [];

  const keys = new Set([...Object.keys(mine.fields), ...Object.keys(theirs.fields)]);
  for (const key of keys) {
    const a = mine.fields[key] ?? "";
    const b = theirs.fields[key] ?? "";
    if (String(a) !== String(b)) differences.push(key);
  }

  if (JSON.stringify(mine.blocks.map(strippedBlock)) !== JSON.stringify(theirs.blocks.map(strippedBlock)))
    differences.push("content");

  if ([...mine.tagIds].sort().join() !== [...theirs.tagIds].sort().join()) differences.push("tags");

  return differences.sort();
}

/** Block ids are local bookkeeping — two identical bodies should compare equal. */
function strippedBlock(block: Block) {
  return { type: block.type, data: block.data ?? {} };
}
