/**
 * Where you can go in Studio, written down once.
 *
 * There were two lists: `NAV` in components/admin/nav.tsx for the desktop
 * sidebar, and `TABS` + `MORE_ITEMS` in the mobile tab bar. They reached the
 * same eight routes and disagreed about almost everything else — `/admin` was
 * "Dashboard" in one and "Home" in the other, `/admin/taxonomy` was "Taxonomy"
 * and "Tags & categories", `/admin/media` was "Media" and "Media library". The
 * sidebar had no way to create anything; the tab bar's ✛ was the only route to
 * Quick note, so on a laptop that flow existed on exactly one screen.
 *
 * That is the shape of two products rather than one, and it is the thing this
 * module removes. One list, two chromes: a bottom tab bar on a phone, a rail
 * on a desktop. Naming, ordering and grouping come from here, so they cannot
 * drift apart again.
 *
 * `primary` is what both chromes show first — the three destinations plus the
 * create action that sits between them. `secondary` is everything the phone
 * puts behind "More" and the desktop lists below a rule. The split is about
 * how often you need something, not about which device you are on.
 *
 * Icons stay in the components. They are drawn at different sizes and weights
 * for a 56px tab and a 40px rail row, and putting JSX in here would make this
 * a component module rather than the description of a product.
 */

export type StudioIcon =
  | "home"
  | "projects"
  | "journal"
  | "pages"
  | "media"
  | "taxonomy"
  | "messages"
  | "settings";

export interface StudioDestination {
  id: StudioIcon;
  label: string;
  href: string;
  icon: StudioIcon;
  /** One line, shown where there is room for it. */
  detail?: string;
}

/** The three you reach constantly. Rendered as tabs, and at the top of the rail. */
export const PRIMARY_DESTINATIONS: StudioDestination[] = [
  { id: "home", label: "Home", href: "/admin", icon: "home" },
  { id: "projects", label: "Projects", href: "/admin/projects", icon: "projects" },
  { id: "journal", label: "Journal", href: "/admin/journal", icon: "journal" },
];

/** Everything else. Behind "More" on a phone, under a rule on a desktop. */
export const SECONDARY_DESTINATIONS: StudioDestination[] = [
  { id: "pages", label: "Pages", href: "/admin/pages", icon: "pages", detail: "Home, About and Connect" },
  { id: "media", label: "Media library", href: "/admin/media", icon: "media" },
  { id: "taxonomy", label: "Tags & categories", href: "/admin/taxonomy", icon: "taxonomy" },
  { id: "messages", label: "Messages", href: "/admin/messages", icon: "messages" },
  { id: "settings", label: "Settings", href: "/admin/settings", icon: "settings" },
];

export const ALL_DESTINATIONS = [...PRIMARY_DESTINATIONS, ...SECONDARY_DESTINATIONS];

/**
 * Whether a destination is the one being looked at.
 *
 * `/admin` has to match exactly or it would light up on every screen, since
 * every Studio route starts with it.
 */
export function isDestinationActive(href: string, pathname: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}
