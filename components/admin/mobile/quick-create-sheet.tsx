"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileSheet } from "../mobile-sheet";
import { StatusLine, useDeviceName } from "./status-line";
import { useSyncState } from "../studio-runtime";
import { handOffSave } from "@/lib/studio-local/save";
import { subscribeSyncEvents } from "@/lib/studio-local/sync";
import { uid } from "@/lib/utils";

/**
 * What the ✛ in the middle of the tab bar opens.
 *
 * The studio's fastest path used to be a card on the dashboard called Quick
 * Draft — which meant catching a thought required being on the right screen
 * first. This is the same idea, reachable from anywhere, one tap away.
 *
 * Quick note is the default and lives inside the sheet rather than behind a
 * navigation, so the keyboard comes up on the same tap that opened it: sheet,
 * type, save. The other three are doors to editors that already exist; making
 * a second editor for them would be two places to fix every bug.
 */

const EXCERPT_LIMIT = 200;
/** Enough to recognise the note in a list, short enough to be a title. */
const DERIVED_TITLE_LIMIT = 60;

type Mode = "choose" | "note";

export function QuickCreateSheet({
  open,
  onClose,
  startWith = "choose",
}: {
  open: boolean;
  onClose: () => void;
  /** Home's "＋ Note" tile skips the menu it already answered. */
  startWith?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(startWith);

  useEffect(() => {
    if (open) setMode(startWith);
  }, [open, startWith]);

  if (mode === "note") {
    return (
      <QuickNote
        open={open}
        onClose={onClose}
        onBack={startWith === "note" ? null : () => setMode("choose")}
      />
    );
  }

  return (
    <MobileSheet open={open} onClose={onClose} title="Add something">
      <ul className="space-y-1.5">
        <Choice
          label="Quick note"
          detail="Catch a thought — title optional"
          glyph="✎"
          onSelect={() => setMode("note")}
        />
        <Choice label="Project" detail="A new case study" glyph="▣" href="/admin/projects/new" />
        <Choice label="Journal entry" detail="A full post" glyph="✑" href="/admin/journal/new" />
        <Choice label="Photo or file" detail="Straight to the library" glyph="◉" href="/admin/media" />
      </ul>
    </MobileSheet>
  );
}

function Choice({
  label,
  detail,
  glyph,
  href,
  onSelect,
}: {
  label: string;
  detail: string;
  glyph: string;
  href?: string;
  onSelect?: () => void;
}) {
  const router = useRouter();
  return (
    <li>
      <button
        type="button"
        onClick={() => (href ? router.push(href) : onSelect?.())}
        className="flex min-h-[60px] w-full items-center gap-3.5 rounded-md border border-line bg-raise px-3.5 text-left transition-colors hover:border-pen"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-hl-soft text-lg text-ink"
        >
          {glyph}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">{label}</span>
          <span className="mt-0.5 block truncate text-xs text-faint">{detail}</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Capture, then tidy up later.
 *
 * The server needs a title and the person having the idea does not. So the
 * first line of the note becomes one, and it is shown while you type rather
 * than applied behind your back — a note called "Untitled" is a note you have
 * to open to identify.
 */
function QuickNote({
  open,
  onClose,
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  /** Null when this sheet opened straight into the note — nothing to go back to. */
  onBack: (() => void) | null;
}) {
  const router = useRouter();
  const device = useDeviceName();
  const sync = useSyncState();
  const body = useRef<HTMLTextAreaElement>(null);

  const [note, setNote] = useState("");
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState<{ id: string | null; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const localId = useRef(`journal:quick-${uid()}`);

  useEffect(() => {
    if (!open) return;
    // The keyboard should already be up by the time the sheet has settled.
    const timer = setTimeout(() => body.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [open]);

  // A note saved with no signal becomes a real entry later; when it does, the
  // "keep writing" link needs somewhere to point.
  useEffect(
    () =>
      subscribeSyncEvents((event) => {
        if (event.type !== "applied" || event.save.localId !== localId.current) return;
        setSaved((current) => (current ? { ...current, id: event.save.id } : current));
      }),
    []
  );

  const derived = note.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
  const effectiveTitle =
    title.trim() ||
    (derived.length > DERIVED_TITLE_LIMIT
      ? `${derived.slice(0, DERIVED_TITLE_LIMIT).trimEnd()}…`
      : derived);

  async function save() {
    if (!effectiveTitle) {
      setError("Write something first — the first line becomes the title.");
      return;
    }
    setBusy(true);
    setError(null);

    const paragraphs = note.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const blocks = paragraphs.map((text, index) => ({
      id: `qn-${index}`,
      type: "paragraph" as const,
      position: index,
      data: { text },
    }));
    const first = paragraphs[0] ?? "";
    const excerpt =
      first.length > EXCERPT_LIMIT ? `${first.slice(0, EXCERPT_LIMIT).trimEnd()}…` : first;

    const result = await handOffSave({
      entity: "journal",
      entityId: null,
      localId: localId.current,
      baseUpdatedAt: null,
      intent: "SYNC_DRAFT",
      payload: {
        fields: { title: effectiveTitle, status: "draft", excerpt },
        blocks,
        tagIds: [],
      },
    });
    setBusy(false);

    if (result.status === "rejected") {
      setError(result.message);
      return;
    }
    // Either it is in the queue or the site already has it. Both mean the
    // thought is out of your head and safe; only one of them means it is on
    // the server, and the line below says which.
    setSaved({
      id: result.status === "saved" ? result.id : null,
      title: effectiveTitle,
    });
    setNote("");
    setTitle("");
    localId.current = `journal:quick-${uid()}`;
    if (result.status === "saved") router.refresh();
  }

  if (saved) {
    return (
      <MobileSheet open={open} onClose={onClose} title="Saved">
        <div className="space-y-4">
          <StatusLine tone={sync.reachable ? "good" : "pending"}>
            {sync.reachable ? `Draft · Saved on ${device}` : `Draft · Waiting for connection`}
          </StatusLine>
          <p className="text-sm text-soft">
            “{saved.title}” is a draft. It is not on the public site
            {sync.reachable ? "." : ", and it sends itself when you're back."}
          </p>
          <div className="grid gap-2">
            {saved.id && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  router.push(`/admin/journal/${saved.id}`);
                }}
                className="min-h-12 rounded-md bg-hl text-sm font-semibold text-hl-ink"
              >
                Keep writing
              </button>
            )}
            <button
              type="button"
              onClick={() => setSaved(null)}
              className="min-h-12 rounded-md border border-line-strong bg-surface text-sm font-semibold text-ink"
            >
              Write another
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 rounded-md text-sm font-semibold text-soft"
            >
              Done
            </button>
          </div>
        </div>
      </MobileSheet>
    );
  }

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title="Quick note"
      actions={
        <div className={onBack ? "grid grid-cols-[auto_1fr] gap-2" : "grid"}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="min-h-12 rounded-md border border-line-strong bg-surface px-4 text-sm font-semibold text-soft"
            >
              Back
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={busy || !effectiveTitle}
            className="min-h-12 rounded-md bg-hl px-4 text-sm font-semibold text-hl-ink disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save draft"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <textarea
          ref={body}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What's on your mind?"
          rows={7}
          // text-base: anything smaller and Safari zooms the page on focus.
          className="w-full resize-none rounded-md border border-line bg-raise p-3.5 text-base leading-relaxed text-ink outline-none transition-colors focus:border-pen"
        />

        <label className="block">
          <span className="mb-1.5 block font-mono text-2xs uppercase tracking-widest text-faint">
            Title — optional
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={derived ? `${effectiveTitle}` : "Taken from the first line"}
            className="min-h-12 w-full rounded-md border border-line bg-raise px-3.5 text-base text-ink outline-none transition-colors focus:border-pen"
          />
        </label>

        <p className="text-xs text-faint">
          Saves as a draft. Nothing goes on the public site until you publish it.
        </p>

        {error && (
          <p role="alert" className="rounded border border-red bg-red-soft px-3 py-2 text-sm text-red">
            {error}
          </p>
        )}
      </div>
    </MobileSheet>
  );
}
