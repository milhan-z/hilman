/**
 * What a save is allowed to do to the public site.
 *
 * The studio has one row per project, so writing a published item to the
 * database *is* changing the live page. That makes "keep my working copy" and
 * "update the site" two genuinely different operations rather than two labels
 * on one, and the difference has to survive refactoring.
 *
 * So intent is declared, not inferred. Every save says which of these it is,
 * and the transport refuses the combination that would be a lie:
 *
 *   LOCAL_ONLY   this device, and nowhere else. Never touches the network.
 *   SYNC_DRAFT   the server, as a draft. Not public.
 *   PUBLISH      the server, and the public site, for the first time.
 *   UPDATE_LIVE  the server, replacing what the public already reads.
 *
 * The one that matters is the first. A local save that quietly reached the
 * server would republish an article from a half-finished edit, which is the
 * single worst thing this studio could do.
 */

export type SaveIntent = "LOCAL_ONLY" | "SYNC_DRAFT" | "PUBLISH" | "UPDATE_LIVE";

/** Whether this intent is permitted to send anything anywhere. */
export function intentMayReachServer(intent: SaveIntent): boolean {
  return intent !== "LOCAL_ONLY";
}

/** Whether this intent changes what the public can read. */
export function intentChangesPublicSite(intent: SaveIntent): boolean {
  return intent === "PUBLISH" || intent === "UPDATE_LIVE";
}

/** The `status` column a server-bound intent writes. */
export function statusForIntent(intent: SaveIntent): "published" | "draft" {
  return intentChangesPublicSite(intent) ? "published" : "draft";
}

/**
 * Thrown rather than returned.
 *
 * A caller that asks the network layer to send a LOCAL_ONLY save has a bug,
 * and a bug of exactly the kind that would be invisible in testing and
 * catastrophic in use. Returning an error object would let it be ignored.
 */
export class LocalOnlySaveError extends Error {
  constructor() {
    super(
      "A local-only save must not be sent anywhere. " +
        "Write it to this device's drafts instead."
    );
    this.name = "LocalOnlySaveError";
  }
}

export function assertMayReachServer(intent: SaveIntent): void {
  if (!intentMayReachServer(intent)) throw new LocalOnlySaveError();
}
