"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { StickyNote } from "../ui";

interface DeskData {
  stickies?: { color: "yellow" | "blue" | "red"; text: string }[];
  folders?: { label: string; href: string; count?: number }[];
  checklist?: { text: string; done: boolean }[];
  quick_links?: { label: string; href: string }[];
  now?: { listening?: string; drinking?: string };
}

/**
 * Hilman's Desk — sticky notes are draggable (session-only, like a real desk),
 * the checklist is toggleable, folders open work streams.
 */
export function DeskBoard({ data }: { data: DeskData }) {
  const reduced = useReducedMotion();
  const boardRef = useRef<HTMLDivElement>(null);
  const [checks, setChecks] = useState<boolean[]>(
    (data.checklist ?? []).map((c) => c.done)
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* sticky notes — draggable board */}
      <div
        ref={boardRef}
        className="dotgrid relative min-h-[300px] overflow-hidden rounded-lg border border-line bg-surface p-6 lg:col-span-2"
      >
        <p className="mb-4 font-hand text-lg text-faint">sticky notes — drag them around</p>
        <div className="flex flex-wrap gap-5">
          {(data.stickies ?? []).map((note, i) => (
            <motion.div
              key={i}
              drag={!reduced}
              dragConstraints={boardRef}
              dragMomentum={false}
              whileDrag={{ scale: 1.05, zIndex: 10 }}
              className={!reduced ? "cursor-grab active:cursor-grabbing" : undefined}
            >
              <StickyNote color={note.color} className="w-44">
                {note.text}
              </StickyNote>
            </motion.div>
          ))}
        </div>
      </div>

      {/* now playing / drinking */}
      <div className="flex flex-col gap-6">
        {data.now && (
          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <h3 className="text-xs font-medium uppercase tracking-wider text-faint">On the desk right now</h3>
            <ul className="mt-3 space-y-2 text-sm text-soft">
              {data.now.listening && (
                <li className="flex gap-2">
                  <span aria-hidden>♪</span>
                  <span>{data.now.listening}</span>
                </li>
              )}
              {data.now.drinking && (
                <li className="flex gap-2">
                  <span aria-hidden>☕</span>
                  <span>{data.now.drinking}</span>
                </li>
              )}
            </ul>
          </div>
        )}
        {data.quick_links && (
          <nav aria-label="Quick links" className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <h3 className="text-xs font-medium uppercase tracking-wider text-faint">Shortcuts</h3>
            <ul className="mt-3 space-y-1">
              {data.quick_links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded px-2 py-2 text-sm text-pen transition-colors hover:bg-pen-soft"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {/* folders */}
      <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
        {(data.folders ?? []).map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group relative rounded-lg border border-line bg-surface p-5 pt-7 shadow-card transition-all duration-base ease-out hover:-translate-y-1 hover:shadow-lift"
          >
            <span className="absolute left-4 top-0 rounded-b border border-t-0 border-line bg-n-100 px-2.5 py-0.5 text-2xs uppercase tracking-wider text-faint">
              folder
            </span>
            <p className="font-display text-lg font-semibold transition-colors group-hover:text-pen">{f.label}</p>
            {typeof f.count === "number" && (
              <p className="mt-1 text-sm text-faint">{f.count} item{f.count === 1 ? "" : "s"}</p>
            )}
          </Link>
        ))}
      </div>

      {/* checklist */}
      {data.checklist && data.checklist.length > 0 && (
        <div className="ruled rounded-lg border border-line bg-raise p-5 shadow-card">
          <h3 className="text-xs font-medium uppercase tracking-wider text-faint">This week</h3>
          <ul className="mt-3 space-y-1">
            {data.checklist.map((item, i) => (
              <li key={i}>
                <label className="flex min-h-[36px] cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={checks[i] ?? false}
                    onChange={() =>
                      setChecks((prev) => prev.map((v, j) => (j === i ? !v : v)))
                    }
                    className="h-4 w-4 accent-[var(--pen)]"
                  />
                  <span className={checks[i] ? "text-faint line-through" : "text-ink"}>
                    {item.text}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-hand text-base text-faint">ticking these does nothing. it still feels good.</p>
        </div>
      )}
    </div>
  );
}
