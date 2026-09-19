/**
 * Where a link goes, and whether it is safe to follow.
 *
 * One helper, used by the renderer, the editor and the importer, because the
 * alternative is three slightly different string checks that drift apart. The
 * scheme allowlist deliberately matches the one in lib/studio-html.ts: a URL
 * that would be stripped out of pasted markup should not be reachable by
 * typing it into a Link block instead.
 *
 * ── why this distinction matters ──
 *
 * The Link block used to open everything with `target="_blank"`, including
 * links to this site's own pages. Sending somebody to another page of the
 * same portfolio by throwing them into a new tab is the small kind of wrong
 * that accumulates: the back button stops working, the tab count climbs, and
 * on a phone it is actively disorienting. Internal links belong in the same
 * tab; external ones belong in a new one, safely.
 */

/** The schemes a Link block may point at. Mirrors studio-html.ts. */
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

export type LinkKind = "internal" | "external" | "unsafe";

export interface LinkTarget {
  kind: LinkKind;
  /** The href to actually render. Empty when the link is unsafe. */
  href: string;
  /** True only for links that leave the site and therefore need a new tab. */
  newTab: boolean;
}

/**
 * Classifies a URL as somewhere on this site, somewhere else, or nowhere safe.
 *
 * A relative path is internal by definition. An absolute URL is parsed rather
 * than pattern-matched, because `javascript:alert(1)` and
 * ` JavaScript:alert(1)` and `java\tscript:alert(1)` are the same link wearing
 * different hats, and a regex that catches two of those catches two of those.
 */
export function classifyLink(raw: unknown): LinkTarget {
  const unsafe: LinkTarget = { kind: "unsafe", href: "", newTab: false };
  if (typeof raw !== "string") return unsafe;

  const url = raw.trim();
  if (!url) return unsafe;

  // A fragment or query on its own stays on the current page.
  if (url.startsWith("#") || url.startsWith("?")) {
    return { kind: "internal", href: url, newTab: false };
  }

  // Protocol-relative (`//evil.com`) is an external link wearing the costume
  // of a path. It is not a same-site link and must not be treated as one.
  if (url.startsWith("//")) return unsafe;

  if (url.startsWith("/")) {
    return { kind: "internal", href: url, newTab: false };
  }

  // Anything left is either absolute or a bare relative path. Parsing against
  // a base resolves both, and tells us the scheme for free.
  let parsed: URL;
  try {
    parsed = new URL(url, "https://internal.invalid/");
  } catch {
    return unsafe;
  }

  if (!SAFE_SCHEMES.has(parsed.protocol)) return unsafe;

  // mailto: and tel: are neither internal navigation nor a new tab — the OS
  // takes over. Rendered plainly, no target.
  if (parsed.protocol === "mailto:" || parsed.protocol === "tel:") {
    return { kind: "external", href: url, newTab: false };
  }

  // Resolved against the sentinel base, so it was a bare relative path such
  // as `works/thing` rather than an absolute URL.
  if (parsed.hostname === "internal.invalid") {
    return { kind: "internal", href: parsed.pathname + parsed.search + parsed.hash, newTab: false };
  }

  return { kind: "external", href: url, newTab: true };
}

/** The anchor attributes for a target — the one place `_blank` is decided. */
export function linkAttrs(target: LinkTarget): {
  target?: "_blank";
  rel?: string;
} {
  if (!target.newTab) return {};
  // `noopener` is the one that matters; `noreferrer` is the courtesy.
  return { target: "_blank", rel: "noopener noreferrer" };
}

/* ── the editorial side ───────────────────────────────────── */

/** How a Link block is drawn. Anything unrecognised is the default card. */
export const LINK_PRESENTATIONS = ["default", "related"] as const;
export type LinkPresentation = (typeof LINK_PRESENTATIONS)[number];
export const DEFAULT_LINK_PRESENTATION: LinkPresentation = "default";

/**
 * Every Link block written before this feature has no `presentation` at all,
 * and must keep rendering as the card it has always been. Unknown values
 * resolve the same way — total, like the media layout resolvers.
 */
export function resolveLinkPresentation(data: Record<string, any> | null | undefined): LinkPresentation {
  const value = data?.presentation;
  return typeof value === "string" && (LINK_PRESENTATIONS as readonly string[]).includes(value)
    ? (value as LinkPresentation)
    : DEFAULT_LINK_PRESENTATION;
}

/** What kind of thing a related card points at, inferred from its own URL. */
export type RelatedSort = "project" | "journal" | "external" | "page";

export function relatedSort(url: unknown): RelatedSort {
  const target = classifyLink(url);
  if (target.kind !== "internal") return "external";
  if (target.href.startsWith("/works/")) return "project";
  if (target.href.startsWith("/journal/")) return "journal";
  return "page";
}

/**
 * The small line above the title. Says what the destination *is*, so the card
 * reads as part of an archive rather than as an advert.
 */
export function relatedKicker(url: unknown): string {
  switch (relatedSort(url)) {
    case "project":
      return "Related work";
    case "journal":
      return "From the journal";
    case "external":
      return "Elsewhere";
    default:
      return "Continue exploring";
  }
}

/**
 * The call to action, when the author has not written one.
 *
 * A fallback rather than a default: whatever is typed into the block wins,
 * and this is only what appears when nothing was.
 */
export function relatedCta(url: unknown, label?: unknown): string {
  if (typeof label === "string" && label.trim()) return label.trim();
  switch (relatedSort(url)) {
    case "project":
      return "See the project";
    case "journal":
      return "Read the story";
    case "external":
      return "Visit site";
    default:
      return "Continue reading";
  }
}

/** Internal destinations get an arrow; external ones get the "leaves here" one. */
export function relatedArrow(url: unknown): string {
  return classifyLink(url).kind === "external" ? "↗" : "→";
}
