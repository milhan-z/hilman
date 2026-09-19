/**
 * The words the Studio shows while a file is being taken in.
 *
 * Pure, and deliberately kept out of the components: three surfaces report
 * this (the camera tile, the multi-photo sheet, the Loop Clip field) and they
 * should not each invent their own vocabulary for the same four states.
 *
 * The tone is the same one the rest of the status line uses — calm, present
 * tense, no exclamation. "Optimizing photo…" is a sentence about what the
 * phone is doing right now; "Compressing clip… 36%" adds a number only
 * because a video is slow enough that its absence reads as a freeze.
 */

import type { IngestProgress, MediaReport } from "./media-optimize";

/** What to show while `phase` is in progress. */
export function ingestLabel(
  progress: IngestProgress | null,
  kind: "image" | "loop-clip" = "image"
): string {
  if (!progress) return "Keeping…";

  const noun = kind === "loop-clip" ? "clip" : "photo";

  switch (progress.phase) {
    case "inspecting":
      return "Preparing…";
    case "optimizing": {
      const verb = kind === "loop-clip" ? "Compressing" : "Optimizing";
      // A ratio is only worth showing once it means something; 0% for the
      // first second of a long encode reads as stuck rather than as starting.
      const pct = progress.ratio != null ? Math.round(progress.ratio * 100) : null;
      return pct != null && pct > 0 ? `${verb} ${noun}… ${pct}%` : `${verb} ${noun}…`;
    }
    case "validating":
      return "Checking…";
    case "storing":
      return "Keeping…";
    default:
      return "Keeping…";
  }
}

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * The one-line "that was worth doing" note, or null when there is nothing
 * worth saying.
 *
 * Silence is the default. A report only earns a line when the saving is large
 * enough to be interesting — otherwise the Studio would narrate every
 * photograph with a statistic nobody asked for.
 */
export function savingNote(report: MediaReport | undefined): string | null {
  if (!report?.optimized) return null;
  if (report.savedBytes <= 0) return null;
  // Under a fifth saved, or under half a megabyte, is not news.
  if (report.savedRatio < 0.2 || report.savedBytes < 512 * 1024) return null;

  return `${mb(report.originalBytes)} → ${mb(report.finalBytes)} · saved ${Math.round(
    report.savedRatio * 100
  )}%`;
}
