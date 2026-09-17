"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ActionSheet, type ActionItem } from "./action-sheet";
import { QuickCreateSheet } from "./quick-create-sheet";
import { useKeyboardOpen } from "./keyboard-inset";
import { EDITOR_ROUTE } from "./routes";
import { cn } from "@/lib/utils";

/**
 * The studio's bottom navigation.
 *
 * Five targets: Home, Projects, create, Journal, More. Search used to hold the
 * fourth slot, which gave a permanent seat to the thing you do least and no
 * seat at all to the thing you open the app for. It now lives in More and at
 * the top of both lists.
 *
 * Two different kinds of "the tap registered" happen here, and they are worth
 * separating:
 *
 *   The *pressed* state is local, set on pointerdown, and owes nothing to the
 *   router. It is on screen in the same frame as the finger, which is the
 *   whole of the perceived-latency problem — usePathname only changes once the
 *   navigation commits, so styling from it alone made every tab feel late.
 *
 *   The *pending* state comes from useLinkStatus and means the destination is
 *   genuinely still being fetched. It is deliberately faint and delayed: when
 *   a route is prefetched there is nothing to report, and a flicker on every
 *   fast navigation is worse than no indicator at all.
 *
 * Rendered from the admin layout, so it is never unmounted by a navigation.
 */

const icons = {
  home: (
    <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
  ),
  projects: (
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  ),
  journal: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
} as const;

function Icon({ name }: { name: keyof typeof icons }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icons[name]}
    </svg>
  );
}

const TABS = [
  { label: "Home", href: "/admin", icon: "home" },
  { label: "Projects", href: "/admin/projects", icon: "projects" },
  { label: "Journal", href: "/admin/journal", icon: "journal" },
] as const;

const MORE_ITEMS: ActionItem[] = [
  { id: "pages", label: "Pages", href: "/admin/pages", detail: "Home, About and Connect" },
  { id: "media", label: "Media library", href: "/admin/media" },
  { id: "taxonomy", label: "Tags & categories", href: "/admin/taxonomy" },
  { id: "messages", label: "Messages", href: "/admin/messages" },
  { id: "settings", label: "Settings", href: "/admin/settings" },
];

const tabClass = (active: boolean, pressed: boolean) =>
  cn(
    "relative flex min-h-14 flex-1 select-none flex-col items-center justify-center gap-0.5",
    "rounded-md font-mono text-2xs uppercase tracking-wide",
    // 120ms, and only on colour: a tab bar that animates its layout feels
    // slower than one that does not animate at all.
    "transition-colors duration-[120ms]",
    active ? "text-pen" : "text-faint",
    pressed && "bg-card-hover"
  );

export function StudioTabBar() {
  const pathname = usePathname();
  const keyboardOpen = useKeyboardOpen();
  const [pressed, setPressed] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Once the router catches up, the real pathname takes over again.
  useEffect(() => {
    setPressed(null);
    setMoreOpen(false);
  }, [pathname]);

  if (EDITOR_ROUTE.test(pathname)) return null;

  // Typing on a list screen — the search box on Projects, say. Five navigation
  // targets perched on the keyboard toolbar are unreachable anyway, and on iOS
  // they spend the keyboard's animation at the wrong height. The spacer stays,
  // so nothing below reflows while the bar is away.

  const current = pressed ?? pathname;
  const isActive = (href: string) =>
    href === "/admin" ? current === "/admin" : current.startsWith(href);

  return (
    <>
      {/* In-flow spacer so content can scroll clear of the fixed bar. */}
      <div aria-hidden className="h-[calc(64px+env(safe-area-inset-bottom))] lg:hidden" />

      <nav
        aria-label="Studio"
        hidden={keyboardOpen}
        className={cn(
          "fixed inset-x-0 bottom-0 z-[80] border-t border-line-strong bg-paper backdrop-blur lg:hidden",
          "px-2 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))]",
          "pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]"
        )}
      >
        <div className="mx-auto flex max-w-md items-stretch gap-0.5">
          <Tab
            {...TABS[0]}
            active={isActive(TABS[0].href)}
            pressed={pressed === TABS[0].href}
            onPress={setPressed}
          />
          <Tab
            {...TABS[1]}
            active={isActive(TABS[1].href)}
            pressed={pressed === TABS[1].href}
            onPress={setPressed}
          />

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Add something"
            aria-haspopup="dialog"
            className="flex min-h-14 w-16 shrink-0 items-center justify-center"
          >
            <span
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-full bg-hl text-hl-ink shadow-card transition-transform duration-[120ms] active:scale-95"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
          </button>

          <Tab
            {...TABS[2]}
            active={isActive(TABS[2].href)}
            pressed={pressed === TABS[2].href}
            onPress={setPressed}
          />

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={tabClass(
              moreOpen || MORE_ITEMS.some((item) => item.href && isActive(item.href)),
              false
            )}
          >
            <Icon name="more" />
            More
          </button>
        </div>
      </nav>

      <ActionSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        items={[
          {
            id: "search",
            label: "Search",
            detail: "Everything in the studio",
            onSelect: () => window.dispatchEvent(new Event("hilman:cmdk")),
          },
          ...MORE_ITEMS,
          { id: "site", label: "View the site", href: "/", external: true },
        ]}
      />

      <QuickCreateSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

function Tab({
  label,
  href,
  icon,
  active,
  pressed,
  onPress,
}: {
  label: string;
  href: string;
  icon: keyof typeof icons;
  active: boolean;
  pressed: boolean;
  onPress: (href: string | null) => void;
}) {
  return (
    <Link
      href={href}
      // Prefetched from the layout: these three are the whole of the studio's
      // navigation, and they are the routes worth having warm.
      prefetch
      aria-current={active ? "page" : undefined}
      onPointerDown={() => onPress(href)}
      // A press that never becomes a navigation — finger slid off, gesture
      // taken over by the browser — would otherwise leave the tab looking
      // pressed until some later route change happened to clear it.
      onPointerUp={() => onPress(null)}
      onPointerCancel={() => onPress(null)}
      onPointerLeave={() => onPress(null)}
      className={tabClass(active, pressed)}
    >
      <Icon name={icon} />
      {label}
      <PendingHint />
    </Link>
  );
}

/**
 * Only appears when the destination genuinely is not ready.
 *
 * Starts invisible and fades in after 120ms, so a prefetched route — which is
 * the normal case — never shows it at all.
 */
function PendingHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-3 bottom-0.5 h-0.5 rounded-full bg-pen",
        pending ? "animate-[tab-pending_600ms_ease-out_120ms_infinite]" : "opacity-0"
      )}
    />
  );
}
