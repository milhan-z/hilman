"use client";

import { useState } from "react";
import Link from "next/link";
import { MobileSheet } from "../mobile-sheet";
import { cn } from "@/lib/utils";

/**
 * The ••• menu, as a sheet.
 *
 * One list of full-width rows rather than a floating popover: a popover has to
 * be positioned against a 32px button near the top of a phone screen, which is
 * the one place a thumb cannot comfortably reach.
 *
 * Destructive items arm themselves in place instead of opening a second
 * dialog. window.confirm() on iOS is a system alert that steals the sheet's
 * focus and looks nothing like the rest of the studio, and "are you sure"
 * stacked on "are you sure" is how people learn to tap through both.
 */

export interface ActionItem {
  id: string;
  label: string;
  /** An external or internal address instead of a callback. */
  href?: string;
  external?: boolean;
  onSelect?: () => void;
  tone?: "default" | "danger";
  /** Shown under the label — why this is here, or what it will do. */
  detail?: string;
  disabled?: boolean;
  /** Arms in place and asks once. Only meaningful with onSelect. */
  confirm?: string;
}

const ROW =
  "flex min-h-[52px] w-full items-center justify-between gap-3 rounded-md border px-3.5 text-left text-sm font-medium transition-colors";

export function ActionSheet({
  open,
  onClose,
  title,
  subtitle,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  items: ActionItem[];
}) {
  const [arming, setArming] = useState<string | null>(null);

  const close = () => {
    setArming(null);
    onClose();
  };

  return (
    <MobileSheet open={open} onClose={close} title={title} subtitle={subtitle}>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const danger = item.tone === "danger";
          const armed = arming === item.id;

          if (item.href) {
            const className = cn(ROW, "border-line bg-raise text-ink hover:border-pen");
            return (
              <li key={item.id}>
                {item.external ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={close}
                    className={className}
                  >
                    <Label item={item} />
                    <span aria-hidden className="shrink-0 text-faint">↗</span>
                  </a>
                ) : (
                  <Link href={item.href} onClick={close} className={className}>
                    <Label item={item} />
                    <span aria-hidden className="shrink-0 text-faint">›</span>
                  </Link>
                )}
              </li>
            );
          }

          if (armed) {
            return (
              <li key={item.id} className="rounded-md border border-red/50 bg-red-soft/20 p-3">
                <p className="text-sm font-semibold text-red">{item.confirm}</p>
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setArming(null)}
                    className="min-h-12 rounded-md border border-line bg-surface text-sm font-semibold text-soft"
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      item.onSelect?.();
                      close();
                    }}
                    className="min-h-12 rounded-md bg-red text-sm font-semibold text-white"
                  >
                    {item.label}
                  </button>
                </div>
              </li>
            );
          }

          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  if (item.confirm) {
                    setArming(item.id);
                    return;
                  }
                  item.onSelect?.();
                  close();
                }}
                className={cn(
                  ROW,
                  "disabled:opacity-40",
                  danger
                    ? "border-red/40 bg-red-soft/15 text-red"
                    : "border-line bg-raise text-ink hover:border-pen"
                )}
              >
                <Label item={item} />
              </button>
            </li>
          );
        })}
      </ul>
    </MobileSheet>
  );
}

function Label({ item }: { item: ActionItem }) {
  return (
    <span className="min-w-0">
      <span className="block truncate">{item.label}</span>
      {item.detail && (
        <span className="mt-0.5 block truncate text-xs font-normal text-faint">{item.detail}</span>
      )}
    </span>
  );
}

/** The trigger these sheets hang off, at a size a thumb can actually hit. */
export function MoreButton({
  onClick,
  label = "More actions",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex min-h-12 min-w-12 items-center justify-center rounded-md text-soft transition-colors hover:text-ink",
        className
      )}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="5" cy="12" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="19" cy="12" r="1.8" />
      </svg>
    </button>
  );
}
