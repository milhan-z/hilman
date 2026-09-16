"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDrafts, type LocalDraft } from "@/lib/studio-local/drafts";
import { listSnapshots, type ServerSnapshot } from "@/lib/studio-local/snapshots";
import { listQueue, type QueuedMutation } from "@/lib/studio-local/outbox";

/**
 * What the studio can honestly show with no network.
 *
 * Deliberately static and public: the service worker serves this page from
 * Cache Storage, and a page that Cache Storage holds must not contain anyone's
 * content. So the shell ships empty and fills itself from IndexedDB in the
 * browser — the private half never leaves the device it was written on.
 *
 * It answers one question: is my work still here? Everything else can wait for
 * a signal.
 */

const relative = (iso: string) => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** A draft with no recorded title still deserves a readable name. */
function nameFromKey(key: string): string {
  const [entity, ...rest] = key.split(":");
  const id = rest.join(":");
  if (entity === "project") return id === "new" ? "New project" : "A project";
  if (entity === "journal") return id === "new" ? "New journal entry" : "A journal entry";
  return "Untitled draft";
}

export function OfflineShell() {
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [queue, setQueue] = useState<QueuedMutation[]>([]);
  const [recent, setRecent] = useState<ServerSnapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [back, setBack] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listDrafts(), listQueue(), listSnapshots()]).then(
      ([nextDrafts, nextQueue, nextRecent]) => {
        if (cancelled) return;
        setDrafts(nextDrafts.slice(0, 6));
        setQueue(nextQueue);
        setRecent(nextRecent.slice(0, 6));
        setLoaded(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // The studio is one reload away the moment anything answers.
  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch("/api/studio/sync", { method: "GET", cache: "no-store" });
        if (response.ok) setBack(true);
      } catch {
        setBack(false);
      }
    };
    void check();
    const timer = setInterval(check, 5000);
    window.addEventListener("online", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", check);
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]">
      <p className="font-hand text-xl text-faint">no signal</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink">
        The studio is offline
      </h1>
      <p className="mt-3 text-base text-soft">
        Nothing is lost. Everything below is on this phone, and it will send itself the moment
        there&apos;s a connection.
      </p>

      {back ? (
        <a
          href="/admin"
          className="mt-5 flex min-h-12 items-center justify-center rounded-md bg-hl px-4 text-sm font-semibold text-hl-ink shadow-card"
        >
          Back online — reopen the studio
        </a>
      ) : (
        <Link
          href="/admin"
          className="mt-5 flex min-h-12 items-center justify-center rounded-md border border-line-strong px-4 text-sm font-semibold text-soft"
        >
          Try again
        </Link>
      )}

      {loaded && (
        <div className="mt-8 space-y-7">
          <Section
            heading="Waiting to send"
            empty="Nothing is queued."
            items={queue.map((mutation) => ({
              key: mutation.mutationId,
              title: String(mutation.payload.fields.title ?? "").trim() || "Untitled",
              note: `${mutation.entity} · queued ${relative(mutation.queuedAt)}`,
              tone: mutation.blocked ? ("warn" as const) : ("normal" as const),
            }))}
          />

          <Section
            heading="Unsaved drafts on this phone"
            empty="No local drafts."
            items={drafts.map((draft) => ({
              key: draft.key,
              title: draft.label ?? nameFromKey(draft.key),
              note: `edited ${relative(draft.editedAt)}`,
              tone: "normal" as const,
            }))}
          />

          <Section
            heading="Last seen on the site"
            empty="Nothing has been loaded on this phone yet."
            items={recent.map((snapshot) => ({
              key: snapshot.key,
              title: snapshot.title,
              note: `${snapshot.status} · updated ${relative(snapshot.updatedAt)}`,
              tone: "normal" as const,
            }))}
          />
        </div>
      )}
    </div>
  );
}

function Section({
  heading,
  empty,
  items,
}: {
  heading: string;
  empty: string;
  items: { key: string; title: string; note: string; tone: "normal" | "warn" }[];
}) {
  return (
    <section>
      <h2 className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">{heading}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-soft">{empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {items.map((item) => (
            <li key={item.key} className="px-3.5 py-3">
              <p
                className={`truncate text-sm font-semibold ${item.tone === "warn" ? "text-red" : "text-ink"}`}
              >
                {item.title}
              </p>
              <p className="mt-0.5 text-xs text-faint">{item.note}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
