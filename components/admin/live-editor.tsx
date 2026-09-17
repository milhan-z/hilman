"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { readTimeLabel, readTimeMinutes } from "@/lib/read-time";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Reorder } from "framer-motion";
import { InlineAdd } from "./insert-zone";
import { EditableBlock } from "./editable-block";
import { PropertyDrawer } from "./property-drawer";
import { MetaBar } from "./meta-bar";
import { DEFAULT_DATA } from "./block-editors";
import { templatesFor } from "@/lib/block-templates";
import { ActionSheet, MoreButton, type ActionItem } from "./mobile/action-sheet";
import { AddBlockSheet } from "./mobile/add-block-sheet";
import { ImportContentSheet } from "./mobile/import-content-sheet";
import { StarterPromptsSheet } from "./mobile/starter-prompts-sheet";
import { useDragEdgeScroll } from "./mobile/use-drag-edge-scroll";
import { MobileEditorShell } from "./mobile/mobile-editor-shell";
import { EditorActionBar } from "./mobile/editor-action-bar";
import { MetadataSheet, MetadataSummary } from "./mobile/metadata-sheet";
import { StatusLine, useDeviceName } from "./mobile/status-line";
import { SyncStatusSheet } from "./mobile/sync-status-sheet";
import { useSyncState } from "./studio-runtime";
import { Pic } from "../cld-image";
import { STREAMS, type Stream } from "@/lib/types";
import { deleteJournal, deleteProject } from "@/app/admin/actions";
import { handOffSave } from "@/lib/studio-local/save";
import { intentFor } from "@/lib/studio-save-intent";
import { subscribeSyncEvents, type SyncState } from "@/lib/studio-local/sync";
import { deleteDraft, readDraft, writeDraft } from "@/lib/studio-local/drafts";
import { hasPendingRefs, replacePendingRefs } from "@/lib/studio-media-refs";
import { clearStarterMark, findStarterPrompts, stripStarterPrompts } from "@/lib/starter-prompts";
import {
  blockingReason,
  docFromInitial,
  fieldsFor,
  parsedMeta,
  type EditorDoc,
} from "./editor-doc";
import { describeEditor, type EditorAction, type FailureKind } from "@/lib/studio-editor-state";
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

/**
 * The queue's word for a refusal, in the status machine's vocabulary.
 *
 * "MALFORMED" is a payload this build should never have produced, so it is a
 * server error from the author's point of view: there is nothing in the
 * document for them to fix.
 */
function failureOf(reason: SyncState["lastFailure"]): FailureKind {
  if (reason === "CONTENT_BLOCKED") return "CONTENT_BLOCKED";
  if (reason === "AUTH_ERROR") return "AUTH_ERROR";
  return "SERVER_ERROR";
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
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [addBlockAt, setAddBlockAt] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recovered, setRecovered] = useState<{ snapshot: string; savedAt: string } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  /**
   * Whether the automatic recovery copy actually reached this device.
   *
   * writeDraft() returns false when the browser stored nothing — Safari's
   * private mode, site data switched off, a full quota. The explicit "Save
   * changes" path has always checked that; the background write did not, so
   * the editor could sit there implying your work was recoverable when it was
   * nowhere. It is a separate axis from the save/publish state: an edit can be
   * "Live · Unsaved changes" and still be safely recoverable, or not.
   */
  const [recovery, setRecovery] = useState<"idle" | "writing" | "safe" | "failed">("idle");

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
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const blocks = preview ?? doc.blocks;

  /* Motion does not scroll for you, so a drag that reaches the edge of the
     canvas scrolls the canvas. No insets: the header and the action bar are
     rows of the shell, outside the scroller entirely, so the canvas's own box
     already ends where the chrome begins. They were only ever compensating for
     chrome that overlapped the document. */
  const canvasRef = useRef<HTMLDivElement>(null);
  useDragEdgeScroll({ active: dragging, container: canvasRef });

  const blocked = blockingReason(doc);
  const waitingOnMedia = hasPendingRefs(doc);

  /* ── the starter prompts still waiting for an answer ──
     Run here rather than discovered from a rejection. The gate is pure and the
     document is right there, so the editor can say which paragraphs are still
     the template's questions *before* asking the site to take them — which
     turns a round trip that comes back "couldn't sync" into a sheet that
     points at the two paragraphs and offers to remove them. */
  const starterPrompts = useMemo(() => findStarterPrompts(doc.blocks), [doc.blocks]);
  const [promptsOpen, setPromptsOpen] = useState(false);

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
      // A refusal the editor can explain outranks the generic one it cannot.
      failure: error
        ? starterPrompts.length
          ? "CONTENT_BLOCKED"
          : failureOf(sync.lastFailure)
        : undefined,
      blockedPrompts: starterPrompts.length,
      conflict,
      waitingOnMedia,
      uploads: sync.uploads,
    },
    device
  );

  /* ── keeping the local copy current ──
     Anything the site does not have is written down after a pause in typing.
     This is the safety net under "you can just leave": there is no
     beforeunload prompt any more, because there is nothing to lose. */
  const persistRecovery = useCallback(async () => {
    setRecovery("writing");
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
    // The answer is used, not discarded. This is the whole point of the change.
    setRecovery(stored ? "safe" : "failed");
  }, [draftKey, kind, initial?.id, initial?.updated_at, snapshot, doc.title]);

  useEffect(() => {
    if (snapshot === synced) {
      void deleteDraft(draftKey);
      setRecovery("idle");
      return;
    }
    const timer = setTimeout(() => void persistRecovery(), PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [snapshot, synced, draftKey, persistRecovery]);

  /* ── the moment the app might not come back ──
     Being switched away from is the likeliest way this editor stops existing,
     and the debounce may still be counting. Write immediately instead of
     hoping for another 400ms. */
  useEffect(() => {
    if (snapshot === synced) return;
    const flush = () => {
      if (document.visibilityState === "hidden") void persistRecovery();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [snapshot, synced, persistRecovery]);

  /* ── the only case worth interrupting someone over ──
     Not "you have unsaved changes" — that is normal here and the recovery copy
     handles it. This fires only when the current state exists nowhere but this
     tab, which is the one situation where closing it genuinely loses writing. */
  useEffect(() => {
    if (recovery !== "failed" || snapshot === synced) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [recovery, snapshot, synced]);

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

  /**
   * Send a version of this document to the site.
   *
   * `outgoing` exists because React state is not applied synchronously, and
   * one caller edits the document and publishes it in the same breath:
   * "Remove & publish" takes the starter prompts out and continues the
   * publication the author already asked for. Reading `doc` from the closure
   * there sent the *unedited* document — prompts included — which the site
   * then refused, leaving a cleaned-up editor showing a stale complaint about
   * prompts that were no longer in it.
   *
   * So the version being sent is an argument, and the snapshot recorded as
   * submitted is taken from that same version rather than from whatever the
   * last render happened to hold.
   */
  const sendToSite = useCallback(
    async (nextStatus: "published" | "draft", outgoing?: EditorDoc) => {
      const source = outgoing ?? doc;
      const sourceSnapshot = outgoing ? JSON.stringify(outgoing) : snapshot;
      if (blockingReason(source)) return;

      setError(null);
      setConflict(false);
      setPublishQueued(false);
      setInFlight(nextStatus === "published" ? "publishing" : "saving");
      submitted.current = { snapshot: sourceSnapshot, published: nextStatus === "published" };

      const result = await handOffSave({
        entity: kind,
        entityId,
        localId,
        baseUpdatedAt,
        intent: intentFor({ nextStatus, published }),
        payload: {
          fields: fieldsFor(kind, source, nextStatus),
          blocks: source.blocks,
          tagIds: source.tagIds,
        },
      });

      // Whatever happens next, this version is written down somewhere.
      setKept(sourceSnapshot);

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
        setSynced(sourceSnapshot);
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
          // Stopped here rather than at the server. The site would refuse this
          // document anyway; refusing it in the editor means the answer arrives
          // with the paragraphs attached instead of as a sync failure.
          if (starterPrompts.length > 0) {
            setPromptsOpen(true);
            return;
          }
          void sendToSite("published");
          return;
        case "save-changes":
          void keepHere();
          return;
        case "review":
          window.dispatchEvent(new Event("hilman:sync"));
          return;
        case "review-prompts":
        case "remove-prompts":
          setPromptsOpen(true);
          return;
        case "retry-upload":
          window.dispatchEvent(new Event("hilman:sync"));
          return;
        case "retry": {
          setError(null);
          const previous = lastAction.current;
          void sendToSite(previous?.id === "save-draft" ? "draft" : "published");
        }
      }
    },
    [sendToSite, keepHere, starterPrompts.length]
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

  /**
   * An edit to one block's data.
   *
   * Passes through clearStarterMark, which is how a template's paragraph stops
   * being a template's paragraph: the moment its prose differs from what the
   * starter put there, the `starter` marker is turned off and the publication
   * gate stops holding it back. Nothing else clears it, and nothing turns it
   * back on — a block you have written in is yours from then on.
   */
  const updateBlock = (id: string, data: Record<string, any>) =>
    patch({
      blocks: doc.blocks.map((b) =>
        b.id === id ? { ...b, data: clearStarterMark(b.type, b.data ?? {}, data) } : b
      ),
    });

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
    setDragging(true);
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
    setDragging(false);
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
    // The cursor belongs at the top of what was just added — for Blank that is
    // the whole point of pressing it, and for a starter it is where you read
    // the first prompt and replace it.
    if (built.length > 0) setActiveBlockId(built[0].id);
  };

  /**
   * The document as the format the importer accepts.
   *
   * Deliberately the same shape, so a document can go out of one entry and
   * into another — or to a model, and back — without anyone learning the
   * database's column names. Identity and publication state are left out for
   * the same reason the importer refuses them.
   */
  const exportStudioJson = useCallback(async () => {
    const payload = JSON.stringify(
      {
        version: 1,
        kind,
        title: doc.title,
        blocks: doc.blocks.map((block) => ({ type: block.type, data: block.data ?? {} })),
      },
      null,
      2
    );
    try {
      await navigator.clipboard.writeText(payload);
      setAnnouncement("Copied as Studio JSON.");
    } catch {
      setError("This browser wouldn't let Studio use the clipboard.");
    }
  }, [kind, doc.title, doc.blocks]);

  const activeBlock = doc.blocks.find((b) => b.id === activeBlockId) ?? null;
  const meta = parsedMeta(doc) as Record<string, any>;
  // The address the server will have given it: slugify(slug) || slugify(title),
  // exactly as lib/studio-content.ts does, so the link is right for something
  // published a moment ago whose row we have not read back.
  const publicSlug = slugify(doc.slug) || slugify(doc.title);
  const publicHref = publicSlug ? `/${isProject ? "works" : "journal"}/${publicSlug}` : null;

  const menuItems: ActionItem[] = [
    { id: "details", label: "Details", detail: "Tags, address, images", onSelect: () => setDetailsOpen(true) },
    {
      id: "import",
      label: "Start from template or import",
      detail: "Templates, Markdown, HTML, Studio JSON",
      onSelect: () => setImportOpen(true),
    },
    {
      id: "export",
      label: "Copy as Studio JSON",
      detail: "The format this editor imports",
      onSelect: () => void exportStudioJson(),
    },
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
    <>
      <MobileEditorShell
        scrollRef={canvasRef}
        header={
          /* ── app bar ──
             A row of the shell on a phone, so it is not in the scrolling
             content and has nothing to be dragged by. It was `fixed` before,
             which was an improvement on `sticky` but still fought the document
             for position; now the document is not the scroller at all and the
             header simply sits above the part that is.

             Desktop keeps `sticky`, where there is no rubber-band to survive
             and the sidebar makes a viewport-width bar wrong. */
          <header
            className={cn(
              "border-b border-line bg-paper backdrop-blur",
              "pt-[env(safe-area-inset-top)]",
              "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
              "pb-2",
              "lg:sticky lg:top-0 lg:z-20 lg:px-0"
            )}
          >
            <div className="flex items-center gap-2 pt-2">
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

              <MoreButton onClick={() => setMenuOpen(true)} className="-mr-1.5" />
            </div>

            {/* Tapping the status is how you ask "where is this, exactly?" — the
                sheet answers in three lines. The full sync panel stays for the
                queue itself, which is a different question. */}
            <button
              type="button"
              onClick={() => setSyncOpen(true)}
              aria-haspopup="dialog"
              className="-mx-1 flex min-h-8 w-full items-center gap-2 rounded px-1 text-left transition-colors active:bg-card-hover"
            >
              <StatusLine tone={status.tone}>{status.statusLine}</StatusLine>
              <span aria-hidden className="text-2xs text-faint">
                ›
              </span>
            </button>
          </header>
        }
        actions={
          <>
            {/* Recovery is a different promise from saving, so it gets its own
                line rather than being folded into the status. It appears only
                when it has genuinely failed — saying "recovery copy kept" after
                every keystroke would be noise, and noise is what makes a real
                warning invisible.

                It sits in the action rows rather than sticking to the bottom of
                the content: there was a second `sticky bottom-0` here, competing
                with the action bar for the same edge. */}
            {recovery === "failed" && dirty && (
              <p
                role="alert"
                className="border-t border-red bg-red-soft px-4 py-2 text-sm text-red lg:-mx-8 lg:px-8"
              >
                Couldn&apos;t keep a recovery copy on {device}. Keep Studio open until this is
                saved.
              </p>
            )}

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
          </>
        }
      >
        {recovered && (
          <div className="mb-4 rounded-md border border-hl bg-hl-soft p-3.5">
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

        <div>
          {/* Desktop keeps the full settings panel; the phone gets one line. */}
          <div className="hidden lg:block">
            <MetaBar kind={kind} doc={doc} patch={patch} allTags={allTags} published={published} />
          </div>
          <div className="mb-4 lg:hidden">
            <MetadataSummary kind={kind} doc={doc} published={published} onOpen={() => setDetailsOpen(true)} />
          </div>

          {/* One editor, at every width.
              There used to be a Canvas/Form switch in the header, and Form
              rendered <BlockBuilder /> — the original stack of collapsible
              block cards with ↑ ↓ ✕ glyphs. Keeping it meant the studio had
              two editors with different capabilities, and the one a desktop
              could reach had no templates, no import and no inline add. The
              canvas is the editor; a wide screen gets more room for it, not a
              different one. */}
          <div className="mb-8">
            {/* No card below `lg`. Inside the app shell the writing is the
                screen, and a bordered panel around it is a second frame inside
                a frame that is already the phone. From `lg` the editor really
                is a document on a page, so it gets the sheet.

                `lg`, not `sm`: the shell itself switches at `lg`, and these
                two disagreeing is what made a 768px window a chimera — the
                mobile fixed shell wrapped around desktop internals. */}
            <div className="lg:rounded-lg lg:border lg:border-line lg:bg-surface lg:p-8">
                {/* Tapping the page, rather than a block, puts the block down.
                    Selection carries a toolbar now, so it needs a way out; a
                    block that stays lit until you select another one is a mode,
                    not a selection.

                    Controls are exempt, and that exemption is not a nicety: the
                    template buttons live inside this container, so a plain
                    handler here cancelled the selection applyTemplate had just
                    made — you pressed Blank and got an empty, unfocused,
                    invisible paragraph. Blocks stop their own clicks; this
                    covers everything else that is a button rather than a page. */}
                <div
                  className="mx-auto max-w-prose space-y-2"
                  onClick={(event) => {
                    const target = event.target as HTMLElement;
                    if (target.closest("button, a, input, textarea, select, label, [role='button']")) {
                      return;
                    }
                    setActiveBlockId(null);
                  }}
                >
                  {isProject ? (
                    <div className="mb-8">
                      {doc.coverPublicId && !doc.coverPublicId.startsWith("pending:") && (
                        <div className="relative mb-5 h-[22vh] min-h-[140px] w-full overflow-hidden rounded-lg border border-line">
                          <Pic src={doc.coverPublicId} alt="Cover" fill className="object-cover" />
                        </div>
                      )}
                      <header className="border-b border-dashed border-line-strong pb-5 lg:rounded-xl lg:border lg:border-solid lg:border-line lg:bg-raise lg:p-8">
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
                        <span>
                          {readTimeLabel(
                            readTimeMinutes({ excerpt: doc.excerpt, blocks: doc.blocks })
                          )}
                        </span>
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
                      /* Addressable, so "Show them" can scroll to the exact
                         paragraph the publication gate is waiting on. */
                      <div key={block.id} id={`editor-block-${block.id}`}>
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
                        {/* Add where you are, not at the end and then drag it
                            back. Only under the selected block, for the same
                            reason its toolbar is — and at every width, because
                            this is the control that hands over to the Add sheet
                            and from there to Import. The pointer-only
                            <InsertZone /> that used to sit here on desktop had
                            its own block-type grid and no route to templates or
                            import at all, so a laptop got a smaller product
                            from the same editor. */}
                        {activeBlockId === block.id && (
                          <InlineAdd
                            onAdd={() => setAddBlockAt(index + 1)}
                            label="Add a block after this one"
                          />
                        )}
                      </div>
                    ))}
                  </Reorder.Group>

                  {blocks.length === 0 && (
                    /* The empty state is the one moment templates are obviously
                       useful, so they lead — but "just start typing" stays the
                       first option, because most of the time that is the answer. */
                    <div className="my-5 space-y-3">
                      <p className="text-sm text-soft">
                        Nothing written yet. How do you want to start?
                      </p>

                      {/* Blank comes from the registry like everything else —
                          it used to be a button wired straight to insertBlock
                          here, which is how this list and the import sheet's
                          list could come to offer different things. */}
                      <div className="grid gap-2">
                        {templatesFor(kind).map((template) => (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => applyTemplate(template.id)}
                            className={cn(
                              "min-h-14 rounded-md p-3 text-left transition-colors active:bg-card-hover",
                              template.emphasis === "primary"
                                ? "border border-hl bg-hl-soft"
                                : "border border-line bg-raise hover:border-pen"
                            )}
                          >
                            <span className="block text-sm font-semibold text-ink">{template.name}</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-soft">
                              {template.description}
                            </span>
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setImportOpen(true)}
                        className="flex min-h-12 w-full items-center justify-between rounded-md border border-line px-3.5 text-sm font-medium text-soft transition-colors hover:border-pen active:bg-card-hover"
                      >
                        Import or paste content
                        <span aria-hidden>›</span>
                      </button>

                      <p className="text-xs text-faint">
                        Templates only add prompts to replace — they never write claims for you.
                      </p>
                    </div>
                  )}

                  {doc.blocks.length > 0 && (
                    <InlineAdd
                      onAdd={() => setAddBlockAt(doc.blocks.length)}
                      label="Add a block at the end"
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
          </div>
        </div>

        {/* What just happened to a block, for anyone not watching it happen.
            Written only when the logical position changes — a pixel-by-pixel
            commentary during a drag would be unusable. */}
        <p aria-live="polite" role="status" className="sr-only">
          {announcement}
        </p>


      </MobileEditorShell>

      {/* Overlays, and siblings of the shell on purpose: a sheet belongs to
          the screen, not to one of its rows, and nesting it under a row that
          `backdrop-blur` would make its own `fixed` resolve against that row. */}
      {/* ── the starter prompts, when there are still some ──
          Opened instead of publishing, and by the two actions the BLOCKED
          status offers. Nothing here publishes on its own: removing the
          prompts continues the same press that opened it. */}
      <StarterPromptsSheet
        open={promptsOpen}
        onClose={() => setPromptsOpen(false)}
        prompts={starterPrompts}
        publishLabel={published ? "Update live" : "Publish"}
        onShow={(finding) => {
          const block = doc.blocks[finding.index];
          setPromptsOpen(false);
          if (!block) return;
          setActiveBlockId(block.id);
          // After the sheet has gone, so the scroll lands where the block ends
          // up rather than where it was behind an overlay.
          requestAnimationFrame(() => {
            document
              .getElementById(`editor-block-${block.id}`)
              ?.scrollIntoView({ block: "center", behavior: "smooth" });
          });
        }}
        onRemove={() => {
          const blocks = stripStarterPrompts(doc.blocks).map((block, position) => ({
            ...block,
            position,
          }));
          const cleaned = { ...doc, blocks };
          patch({ blocks });
          setPromptsOpen(false);
          setAnnouncement(
            `${starterPrompts.length} starter ${
              starterPrompts.length === 1 ? "prompt" : "prompts"
            } removed.`
          );
          // The same publication the author asked for, continued — not a new
          // one started because a block went away. The cleaned document is
          // handed over explicitly: `doc` in this closure is still the one
          // with the prompts in it.
          void sendToSite("published", cleaned);
        }}
      />

      <SyncStatusSheet
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        status={status}
        published={published}
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
        onImport={() => setImportOpen(true)}
      />

      {/* Templates and pasted documents both end here: ordinary blocks in the
          editor's own state. Nothing below reaches the server — publishing is
          still the only thing that does. */}
      <ImportContentSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        kind={kind}
        existing={doc.blocks}
        onApply={(blocks, imported) => {
          patch({
            blocks,
            // An untitled new document takes the imported title; one that has
            // been named keeps its name.
            ...(imported.title && !doc.title.trim() ? { title: imported.title } : {}),
          });
          setAnnouncement(`${imported.blocks.length} blocks added.`);
        }}
      />

      <PropertyDrawer
        open={drawerOpen}
        block={activeBlock}
        onChange={(data) => activeBlockId && updateBlock(activeBlockId, data)}
        onClose={() => setDrawerOpen(false)}
      />
    </>
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
