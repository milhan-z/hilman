"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MobileSheet } from "../mobile-sheet";
import { createPublicClient } from "@/lib/supabase/public";
import { mediaSrc } from "@/lib/cloudinary";
import { stashMedia } from "@/lib/studio-local/media";
import { flushOutbox } from "../studio-runtime";
import { cn } from "@/lib/utils";
import type { MediaRow } from "@/lib/types";

/**
 * Getting a picture into a block, from a phone.
 *
 * The old route was a centred desktop modal that read the entire media table
 * on open, listed every asset as a clickable `<div>`, and identified each one
 * by its Cloudinary `public_id` — a storage detail that has no business being
 * in the sentence "add a photo".
 *
 * This is the same library, asked a smaller question. The camera and the photo
 * roll come first, because the picture usually does not exist yet. Underneath
 * them are the most recent things already in the library, which is nearly
 * always what "choose an existing one" means. The full library is one more tap
 * away and pages in rather than arriving all at once.
 *
 * Nothing here waits for Cloudinary. A chosen file is written to this device
 * and handed back as a `pending:` reference immediately; the upload is the
 * outbox's problem, exactly as it already is everywhere else in the studio.
 */

/** Enough to fill a phone screen twice without asking for the whole table. */
const PAGE_SIZE = 24;

export interface MediaPickerSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called with one or more refs — a `pending:` placeholder or a public_id. */
  onPick: (picks: { ref: string; alt?: string }[]) => void;
  /** Gallery picking takes several at once and shows a running count. */
  multiple?: boolean;
  title?: string;
}

export function MediaPickerSheet({
  open,
  onClose,
  onPick,
  multiple = false,
  title = multiple ? "Add photos" : "Add a photo",
}: MediaPickerSheetProps) {
  const [rows, setRows] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MediaRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (from: number, term: string) => {
      setLoading(true);
      setError(null);
      const sb = createPublicClient();

      // Only the columns a thumbnail and a caption need. The old modal used
      // `select("*")` with no range at all, which on a phone meant waiting for
      // every asset ever uploaded before the first one could be seen.
      let query = sb
        .from("media")
        .select("id, public_id, kind, alt, title, folder, created_at")
        // This sheet adds photographs. A PDF rendered as a grey "File" tile is
        // not something anyone is trying to put in an image block, and it used
        // to take up a slot in the grid.
        .eq("kind", "image")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (term.trim()) {
        const needle = `%${term.trim()}%`;
        query = query.or(`public_id.ilike.${needle},alt.ilike.${needle},title.ilike.${needle}`);
      }

      const { data, error: queryError } = await query;
      setLoading(false);

      if (queryError) {
        setError("The library could not be read just now.");
        return;
      }
      const page = (data ?? []) as MediaRow[];
      setExhausted(page.length < PAGE_SIZE);
      setRows((current) => (from === 0 ? page : [...current, ...page]));
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    setRows([]);
    setSelected([]);
    setExhausted(false);
    void load(0, search);
    // Re-runs when the search term settles, below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Searching is a new first page, after a pause — not a request per keystroke.
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setRows([]);
      setExhausted(false);
      void load(0, search);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  /**
   * Files straight off the device: kept here first, uploaded afterwards.
   *
   * One file failing does not abandon the rest, and it does not pretend the
   * rest is all there was. Choosing six photos and silently getting five is
   * the kind of quiet loss that is only noticed weeks later.
   */
  async function keepFiles(files: FileList | null) {
    const chosen = Array.from(files ?? []);
    if (chosen.length === 0) return;

    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: chosen.length });

    const refs: { ref: string }[] = [];
    const failures: string[] = [];

    for (const [index, file] of chosen.entries()) {
      setProgress({ done: index, total: chosen.length });
      const result = await stashMedia(file);
      if (result.ok) refs.push({ ref: result.ref });
      else failures.push(result.reason);
      if (!multiple) break;
    }

    setBusy(false);
    setProgress(null);

    if (refs.length === 0) {
      setError(failures[0] ?? "None of those could be kept.");
      return;
    }

    if (failures.length > 0) {
      // Something was kept and something was not. Say both, and stay open so
      // the missing one can be tried again.
      setError(
        `${refs.length} ${refs.length === 1 ? "photo" : "photos"} added. ` +
          `${failures.length} couldn't be kept — ${failures[0]}`
      );
      onPick(refs);
      void flushOutbox();
      return;
    }

    onPick(refs);
    // If there is a signal this finishes within the second, and the
    // placeholder is replaced before you have scrolled away from it.
    void flushOutbox();
    onClose();
  }

  function toggle(row: MediaRow) {
    if (!multiple) {
      onPick([{ ref: row.public_id, alt: row.alt ?? undefined }]);
      onClose();
      return;
    }
    setSelected((current) =>
      current.some((item) => item.id === row.id)
        ? current.filter((item) => item.id !== row.id)
        : [...current, row]
    );
  }

  const tile =
    "flex min-h-14 flex-1 items-center justify-center gap-2 rounded-md border text-sm font-semibold transition-colors disabled:opacity-50";

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title={title}
      size="wide"
      actions={
        multiple ? (
          <div className="grid grid-cols-[1fr_auto] items-center gap-3">
            <p className="text-sm text-soft">
              {selected.length === 0
                ? "Tap photos to choose them"
                : `${selected.length} chosen`}
            </p>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => {
                onPick(selected.map((row) => ({ ref: row.public_id, alt: row.alt ?? undefined })));
                onClose();
              }}
              className="min-h-12 rounded-md bg-hl px-5 text-sm font-semibold text-hl-ink disabled:opacity-50"
            >
              Add {selected.length || ""}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraInput.current?.click()}
            className={cn(tile, "border-hl bg-hl-soft text-ink")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {busy ? "Keeping…" : "Camera"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => libraryInput.current?.click()}
            className={cn(tile, "border-line-strong bg-raise text-soft")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Photos
          </button>
        </div>

        {/* `capture` is what makes iOS open the camera rather than the picker.
            It is only a hint — a desktop browser ignores it and shows files,
            which is the right thing to happen there. The second input has no
            `capture` on purpose: that is the photo roll, not the camera. */}
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => {
            void keepFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          multiple={multiple}
          className="sr-only"
          onChange={(event) => {
            void keepFiles(event.target.files);
            event.target.value = "";
          }}
        />

        {progress && (
          <p role="status" className="rounded border border-hl/50 bg-hl-soft/20 px-3 py-2 text-sm text-soft">
            Keeping photos… {progress.done + 1} of {progress.total}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded border border-red/40 bg-red-soft/20 px-3 py-2 text-sm text-red">
            {error}
          </p>
        )}

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-mono text-2xs uppercase tracking-widest text-faint">
              Already in the library
            </h3>
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search photos"
            className="mb-3 min-h-12 w-full rounded-md border border-line bg-raise px-3.5 text-base text-ink outline-none transition-colors focus:border-pen"
          />

          {rows.length === 0 && !loading ? (
            <p className="rounded-md border border-dashed border-line-strong p-6 text-center text-sm text-faint">
              {search ? "Nothing matches that." : "Nothing in the library yet."}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {rows.map((row) => {
                const order = selected.findIndex((item) => item.id === row.id);
                const isSelected = order !== -1;
                const src = row.kind === "image" ? mediaSrc(row.public_id, { width: 240 }) : null;
                // The name people gave it, not the path the CDN stores it at.
                const label = row.title || row.alt || "Untitled photo";

                return (
                  <li key={row.id}>
                    {/* A real button, not a clickable div: this is the one
                        control on the screen a screen reader has to be able to
                        find, and the old modal did not give it a name at all. */}
                    <button
                      type="button"
                      onClick={() => toggle(row)}
                      aria-pressed={multiple ? isSelected : undefined}
                      aria-label={multiple && isSelected ? `${label} — chosen ${order + 1}` : label}
                      className={cn(
                        "relative block aspect-square w-full overflow-hidden rounded-md border transition-colors",
                        isSelected ? "border-hl ring-2 ring-hl" : "border-line hover:border-pen"
                      )}
                    >
                      {src ? (
                        // A CDN thumbnail at a fixed width; next/image would
                        // add a second resizing layer in front of a URL that is
                        // already exactly the size asked for.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs text-faint">
                          File
                        </span>
                      )}
                      {isSelected && (
                        // The position, not a tick. In a gallery the order the
                        // photos were chosen is the order they will appear, and
                        // six identical checkmarks say nothing about that.
                        <span
                          aria-hidden
                          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-hl text-2xs font-bold text-hl-ink"
                        >
                          {multiple ? (
                            order + 1
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {loading && <p className="py-3 text-center text-sm text-soft">Loading…</p>}

          {!exhausted && !loading && rows.length > 0 && (
            <button
              type="button"
              onClick={() => void load(rows.length, search)}
              className="mt-3 min-h-12 w-full rounded-md border border-line text-sm font-semibold text-soft transition-colors hover:border-pen hover:text-pen"
            >
              Show more
            </button>
          )}
        </div>
      </div>
    </MobileSheet>
  );
}
