"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Reorder } from "framer-motion";
import { InsertZone } from "./insert-zone";
import { EditableBlock } from "./editable-block";
import { PropertyDrawer } from "./property-drawer";
import { MetaBar } from "./meta-bar";
import { BlockBuilder } from "./block-builder";
import { DEFAULT_DATA } from "./block-editors";
import { templatesFor } from "./block-templates";
import { ActionSheet, MoreButton, type ActionItem } from "./mobile/action-sheet";
import { AddBlockSheet } from "./mobile/add-block-sheet";
import { EditorActionBar } from "./mobile/editor-action-bar";
import { MetadataSheet, MetadataSummary } from "./mobile/metadata-sheet";
import { StatusLine, useDeviceName } from "./mobile/status-line";
import { useSyncState } from "./studio-runtime";
import { Pic } from "../cld-image";
import { STREAMS, type Stream } from "@/lib/types";
import { deleteJournal, deleteProject } from "@/app/admin/actions";
import { handOffSave } from "@/lib/studio-local/save";
import { subscribeSyncEvents } from "@/lib/studio-local/sync";
import { deleteDraft, readDraft, writeDraft } from "@/lib/studio-local/drafts";
import { hasPendingRefs, replacePendingRefs } from "@/lib/studio-media-refs";
import {
  blockingReason,
  docFromInitial,
  fieldsFor,
  parsedMeta,
  type EditorDoc,
} from "./editor-doc";
import { describeEditor, type EditorAction } from "@/lib/studio-editor-state";
import { describePosition, normalisePositions } from "@/lib/studio-gestures";
import { useMediaSelector } from "./media-library-context";
import { cn, slugify, uid } from "@/lib/utils";
import type { Block, BlockType, JournalPost, Project, TagRow } from "@/lib/types";

/**
 * The studio's editor.
 *
 * What changed, and why:
 *
 * The document is one object now rather than seventeen pieces of state, so
 * "has this changed?" is one string comparison and the metadata sheet takes
 * two props instead of forty.
 *
 * There are three snapshots, not one. What is on screen, what has been written
 * down on this device, and what the site actually has. Every confusing thing
 * about the old editor came from collapsing the last two into a single
 * "saved": a queued save looked identical to a published one, and editing a
 * live article made its status say Draft.
 *
 * Saving no longer waits for the network before it answers. The writing is
 * safe once it is in the outbox — an IndexedDB put — so that is when the bar
 * says so, and what the server decides arrives afterwards as a sync event.
 */

interface LiveEditorProps {
  kind: "project" | "journal";
  initial: (Project & JournalPost) | null;
  allTags: TagRow[];
}

/** How long a publish may sit unanswered before we stop calling it in flight. */
const PUBLISH_PATIENCE_MS = 12_000;
/** How long typing has to pause before the local copy is written down. */
const PERSIST_DEBOUNCE_MS = 400;

/**
 * Which block types can be filled in where they stand.
 *
 * These have an inline editor in <EditableBlock>, so inserting one and then
 * opening a settings panel on top of it would cover the very field that was
 * just given focus. Everything else has nowhere to type without the panel.
 */
const EDITS_INLINE: BlockType[] = ["paragraph", "heading", "quote", "button", "divider"];

/**
 * Moves an unsaved draft from "project:new" to "project:<id>".
 *
 * Creating something changes the key its local draft is filed under, and the
 * route replaces itself the moment the server answers. Anything typed during
 * that round trip is filed under the old key; without this it would sit there
 * as an orphan, invisible to the editor it belongs to and offered instead to
 * the *next* new project someone starts.
 */
async function carryDraftOver(from: string, to: string) {
  if (from === to) return;
  const stored = await readDraft<{ snapshot: string; savedAt: string }>(from);
  if (stored) await writeDraft({ ...stored, key: to, localId: to });
  await deleteDraft(from);
}

export function LiveEditor({ kind, initial, allTags }: LiveEditorProps) {
  const isProject = kind === "project";
  const isNew = !initial;
  const router = useRouter();
  const device = useDeviceName();
  const sync = useSyncState();
  const { openSelector, openMultiSelector } = useMediaSelector();

  /* ── the document ── */
  const [doc, setDoc] = useState<EditorDoc>(() => docFromInitial(initial));
  const patch = useCallback(
    (next: Partial<EditorDoc>) => setDoc((prev) => ({ ...prev, ...next })),
    []
  );
  const snapshot = useMemo(() => JSON.stringify(doc), [doc]);

  /* ── identity, stable across the save that creates the row ── */
  const [entityId, setEntityId] = useState<string | null>(initial?.id ?? null);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string | null>(initial?.updated_at ?? null);
  const [localId] = useState(() => `${kind}:${initial?.id ?? `new-${uid()}`}`);
  const draftKey = `${kind}:${initial?.id ?? "new"}`;

  /* ── the three snapshots ──
     `kept` is what has been written down on this device. `synced` is what the
     public site has. The gap between them is the entire point. */
  const [kept, setKept] = useState(snapshot);
  const [synced, setSynced] = useState(snapshot);
  const dirty = snapshot !== kept;
  const savedLocally = kept !== synced;

  /* ── what the site currently serves ── */
  const [published, setPublished] = useState(initial?.status === "published");

  /* ── transport ── */
  const [inFlight, setInFlight] = useState<"none" | "saving" | "publishing">("none");
  const [queued, setQueued] = useState(false);
  const [publishQueued, setPublishQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const submitted = useRef<{ snapshot: string; published: boolean } | null>(null);
  const lastAction = useRef<EditorAction | null>(null);

  /* ── editor chrome ── */
  const [isVisual, setIsVisual] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addBlockAt, setAddBlockAt] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recovered, setRecovered] = useState<{ snapshot: string; savedAt: string } | null>(null);

  /* ── dragging a block ──
     Motion reorders its own list many times a second while a finger is moving.
     Feeding each of those straight into the document meant re-serialising the
     whole thing, re-running the dirty comparison and re-arming the draft write
     on every frame of a gesture — for an order that is not final and might be
     dragged back where it came from.

     So the drag has its own copy. `preview` is what Motion rearranges and what
     is on screen; the document hears about it once, when the block is put
     down. Everything downstream — dirty state, the local draft, the save bar —
     is unchanged, and still only sees a finished edit. */
  const [preview, setPreview] = useState<Block[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const blocks = preview ?? doc.blocks;

  const blocked = blockingReason(doc);
  const waitingOnPhoto = hasPendingRefs(doc);

  const status = describeEditor(
    {
      isNew: entityId === null,
      published,
      dirty,
      savedLocally,
      inFlight,
      queued,
      publishQueued,
      reachable: sync.reachable,
      syncing: sync.syncing,
      error,
      conflict,
      waitingOnPhoto,
    },
    device
  );

  /* ── keeping the local copy current ──
     Anything the site does not have is written down after a pause in typing.
     This is the safety net under "you can just leave": there is no
     beforeunload prompt any more, because there is nothing to lose. */
  useEffect(() => {
    if (snapshot === synced) {
      void deleteDraft(draftKey);
      return;
    }
    const timer = setTimeout(() => {
      void writeDraft({
        key: draftKey,
        entity: kind,
        entityId: initial?.id ?? null,
        localId: draftKey,
        value: { snapshot, savedAt: new Date().toISOString() },
        baseUpdatedAt: initial?.updated_at ?? null,
        editedAt: new Date().toISOString(),
        label: doc.title.trim() || `Untitled ${kind}`,
      });
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [snapshot, synced, draftKey, kind, initial?.id, initial?.updated_at, doc.title]);

  /* ── a draft left here last time is offered, never applied ── */
  useEffect(() => {
    let cancelled = false;
    void readDraft<{ snapshot: string; savedAt: string }>(draftKey).then((stored) => {
      if (cancelled || !stored?.value?.snapshot) return;
      if (stored.value.snapshot === snapshot) {
        void deleteDraft(draftKey);
        return;
      }
      setRecovered(stored.value);
    });
    return () => {
      cancelled = true;
    };
    // Once, on open. Comparing against live state would re-offer it on every
    // keystroke that happened to differ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  /* ── what the server decided, whenever it gets round to deciding ──
     A save made with no signal finishes later, in the background. When it
     does, this editor has to learn the id the row was given and the version it
     now sits at — otherwise the next save would look like an edit to something
     that does not exist.

     The same applies to a photo: once its bytes reach Cloudinary the block
     holding the `pending:` placeholder has to be pointed at the real id. */
  useEffect(
    () =>
      subscribeSyncEvents((event) => {
        if (event.type === "media") {
          setDoc((prev) => replacePendingRefs(prev, event.resolved));
          // The queued save and the stored draft were rewritten with the real
          // ids too, so the snapshots we compare against have to move with
          // them — otherwise the editor would report its own finished upload
          // as an unsaved edit. replacePendingRefs walks strings, so it
          // reaches inside a serialised snapshot unaided.
          setKept((prev) => replacePendingRefs(prev, event.resolved));
          setSynced((prev) => replacePendingRefs(prev, event.resolved));
          return;
        }
        if (event.type === "applied") {
          if (event.save.localId !== localId) return;
          setEntityId(event.save.id);
          setBaseUpdatedAt(event.save.updatedAt);
          setQueued(false);
          setPublishQueued(false);
          setInFlight("none");
          setError(null);
          if (submitted.current) {
            // Only `synced` moves. `kept` was set to this same snapshot when
            // the save was handed over, and if anything has been written down
            // since then it is newer than what the server just took.
            setSynced(submitted.current.snapshot);
            setPublished(submitted.current.published);
          }
          if (isNew) {
            const next = `${kind}:${event.save.id}`;
            void carryDraftOver(draftKey, next).then(() => {
              router.replace(`/admin/${isProject ? "projects" : "journal"}/${event.save.id}`);
            });
          }
          return;
        }
        if (event.type === "conflict" && event.localId === localId) {
          setInFlight("none");
          setQueued(false);
          setPublishQueued(false);
          setConflict(true);
          return;
        }
        if (event.type === "blocked" && event.localId === localId) {
          setInFlight("none");
          setQueued(false);
          setPublishQueued(false);
          setError(event.message);
        }
      }),
    [localId, isNew, isProject, kind, draftKey, router]
  );

  /* ── a publish that nobody answered ──
     "Publishing…" is only honest while something might still come back. After
     that the truthful thing to say is that it is queued — and, emphatically,
     not that it is live. */
  // A conflict resolved elsewhere — in the sync panel — is no longer this
  // editor's problem, and the bar should stop saying it is.
  useEffect(() => {
    if (sync.conflicts === 0) setConflict(false);
  }, [sync.conflicts]);

  useEffect(() => {
    if (inFlight !== "publishing") return;
    if (!sync.reachable) {
      setInFlight("none");
      setPublishQueued(true);
      return;
    }
    const timer = setTimeout(() => {
      setInFlight("none");
      setPublishQueued(true);
    }, PUBLISH_PATIENCE_MS);
    return () => clearTimeout(timer);
  }, [inFlight, sync.reachable]);

  /* ── saving ── */

  const sendToSite = useCallback(
    async (nextStatus: "published" | "draft") => {
      if (blockingReason(doc)) return;

      setError(null);
      setConflict(false);
      setPublishQueued(false);
      setInFlight(nextStatus === "published" ? "publishing" : "saving");
      submitted.current = { snapshot, published: nextStatus === "published" };

      const result = await handOffSave({
        entity: kind,
        entityId,
        localId,
        baseUpdatedAt,
        intent:
          nextStatus === "draft" ? "SYNC_DRAFT" : published ? "UPDATE_LIVE" : "PUBLISH",
        payload: {
          fields: fieldsFor(kind, doc, nextStatus),
          blocks: doc.blocks,
          tagIds: doc.tagIds,
        },
      });

      // Whatever happens next, this version is written down somewhere.
      setKept(snapshot);

      if (result.status === "stored") {
        setQueued(true);
        // A draft is safe the moment it is in the queue, so say so now. A
        // publish is not: it is only live once the site has accepted it.
        if (nextStatus === "draft") setInFlight("none");
        return;
      }
      if (result.status === "saved") {
        setEntityId(result.id);
        setBaseUpdatedAt(result.updatedAt);
        setSynced(snapshot);
        setPublished(nextStatus === "published");
        setInFlight("none");
        setQueued(false);
        if (isNew) {
          const next = `${kind}:${result.id}`;
          void carryDraftOver(draftKey, next).then(() => {
            router.replace(`/admin/${isProject ? "projects" : "journal"}/${result.id}`);
          });
        }
        return;
      }
      setInFlight("none");
      setQueued(false);
      if (result.status === "conflict") setConflict(true);
      else setError(result.message);
    },
    [doc, snapshot, kind, entityId, localId, baseUpdatedAt, published, isNew, isProject, draftKey, router]
  );

  /**
   * Keep the edits here, and leave the site alone.
   *
   * There is one row per project, so there is no server-side draft of a
   * published article to save into — writing these changes to the database
   * *is* updating the live page. So "Save changes" means exactly what it says
   * and no more: the version is written down on this device, the public still
   * gets the published one, and the bar keeps saying so until you update live.
   */
  const keepHere = useCallback(async () => {
    const stored = await writeDraft({
      key: draftKey,
      entity: kind,
      entityId: initial?.id ?? null,
      localId: draftKey,
      value: { snapshot, savedAt: new Date().toISOString() },
      baseUpdatedAt: initial?.updated_at ?? null,
      editedAt: new Date().toISOString(),
      label: doc.title.trim() || `Untitled ${kind}`,
    });

    if (!stored) {
      setError("This browser isn't letting Studio keep a copy here.");
      return;
    }
    setError(null);
    setKept(snapshot);
  }, [draftKey, kind, initial?.id, initial?.updated_at, snapshot, doc.title]);

  const runAction = useCallback(
    (action: EditorAction) => {
      if (action.id !== "retry") lastAction.current = action;
      switch (action.id) {
        case "save-draft":
          void sendToSite("draft");
          return;
        case "publish":
        case "update-live":
          void sendToSite("published");
          return;
        case "save-changes":
          void keepHere();
          return;
        case "review":
          window.dispatchEvent(new Event("hilman:sync"));
          return;
        case "retry": {
          setError(null);
          const previous = lastAction.current;
          void sendToSite(previous?.id === "save-draft" ? "draft" : "published");
        }
      }
    },
    [sendToSite, keepHere]
  );

  /* ── blocks ── */

  /** Puts a block into the list and returns it, without deciding what happens next. */
  const addBlock = useCallback(
    (type: BlockType, index: number, data?: Record<string, unknown>) => {
      const block: Block = {
        id: `new-${uid()}`,
        type,
        position: index,
        data: data ? { ...structuredClone(DEFAULT_DATA[type]), ...data } : structuredClone(DEFAULT_DATA[type]),
      };
      setDoc((prev) => {
        const next = [...prev.blocks];
        next.splice(Math.min(index, next.length), 0, block);
        return { ...prev, blocks: normalisePositions(next) };
      });
      setActiveBlockId(block.id);
      return block;
    },
    []
  );

  const insertBlock = (type: BlockType, index: number) => {
    // A photo is the thing you are adding; an empty image block is not. Asking
    // for the picture first means "＋ Add → Photo → Camera" ends with the photo
    // on screen, rather than with a placeholder and a settings panel.
    if (type === "image") {
      openSelector(
        (ref, alt) => {
          addBlock("image", index, { public_id: ref, alt: alt ?? "" });
        },
        { title: "Add a photo" }
      );
      return;
    }

    if (type === "gallery") {
      openMultiSelector((picks) => {
        addBlock("gallery", index, {
          items: picks.map((pick) => ({ public_id: pick.ref, alt: pick.alt ?? "", caption: "" })),
        });
      }, "Add photos");
      return;
    }

    addBlock(type, index);

    // Anything with an inline editor is already focused and ready to type in.
    if (!EDITS_INLINE.includes(type)) setDrawerOpen(true);
  };

  const updateBlock = (id: string, data: Record<string, any>) =>
    patch({ blocks: doc.blocks.map((b) => (b.id === id ? { ...b, data } : b)) });

  const convertBlock = (id: string, newType: BlockType) => {
    patch({
      blocks: doc.blocks.map((b) => {
        if (b.id !== id) return b;
        const carried = String(b.data?.text || b.data?.md || "").replace(/^\/$/, "").trim();
        const data = structuredClone(DEFAULT_DATA[newType]);
        if ("text" in data) data.text = carried;
        else if ("md" in data) data.md = carried;
        return { ...b, type: newType, data };
      }),
    });
    setActiveBlockId(id);
    if (!["paragraph", "divider", "heading", "quote", "button"].includes(newType)) {
      setDrawerOpen(true);
    }
  };

  const removeBlock = (id: string) => {
    const index = doc.blocks.findIndex((b) => b.id === id);
    const previous = index > 0 ? doc.blocks[index - 1] : null;
    patch({
      blocks: doc.blocks.filter((b) => b.id !== id).map((b, i) => ({ ...b, position: i })),
    });
    if (activeBlockId === id) {
      setActiveBlockId(previous ? previous.id : null);
      setDrawerOpen(false);
    }
  };

  /**
   * A block has been picked up.
   *
   * The preview list is seeded from the document so Motion has something of
   * its own to rearrange, and the announcement says what is happening — once,
   * not on every pixel of movement.
   */
  const beginReorder = (id: string) => {
    const index = doc.blocks.findIndex((b) => b.id === id);
    setPreview(doc.blocks);
    setAnnouncement(
      `Moving ${doc.blocks[index]?.type ?? "block"} block. ${describePosition(index, doc.blocks.length)}.`
    );
  };

  /**
   * ...and put down. This is the only moment the document hears about a drag.
   *
   * It goes through the same `patch()` as typing does, so the local draft, the
   * dirty state and the save bar all behave exactly as they do for any other
   * edit. Reordering never talks to the server: a live article whose blocks
   * have been rearranged is `Live · Unsaved changes` until Update live is
   * pressed, like every other change.
   */
  const commitReorder = () => {
    setPreview((current) => {
      if (!current) return null;

      const changed = current.some((block, index) => doc.blocks[index]?.id !== block.id);
      if (!changed) {
        setAnnouncement("Block returned to its place.");
        return null;
      }

      const ordered = normalisePositions(current);
      patch({ blocks: ordered });

      const moved = ordered.findIndex((block, index) => doc.blocks[index]?.id !== block.id);
      setAnnouncement(
        moved === -1
          ? "Blocks reordered."
          : `Block moved. ${describePosition(moved, ordered.length)}.`
      );
      return null;
    });
  };

  const moveBlock = (id: string, direction: -1 | 1) => {
    const i = doc.blocks.findIndex((b) => b.id === id);
    const j = i + direction;
    if (j < 0 || j >= doc.blocks.length) return;
    const next = [...doc.blocks];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ blocks: normalisePositions(next) });
    // The same sentence the drag produces: the two routes to the same result
    // should not sound like two different features.
    setAnnouncement(`Block moved. ${describePosition(j, next.length)}.`);
  };

  const duplicateBlock = (id: string) => {
    const index = doc.blocks.findIndex((b) => b.id === id);
    if (index === -1) return;
    const copy: Block = {
      id: `new-${uid()}`,
      type: doc.blocks[index].type,
      position: index + 1,
      data: structuredClone(doc.blocks[index].data ?? {}),
    };
    const next = [...doc.blocks];
    next.splice(index + 1, 0, copy);
    patch({ blocks: next.map((b, i) => ({ ...b, position: i })) });
    setActiveBlockId(copy.id);
  };

  const applyTemplate = (templateId: string) => {
    const template = templatesFor(kind).find((t) => t.id === templateId);
    if (!template) return;
    const built = template.build().map((b, i) => ({
      id: `new-${uid()}`,
      type: b.type,
      position: doc.blocks.length + i,
      data: structuredClone(b.data ?? {}),
    })) as Block[];
    patch({ blocks: [...doc.blocks, ...built].map((b, i) => ({ ...b, position: i })) });
  };

  const activeBlock = doc.blocks.find((b) => b.id === activeBlockId) ?? null;
  const meta = parsedMeta(doc) as Record<string, any>;
  // The address the server will have given it: slugify(slug) || slugify(title),
  // exactly as lib/studio-content.ts does, so the link is right for something
  // published a moment ago whose row we have not read back.
  const publicSlug = slugify(doc.slug) || slugify(doc.title);
  const publicHref = publicSlug ? `/${isProject ? "works" : "journal"}/${publicSlug}` : null;

  const menuItems: ActionItem[] = [
    { id: "details", label: "Details", detail: "Tags, address, images", onSelect: () => setDetailsOpen(true) },
    ...(published && publicHref
      ? [{ id: "view", label: "View live", href: publicHref, external: true } as ActionItem]
      : []),
    ...(entityId
      ? published
        ? [
            {
              id: "unpublish",
              label: "Move to draft",
              detail: "Takes it off the public site",
              onSelect: () => void sendToSite("draft"),
            } as ActionItem,
          ]
        : [
            {
              id: "publish",
              label: "Publish",
              detail: "Puts it on the public site",
              onSelect: () => void sendToSite("published"),
            } as ActionItem,
          ]
      : []),
    ...(entityId
      ? [
          {
            id: "delete",
            label: "Delete",
            tone: "danger" as const,
            confirm: `Delete “${doc.title || `this ${kind}`}” for good? This can't be undone.`,
            onSelect: () => {
              void (isProject ? deleteProject(entityId) : deleteJournal(entityId));
            },
          } as ActionItem,
        ]
      : []),
  ];

  return (
    // dvh, not vh: Safari's toolbar makes vh taller than the space you can
    // actually see, which would push the action bar off the bottom.
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col">
      {/* ── app bar ──
          Compact and persistent. The old header carried a mode switcher that
          was half its width and meaningless on a phone; that now appears from
          `sm` up, where there is room for it. */}
      <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="flex items-center gap-2">
          <Link
            href={isProject ? "/admin/projects" : "/admin/journal"}
            aria-label="Back"
            className="-ml-1.5 flex min-h-11 min-w-11 items-center justify-center rounded-md text-soft transition-colors hover:text-pen"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>

          <h1 className="min-w-0 flex-1 truncate font-display text-base font-bold">
            {doc.title.trim() || `New ${kind}`}
          </h1>

          {/* desktop-only: the visual/classic choice */}
          <div className="hidden items-center gap-1 rounded-full border border-line bg-raise p-1 text-xs sm:flex">
            {([true, false] as const).map((visual) => (
              <button
                key={String(visual)}
                type="button"
                onClick={() => setIsVisual(visual)}
                aria-pressed={isVisual === visual}
                className={cn(
                  "rounded-full px-3 py-1 font-semibold transition-colors",
                  isVisual === visual ? "bg-hl text-hl-ink" : "text-soft hover:text-ink"
                )}
              >
                {visual ? "Canvas" : "Form"}
              </button>
            ))}
          </div>

          <MoreButton onClick={() => setMenuOpen(true)} className="-mr-1.5" />
        </div>

        <div className="flex items-center justify-between gap-3 pb-0.5">
          <StatusLine tone={status.tone}>{status.statusLine}</StatusLine>
        </div>
      </header>

      {recovered && (
        <div className="mb-4 rounded-md border border-hl bg-hl-soft/25 p-3.5">
          <p className="text-sm font-semibold text-ink">
            There's a newer version of this {kind} saved on {device}.
          </p>
          <p className="mt-1 text-sm text-soft">
            It never reached the site. Restoring only refills the editor — you still choose what
            to do with it.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void deleteDraft(draftKey);
                setRecovered(null);
              }}
              className="min-h-12 rounded-md border border-line bg-surface text-sm font-semibold text-soft"
            >
              Discard it
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  const restored = JSON.parse(recovered.snapshot) as EditorDoc;
                  setDoc(restored);
                } catch {
                  /* nothing usable in the stored draft */
                }
                setRecovered(null);
              }}
              className="min-h-12 rounded-md bg-hl text-sm font-semibold text-hl-ink"
            >
              Restore it
            </button>
          </div>
        </div>
      )}

      <div className="flex-1">
        {/* Desktop keeps the full settings panel; the phone gets one line. */}
        <div className="hidden sm:block">
          <MetaBar kind={kind} doc={doc} patch={patch} allTags={allTags} published={published} />
        </div>
        <div className="mb-4 sm:hidden">
          <MetadataSummary kind={kind} doc={doc} published={published} onOpen={() => setDetailsOpen(true)} />
        </div>

        <div className="mb-8">
          {isVisual ? (
            <div className="rounded-lg border border-line bg-surface p-3 sm:p-8">
              <div className="mx-auto max-w-prose space-y-2">
                {isProject ? (
                  <div className="mb-8">
                    {doc.coverPublicId && !doc.coverPublicId.startsWith("pending:") && (
                      <div className="relative mb-5 h-[22vh] min-h-[140px] w-full overflow-hidden rounded-lg border border-line">
                        <Pic src={doc.coverPublicId} alt="Cover" fill className="object-cover" />
                      </div>
                    )}
                    <header className="rounded-xl border border-line bg-raise p-4 sm:p-8">
                      <div className="flex flex-wrap items-center gap-2 text-2xs text-faint">
                        <span className="font-semibold uppercase tracking-wider text-pen">
                          {STREAMS[doc.stream as Stream]?.name ?? doc.stream}
                        </span>
                        {doc.year && (
                          <>
                            <span>·</span>
                            <span>{doc.year}</span>
                          </>
                        )}
                      </div>

                      <InlineTextarea
                        value={doc.title}
                        onChange={(title) => patch({ title })}
                        placeholder="Project title"
                        className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
                      />
                      <InlineTextarea
                        value={doc.subtitle}
                        onChange={(subtitle) => patch({ subtitle })}
                        placeholder="One line about it"
                        className="mt-1.5 text-base text-soft"
                      />

                      <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-dashed border-line pt-4 sm:grid-cols-3">
                        <MetaPair
                          label="my role"
                          value={String(meta.role ?? "")}
                          placeholder="Art direction"
                          onChange={(role) => patch({ rawMeta: JSON.stringify({ ...meta, role }, null, 2) })}
                        />
                        <MetaPair
                          label="tools"
                          value={Array.isArray(meta.tools) ? meta.tools.join(", ") : String(meta.tools ?? "")}
                          placeholder="Figma, Riso"
                          onChange={(value) =>
                            patch({
                              rawMeta: JSON.stringify(
                                { ...meta, tools: value.split(",").map((t) => t.trim()).filter(Boolean) },
                                null,
                                2
                              ),
                            })
                          }
                        />
                        <MetaPair
                          label="for"
                          value={String(meta.client ?? "")}
                          placeholder="Client"
                          onChange={(client) => patch({ rawMeta: JSON.stringify({ ...meta, client }, null, 2) })}
                        />
                      </dl>
                    </header>
                  </div>
                ) : (
                  <header className="mb-6 border-b border-dashed border-line-strong pb-5">
                    <div className="flex flex-wrap items-center gap-2 text-2xs text-faint">
                      <span>{published ? "Live" : "Draft"}</span>
                      <span>·</span>
                      <span>{doc.readingMinutes} min read</span>
                    </div>
                    <InlineTextarea
                      value={doc.title}
                      onChange={(title) => patch({ title })}
                      placeholder="What are you writing about?"
                      className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl"
                    />
                    <InlineTextarea
                      value={doc.excerpt}
                      onChange={(excerpt) => patch({ excerpt })}
                      placeholder="A line to show on the card"
                      className="mt-2.5 text-base italic text-soft"
                    />
                  </header>
                )}

                <Reorder.Group
                  axis="y"
                  values={blocks}
                  onReorder={setPreview}
                  className="space-y-1"
                >
                  {blocks.map((block, index) => (
                    <div key={block.id}>
                      {/* The hover-only insert control is a pointer affordance;
                          the phone gets the full-width button below instead. */}
                      <div className="hidden sm:block">
                        <InsertZone onInsert={(type) => insertBlock(type, index)} />
                      </div>
                      <EditableBlock
                        block={block}
                        active={activeBlockId === block.id}
                        index={index}
                        total={blocks.length}
                        canMoveUp={index > 0}
                        canMoveDown={index < blocks.length - 1}
                        onActivate={() => setActiveBlockId(block.id)}
                        onChange={(data) => updateBlock(block.id, data)}
                        onOpenDrawer={() => setDrawerOpen(true)}
                        onRemove={() => removeBlock(block.id)}
                        onMove={(dir) => moveBlock(block.id, dir)}
                        onDuplicate={() => duplicateBlock(block.id)}
                        onInsertBelow={(type) => insertBlock(type, index + 1)}
                        onConvert={(type) => convertBlock(block.id, type)}
                        onDragStart={() => beginReorder(block.id)}
                        onDragEnd={commitReorder}
                        onAddBelow={() => setAddBlockAt(index + 1)}
                      />
                    </div>
                  ))}
                </Reorder.Group>

                {blocks.length === 0 && (
                  <div className="my-5 rounded-lg border border-dashed border-line-strong p-5 text-center">
                    <p className="text-sm text-soft">Nothing written yet.</p>
                    <div className="mt-4 grid gap-2 text-left">
                      {templatesFor(kind).map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => applyTemplate(template.id)}
                          className="min-h-12 rounded-md border border-line bg-raise p-3 text-left transition-colors hover:border-pen"
                        >
                          <span className="block text-sm font-semibold text-ink">{template.name}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                            {template.description}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-faint">
                      Templates only add prompts to replace — they never write claims for you.
                    </p>
                  </div>
                )}

                <div className="hidden sm:block">
                  <InsertZone onInsert={(type) => insertBlock(type, doc.blocks.length)} />
                </div>
                <button
                  type="button"
                  onClick={() => setAddBlockAt(doc.blocks.length)}
                  className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-sm font-semibold text-soft transition-colors hover:border-pen hover:text-pen sm:hidden"
                >
                  <span aria-hidden>+</span> Add block
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-soft">
                Content blocks
              </h2>
              <BlockBuilder value={doc.blocks} onChange={(blocks) => patch({ blocks })} />
            </div>
          )}
        </div>
      </div>

      {/* What just happened to a block, for anyone not watching it happen.
          Written only when the logical position changes — a pixel-by-pixel
          commentary during a drag would be unusable. */}
      <p aria-live="polite" role="status" className="sr-only">
        {announcement}
      </p>

      <EditorActionBar
        status={status}
        onAction={runAction}
        blockedReason={blocked}
        trailing={
          published && publicHref ? (
            <a
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
              className="-my-2 flex min-h-11 shrink-0 items-center font-mono text-2xs uppercase tracking-wide text-pen"
            >
              View live ↗
            </a>
          ) : null
        }
        idleActions={
          <p className="pb-1 text-xs text-faint">
            Everything here is on the site. Edit anything to get the save options back.
          </p>
        }
      />

      <ActionSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={doc.title.trim() || `New ${kind}`}
        subtitle={status.statusLine}
        items={menuItems}
      />

      <MetadataSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        kind={kind}
        doc={doc}
        patch={patch}
        allTags={allTags}
        published={published}
      />

      <AddBlockSheet
        open={addBlockAt !== null}
        onClose={() => setAddBlockAt(null)}
        onInsert={(type) => insertBlock(type, addBlockAt ?? doc.blocks.length)}
      />

      <PropertyDrawer
        open={drawerOpen}
        block={activeBlock}
        onChange={(data) => activeBlockId && updateBlock(activeBlockId, data)}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

/* ── small inline fields ───────────────────────────────── */

function InlineTextarea({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  className: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        "w-full resize-none border-0 border-b border-dashed border-transparent bg-transparent p-0 font-inherit outline-none transition-colors hover:border-line focus:border-pen",
        className
      )}
      placeholder={placeholder}
      rows={1}
      style={{ overflow: "hidden" }}
    />
  );
}

function MetaPair({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <dt className="font-hand text-sm text-faint">{label}</dt>
      <dd className="mt-0.5">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          // 16px floor: Safari zooms the whole page into any smaller field.
          className="min-h-11 w-full border-0 border-b border-dashed border-transparent bg-transparent p-0 text-base font-medium text-ink outline-none transition-colors hover:border-line focus:border-pen sm:min-h-0 sm:text-xs"
        />
      </dd>
    </div>
  );
}
