"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DEVICE, type PublishLabel, type StatusTone } from "@/lib/studio-editor-state";
import { cn } from "@/lib/utils";

/**
 * The one place the studio renders "where is my work".
 *
 * Every screen that has an opinion about it — the editor bar, a list row, the
 * home header — goes through here, so the same fact cannot be phrased two
 * different ways in two different corners of the app.
 *
 * Tone is carried by a dot *and* a word, never by colour alone. "Is my writing
 * safe?" is not a question to answer with a hue.
 */

const DOT: Record<StatusTone, string> = {
  neutral: "bg-faint",
  pending: "bg-hl animate-pulse motion-reduce:animate-none",
  good: "bg-pen",
  warn: "bg-hl",
  bad: "bg-red",
};

const TEXT: Record<StatusTone, string> = {
  neutral: "text-soft",
  pending: "text-soft",
  good: "text-soft",
  warn: "text-soft",
  bad: "text-red",
};

/**
 * "this iPhone" when it is one.
 *
 * Naming the object the writing is sitting inside is the difference between a
 * status you trust and one you have to interpret. Resolved after mount: the
 * server has no idea what it is rendering for, and a hydration mismatch over a
 * noun is not worth it.
 */
export function useDeviceName(): string {
  const [device, setDevice] = useState(DEFAULT_DEVICE);

  useEffect(() => {
    const ua = navigator.userAgent;
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (iPad) setDevice("this iPad");
    else if (/iPhone|iPod/.test(ua)) setDevice("this iPhone");
    else if (/Android/.test(ua)) setDevice("this phone");
  }, []);

  return device;
}

export function StatusLine({
  tone,
  children,
  className,
  role,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <span
      role={role ?? (tone === "bad" ? "alert" : "status")}
      className={cn("inline-flex items-center gap-1.5 text-sm", TEXT[tone], className)}
    >
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", DOT[tone])} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/**
 * Draft or Live — the public half, and only ever these two words.
 *
 * Deliberately not a button. Publishing is a decision with a confirmation and
 * a quality gate behind it; a badge you can fat-thumb into changing the public
 * site is the opposite of that.
 */
export function PublishBadge({
  label,
  className,
}: {
  label: PublishLabel;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-2xs font-bold uppercase tracking-wide",
        label === "Live" ? "bg-pen-soft text-pen" : "bg-n-200 text-soft",
        className
      )}
    >
      {label}
    </span>
  );
}
