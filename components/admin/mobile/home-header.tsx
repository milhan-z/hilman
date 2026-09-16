"use client";

import { useEffect, useState } from "react";
import { useSyncState } from "../studio-runtime";
import { connectivityFrom } from "../connectivity-pill";
import { StatusLine, useDeviceName } from "./status-line";

/**
 * The first thing on the screen.
 *
 * Two facts, in the order you want them: whether everything you have written
 * is where you think it is, and what time of day it is for you. The old
 * dashboard opened with the word "Dashboard" and the subtitle "the desk behind
 * the desk", which is charming and tells you nothing.
 *
 * The greeting is resolved after mount. Rendering "Good evening" from a server
 * in another timezone is a small lie that arrives before any of the true ones.
 */

function greet(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeHeader({ name }: { name: string }) {
  const sync = useSyncState();
  const device = useDeviceName();
  const [greeting, setGreeting] = useState<string | null>(null);

  useEffect(() => setGreeting(greet(new Date().getHours())), []);

  const { kind, detail } = connectivityFrom(sync);
  const tone =
    kind === "attention" ? "bad" : kind === "synced" ? "good" : kind === "offline" ? "neutral" : "pending";

  const line =
    kind === "synced"
      ? "Everything is on the site"
      : kind === "offline"
        ? `Offline — your work is on ${device}`
        : detail;

  return (
    <header className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">
          {/* min-height keeps the line from jumping when the greeting lands. */}
          <span className="inline-block min-h-[1em]">{greeting ?? "Hello"}</span>, {name}
        </h1>
      </div>
      <p className="font-hand text-xl text-soft">what are we making?</p>
      <StatusLine tone={tone}>{line}</StatusLine>
    </header>
  );
}
