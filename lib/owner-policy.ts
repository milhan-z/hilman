export type OwnerCheck =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: "unconfigured" | "unauthenticated" | "not-owner" | "unavailable";
      message: string;
    };

type RpcError = { code?: string; message?: string } | null;
const MISSING_FUNCTION = new Set(["42883", "PGRST202", "PGRST203"]);

/** Only an explicit, successful database ownership decision may grant CMS access. */
export function decideOwnerAccess(userId: string | null, data: unknown, error: RpcError): OwnerCheck {
  if (!userId) {
    return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
  }
  if (error) {
    return {
      ok: false,
      reason: "unavailable",
      message: MISSING_FUNCTION.has(error.code ?? "")
        ? "Site ownership could not be verified. Apply the owner migration (0003_owner_and_integrity.sql) before using the studio."
        : "Could not verify site ownership. Please try again in a moment.",
    };
  }
  if (data !== true) {
    return {
      ok: false,
      reason: "not-owner",
      message: "This account is signed in but isn't the site owner.",
    };
  }
  return { ok: true, userId };
}
