"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Reorder } from "framer-motion";
import { InsertZone } from "./insert-zone";
import { EditableBlock } from "./editable-block";
import { PropertyDrawer } from "./property-drawer";
import { MetaBar } from "./meta-bar";
import { BlockBuilder } from "./block-builder";
import { DEFAULT_DATA } from "./block-editors";
import { templatesFor } from "./block-templates";
import { DeleteButton } from "./delete-button";
import { Pic } from "../cld-image";
import { STREAMS, type Stream } from "@/lib/types";
import {
  deleteJournal,
  deleteProject,
  saveJournal,
  saveProject,
  type ActionState,
} from "@/app/admin/actions";
import { cn, uid } from "@/lib/utils";
import type { Block, BlockType, JournalPost, Project, TagRow } from "@/lib/types";

const initialState: ActionState = { status: "idle" };

interface SaveBarProps {
  state: ActionState;
  isNew: boolean;
  isVisual: boolean;
  /** True when the form has changed since the last successful save. */
  dirty: boolean;
  /** Blocks submission and explains why. */
  blockedReason?: string | null;
}

/**
 * "Saved successfully!" used to stay on screen while the editor kept typing,
 * describing a version that no longer existed. It now yields to
 * "Unsaved changes" as soon as anything moves.
 */
function SaveBar({ state, isNew, isVisual, dirty, blockedReason }: SaveBarProps) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line bg-paper/95 px-4 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] shadow-sticky backdrop-blur sm:-mx-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || Boolean(blockedReason)}
          className="inline-flex min-h-[44px] items-center rounded bg-hl px-6 text-sm font-semibold text-hl-ink shadow-card transition-all hover:opacity-90 active:scale-98 disabled:opacity-50"
        >
          {pending ? "Saving..." : isNew ? "Create" : "Save changes"}
        </button>

        {blockedReason ? (
          <span role="alert" className="text-sm font-medium text-red">
            {blockedReason}
          </span>
        ) : pending ? (
          <span className="text-sm text-soft">Saving...</span>
        ) : state.status === "error" ? (
          <span role="alert" className="text-sm font-medium text-red">
            Not saved &mdash; {state.message}
          </span>
        ) : dirty ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-soft">
            <span aria-hidden className="h-2 w-2 rounded-full bg-hl" />
            Unsaved changes
          </span>
        ) : state.status === "success" ? (
          <span className="flex items-center gap-1 text-sm font-medium text-pen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Saved
          </span>
        ) : null}
      </div>
      <span className="hidden font-mono text-xs text-soft sm:inline">
        Editing in {isVisual ? "Visual Canvas" : "Classic Form"}
      </span>
    </div>
  );
}

function InlineTextarea({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full bg-transparent border-0 border-b border-dashed border-transparent hover:border-line focus:border-pen outline-none p-0 resize-none font-inherit transition-all duration-fast",
        className
      )}
      placeholder={placeholder}
      rows={1}
      style={{ overflow: "hidden" }}
    />
  );
}

function InlineInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-full bg-transparent border-0 border-b border-dashed border-transparent hover:border-line focus:border-pen outline-none p-0 font-inherit transition-all duration-fast",
        className
      )}
      placeholder={placeholder}
    />
  );
}

interface LiveEditorProps {
  kind: "project" | "journal";
  initial: (Project & JournalPost) | null;
  allTags: TagRow[];
}

export function LiveEditor({ kind, initial, allTags }: LiveEditorProps) {
  const isProject = kind === "project";
  const isNew = !initial;
  const [formState, action] = useFormState(isProject ? saveProject : saveJournal, initialState);

  // Core content states
  const [blocks, setBlocks] = useState<Block[]>(initial?.blocks ?? []);
  const [tagIds, setTagIds] = useState<string[]>((initial?.tags ?? []).map((t) => t.id));
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [stream, setStream] = useState<string>(initial?.stream ?? "visual-design");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [coverPublicId, setCoverPublicId] = useState(initial?.cover_public_id ?? "");
  const [thumbnailPublicId, setThumbnailPublicId] = useState(initial?.thumbnail_public_id ?? "");
  const [year, setYear] = useState(initial?.year ? String(initial.year) : "");
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ? String(initial.sort_order) : "0");
  const [rawMeta, setRawMeta] = useState(JSON.stringify(initial?.meta ?? {}, null, 2));
  const [readingMinutes, setReadingMinutes] = useState(initial?.reading_minutes ? String(initial.reading_minutes) : "3");
  const [status, setStatus] = useState<"published" | "draft">(initial?.status ?? "draft");
  const [featured, setFeatured] = useState(initial?.featured ?? false);

  // Editor configuration states
  const [isVisual, setIsVisual] = useState(true);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* -- unsaved work: track it, warn about it, recover it --
     The editor holds a lot of state that only reaches the database on submit.
     Losing it to a refresh, a closed tab, or a stray link was silent. */

  /**
   * The document as a plain object. Assembling it is cheap; serialising it is
   * not, so that is deliberately kept out of the render path below — on a long
   * article, stringifying the whole document (and then stringifying it *again*
   * for localStorage) on every keystroke was enough to make typing stutter.
   */
  const doc = useMemo(
    () => ({
      title, slug, subtitle, stream, excerpt, coverPublicId, thumbnailPublicId,
      year, sortOrder, rawMeta, readingMinutes, status, featured, tagIds, blocks,
    }),
    [title, slug, subtitle, stream, excerpt, coverPublicId, thumbnailPublicId,
     year, sortOrder, rawMeta, readingMinutes, status, featured, tagIds, blocks]
  );
  // Read on submit, where the *current* document is what matters. Kept in sync
  // from an effect rather than during render, so a render React throws away
  // can never leave the ref pointing at a document that was never shown.
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  const draftKey = "hilman-draft:" + kind + ":" + (initial?.id ?? "new");
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(doc));
  const submittedSnapshot = useRef(savedSnapshot);
  const [recovered, setRecovered] = useState<{ snapshot: string; savedAt: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  // Offer a local draft rather than applying it -- restoring is a decision.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { snapshot: string; savedAt: string };
      if (parsed.snapshot === savedSnapshot) {
        window.localStorage.removeItem(draftKey);
        return;
      }
      setRecovered(parsed);
    } catch {
      /* a corrupt draft is not worth interrupting the editor over */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  /**
   * Works out whether there are unsaved changes, and mirrors them to
   * localStorage — once the editor pauses, not once per character. The pause is
   * short enough that a crash still costs at most a few words, and it keeps the
   * serialisation and the synchronous storage write off the typing path.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const snapshot = JSON.stringify(doc);
      const changed = snapshot !== savedSnapshot;
      setDirty(changed);
      try {
        if (changed) {
          window.localStorage.setItem(
            draftKey,
            JSON.stringify({ snapshot, savedAt: new Date().toISOString() })
          );
        } else {
          window.localStorage.removeItem(draftKey);
        }
      } catch {}
    }, 400);
    return () => window.clearTimeout(timer);
  }, [doc, savedSnapshot, draftKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // A save only clears the dirty flag for the version that was submitted.
  useEffect(() => {
    if (formState.status === "success") {
      setSavedSnapshot(submittedSnapshot.current);
      // Anything typed while the save was in flight keeps the badge honest:
      // the debounced effect re-runs against the new saved snapshot.
      setDirty(JSON.stringify(docRef.current) !== submittedSnapshot.current);
      setRecovered(null);
      try {
        window.localStorage.removeItem(draftKey);
      } catch {}
    }
  }, [formState.status, formState.savedAt, draftKey]);

  function restoreDraft(raw: string) {
    try {
      const v = JSON.parse(raw);
      setTitle(v.title ?? "");
      setSlug(v.slug ?? "");
      setSubtitle(v.subtitle ?? "");
      setStream(v.stream ?? "visual-design");
      setExcerpt(v.excerpt ?? "");
      setCoverPublicId(v.coverPublicId ?? "");
      setThumbnailPublicId(v.thumbnailPublicId ?? "");
      setYear(v.year ?? "");
      setSortOrder(v.sortOrder ?? "0");
      setRawMeta(v.rawMeta ?? "{}");
      setReadingMinutes(v.readingMinutes ?? "3");
      setStatus(v.status === "published" ? "published" : "draft");
      setFeatured(Boolean(v.featured));
      setTagIds(Array.isArray(v.tagIds) ? v.tagIds : []);
      setBlocks(Array.isArray(v.blocks) ? v.blocks : []);
    } catch {
      /* nothing usable in the stored draft */
    }
    setRecovered(null);
  }

  // The server refuses a malformed meta payload; say so before the round-trip.
  // Parsed once per edit to `meta` rather than once per render — the editor
  // re-renders on every keystroke anywhere in the document.
  const { metaIsValid, parsedMeta } = useMemo(() => {
    if (!rawMeta.trim()) return { metaIsValid: true, parsedMeta: {} as Record<string, any> };
    try {
      const parsed = JSON.parse(rawMeta);
      const valid = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
      return { metaIsValid: valid, parsedMeta: valid ? parsed : {} };
    } catch {
      return { metaIsValid: false, parsedMeta: {} as Record<string, any> };
    }
  }, [rawMeta]);

  const blockedReason = !title.trim()
    ? "Add a title before saving."
    : !metaIsValid
      ? "The meta field is not a valid JSON object."
      : null;

  const handleUpdateMetaField = (key: string, value: any) => {
    let current: Record<string, any> = {};
    try {
      current = JSON.parse(rawMeta);
    } catch {}
    const updated = { ...current, [key]: value };
    setRawMeta(JSON.stringify(updated, null, 2));
  };

  // Block handlers
  const handleInsert = (type: BlockType, index: number) => {
    const newBlock: Block = {
      id: `new-${uid()}`,
      type,
      position: index,
      data: structuredClone(DEFAULT_DATA[type]),
    };
    const updated = [...blocks];
    updated.splice(index, 0, newBlock);
    const reordered = updated.map((b, idx) => ({ ...b, position: idx }));
    setBlocks(reordered);
    setActiveBlockId(newBlock.id);
    if (!["paragraph", "divider"].includes(type)) {
      setDrawerOpen(true);
    }
  };

  const handleUpdateBlock = (id: string, data: Record<string, any>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, data } : b)));
  };

  const handleConvertBlock = (id: string, newType: BlockType) => {
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;

        // Carry text forward if converting between text-friendly blocks
        const oldText = b.data?.text || b.data?.md || "";
        const cleanText = oldText.replace(/^\/$/, "").trim(); // Strip slash command char if single slash

        const newData = structuredClone(DEFAULT_DATA[newType]);
        if ("text" in newData) {
          newData.text = cleanText;
        } else if ("md" in newData) {
          newData.md = cleanText;
        }

        return {
          ...b,
          type: newType,
          data: newData,
        };
      })
    );
    setActiveBlockId(id);
    if (!["paragraph", "divider", "heading", "quote", "button"].includes(newType)) {
      setDrawerOpen(true);
    }
  };

  const handleRemoveBlock = (id: string) => {
    const idx = blocks.findIndex((b) => b.id === id);
    const prevBlock = idx > 0 ? blocks[idx - 1] : null;
    setBlocks((prev) =>
      prev.filter((b) => b.id !== id).map((b, idx) => ({ ...b, position: idx }))
    );
    if (activeBlockId === id) {
      setActiveBlockId(prevBlock ? prevBlock.id : null);
      setDrawerOpen(false);
    }
  };

  const handleMoveBlock = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next.map((b, idx) => ({ ...b, position: idx })));
  };

  const handleDuplicateBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    if (index === -1) return;
    
    const original = blocks[index];
    const duplicatedBlock: Block = {
      id: `new-${uid()}`,
      type: original.type,
      position: index + 1,
      data: structuredClone(original.data ?? {}),
    };
    
    const updated = [...blocks];
    updated.splice(index + 1, 0, duplicatedBlock);
    const reordered = updated.map((b, idx) => ({ ...b, position: idx }));
    setBlocks(reordered);
    setActiveBlockId(duplicatedBlock.id);
  };

  /** Drops a starter case-study layout in, replacing nothing that exists. */
  const handleApplyTemplate = (templateId: string) => {
    const template = templatesFor(kind).find((t) => t.id === templateId);
    if (!template) return;
    const built = template.build().map((b, idx) => ({
      id: `new-${uid()}`,
      type: b.type,
      position: blocks.length + idx,
      data: structuredClone(b.data ?? {}),
    })) as Block[];
    setBlocks([...blocks, ...built].map((b, idx) => ({ ...b, position: idx })));
  };

  const handleReorder = (newBlocks: Block[]) => {
    setBlocks(newBlocks.map((b, idx) => ({ ...b, position: idx })));
  };

  const activeBlock = blocks.find((b) => b.id === activeBlockId) || null;

  // Serialised only when the underlying list actually changes, not on every
  // keystroke in an unrelated field.
  const blocksField = useMemo(() => JSON.stringify(blocks), [blocks]);
  const tagIdsField = useMemo(() => JSON.stringify(tagIds), [tagIds]);

  return (
    <form
      action={action}
      onSubmit={() => {
        submittedSnapshot.current = JSON.stringify(docRef.current);
      }}
      className="relative flex min-h-[calc(100vh-140px)] flex-col justify-between"
    >
      {/* Hidden serialization fields */}
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <input type="hidden" name="blocks" value={blocksField} />
      <input type="hidden" name="tag_ids" value={tagIdsField} />

      {recovered && (
        <div className="mb-5 rounded-md border border-hl bg-hl-soft/25 p-4">
          <p className="text-sm font-semibold text-ink">
            There is an unsaved draft of this {kind} in this browser.
          </p>
          <p className="mt-1 text-sm text-soft">
            It never reached the site. Restoring only refills the editor &mdash; you still choose
            whether to save.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => restoreDraft(recovered.snapshot)}
              className="rounded bg-hl px-3.5 py-2 text-sm font-semibold text-hl-ink"
            >
              Restore draft
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.removeItem(draftKey);
                } catch {}
                setRecovered(null);
              }}
              className="rounded border border-line px-3.5 py-2 text-sm"
            >
              Discard it
            </button>
          </div>
        </div>
      )}

      <div>
        {/* Top Header Navigation */}
        <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur flex flex-wrap items-center justify-between gap-3 sm:-mx-8 sm:px-8 sm:py-3.5">
          <div className="flex items-center gap-4">
            <Link
              href={isProject ? "/admin/projects" : "/admin/journal"}
              className="inline-flex h-8 w-8 items-center justify-center rounded border border-line bg-raise text-soft hover:border-pen hover:text-pen transition-colors"
              title="Back"
            >
              ←
            </Link>
            <div>
              <h1 className="font-display text-lg font-bold truncate max-w-xs sm:max-w-md">
                {isNew ? `New ${kind}` : `Edit: ${title}`}
              </h1>
            </div>
          </div>

          {/* Mode Switcher Toggle */}
          <div className="flex items-center gap-1.5 rounded-full border border-line bg-raise p-1 text-xs">
            <button
              type="button"
              onClick={() => setIsVisual(true)}
              className={`rounded-full px-3 py-1 font-semibold transition-all ${
                isVisual
                  ? "bg-hl text-hl-ink shadow-sm"
                  : "text-soft hover:text-ink"
              }`}
            >
              Visual Canvas
            </button>
            <button
              type="button"
              onClick={() => setIsVisual(false)}
              className={`rounded-full px-3 py-1 font-semibold transition-all ${
                !isVisual
                  ? "bg-hl text-hl-ink shadow-sm"
                  : "text-soft hover:text-ink"
              }`}
            >
              Classic Form
            </button>
          </div>
        </div>

        {/* Collapsible Document Metadata */}
        <MetaBar
          kind={kind}
          initial={initial}
          title={title}
          setTitle={setTitle}
          slug={slug}
          setSlug={setSlug}
          subtitle={subtitle}
          setSubtitle={setSubtitle}
          stream={stream}
          setStream={setStream}
          excerpt={excerpt}
          setExcerpt={setExcerpt}
          coverPublicId={coverPublicId}
          setCoverPublicId={setCoverPublicId}
          thumbnailPublicId={thumbnailPublicId}
          setThumbnailPublicId={setThumbnailPublicId}
          year={year}
          setYear={setYear}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          rawMeta={rawMeta}
          setRawMeta={setRawMeta}
          readingMinutes={readingMinutes}
          setReadingMinutes={setReadingMinutes}
          status={status}
          setStatus={setStatus}
          featured={featured}
          setFeatured={setFeatured}
          tagIds={tagIds}
          setTagIds={setTagIds}
          allTags={allTags}
        />

        {/* Main Editor Section */}
        <div className="mb-12">
          {isVisual ? (
            <div className="rounded-lg border border-line bg-surface p-4 sm:p-8 min-h-[400px]">
              <div className="mx-auto max-w-prose space-y-2">
                <p className="mb-6 text-center text-2xs font-semibold uppercase tracking-wider text-soft">
                  — Visual Canvas Preview (Click block to edit text, hover for actions) —
                </p>

                {/* Visual Header Preview */}
                {isProject ? (
                  <div className="mb-10">
                    {coverPublicId && (
                      <div className="relative h-[25vh] min-h-[160px] w-full overflow-hidden border border-line rounded-lg mb-6 shadow-sm">
                        <Pic src={coverPublicId} alt="Cover Preview" fill className="object-cover" />
                      </div>
                    )}
                    <header className="relative z-10 mx-auto -mt-8 mb-8 rounded-xl border border-line bg-raise p-6 shadow-lift sm:p-8">
                      <div className="flex flex-wrap items-center gap-2.5 text-2xs text-faint">
                        <span className="font-semibold uppercase tracking-wider text-pen">
                          {STREAMS[stream as Stream]?.name || stream}
                        </span>
                        {year && (
                          <>
                            <span>·</span>
                            <span>{year}</span>
                          </>
                        )}
                      </div>
                      
                      <InlineTextarea
                        value={title}
                        onChange={setTitle}
                        placeholder="Enter project title..."
                        className="mt-2.5 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
                      />
                      <InlineTextarea
                        value={subtitle}
                        onChange={setSubtitle}
                        placeholder="Enter project subtitle / client description..."
                        className="mt-1 text-sm text-soft"
                      />

                      <dl className="mt-4 grid gap-x-4 gap-y-2 border-t border-dashed border-line pt-4 text-xs sm:grid-cols-3">
                        <div>
                          <dt className="font-hand text-sm text-faint">my role</dt>
                          <dd className="mt-0.5">
                            <InlineInput
                              value={parsedMeta.role ?? ""}
                              onChange={(val) => handleUpdateMetaField("role", val)}
                              placeholder="Role (e.g. Art direction)"
                              className="text-ink text-xs font-medium"
                            />
                          </dd>
                        </div>
                        <div>
                          <dt className="font-hand text-sm text-faint">tools</dt>
                          <dd className="mt-0.5">
                            <InlineInput
                              value={
                                Array.isArray(parsedMeta.tools)
                                  ? parsedMeta.tools.join(", ")
                                  : parsedMeta.tools ?? ""
                              }
                              onChange={(val) =>
                                handleUpdateMetaField(
                                  "tools",
                                  val.split(",").map((t) => t.trim()).filter(Boolean)
                                )
                              }
                              placeholder="Tools (e.g. Figma, Riso)"
                              className="text-ink text-xs font-medium"
                            />
                          </dd>
                        </div>
                        <div>
                          <dt className="font-hand text-sm text-faint">for</dt>
                          <dd className="mt-0.5">
                            <InlineInput
                              value={parsedMeta.client ?? ""}
                              onChange={(val) => handleUpdateMetaField("client", val)}
                              placeholder="Client / Brand"
                              className="text-ink text-xs font-medium"
                            />
                          </dd>
                        </div>
                      </dl>

                      {tagIds.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5 pt-3 border-t border-line">
                          {tagIds.map((id) => {
                            const tag = allTags.find((t) => t.id === id);
                            if (!tag) return null;
                            return (
                              <span key={id} className="rounded border border-line bg-surface px-2 py-0.5 text-2xs font-semibold text-soft">
                                {tag.name}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </header>
                  </div>
                ) : (
                  <header className="mx-auto max-w-3xl mb-8 border-b border-dashed border-line-strong pb-6">
                    <div className="flex flex-wrap items-center gap-2.5 text-2xs text-faint">
                      <span>{status === "published" ? "Published Log" : "Draft Log"}</span>
                      <span>·</span>
                      <span>{readingMinutes} min read</span>
                    </div>
                    <InlineTextarea
                      value={title}
                      onChange={setTitle}
                      placeholder="Enter post title..."
                      className="mt-2.5 font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl"
                    />
                    <InlineTextarea
                      value={excerpt}
                      onChange={setExcerpt}
                      placeholder="Write an excerpt..."
                      className="mt-3 text-sm italic text-soft"
                    />
                    
                    {tagIds.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {tagIds.map((id) => {
                          const tag = allTags.find((t) => t.id === id);
                          if (!tag) return null;
                          return (
                            <span key={id} className="rounded border border-line bg-surface px-2 py-0.5 text-2xs font-semibold text-soft">
                              {tag.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </header>
                )}

                {/* Blocks list */}
                <Reorder.Group axis="y" values={blocks} onReorder={handleReorder} className="space-y-1">
                  {blocks.map((block, idx) => (
                    <div key={block.id}>
                      <InsertZone onInsert={(type) => handleInsert(type, idx)} />
                      <EditableBlock
                        block={block}
                        active={activeBlockId === block.id}
                        onActivate={() => setActiveBlockId(block.id)}
                        onChange={(data) => handleUpdateBlock(block.id, data)}
                        onOpenDrawer={() => setDrawerOpen(true)}
                        onRemove={() => handleRemoveBlock(block.id)}
                        onMove={(dir) => handleMoveBlock(block.id, dir)}
                        onDuplicate={() => handleDuplicateBlock(block.id)}
                        onInsertBelow={(type) => handleInsert(type, idx + 1)}
                        onConvert={(type) => handleConvertBlock(block.id, type)}
                      />
                    </div>
                  ))}
                </Reorder.Group>

                {blocks.length === 0 && (
                  <div className="my-6 rounded-lg border border-dashed border-line-strong p-8 text-center">
                    <p className="mb-1 text-sm font-medium text-soft">No content blocks yet.</p>
                    <p className="text-sm text-soft">
                      Start from a structure, or build it up block by block below.
                    </p>
                    <div className="mt-5 grid gap-2 text-left sm:grid-cols-3">
                      {templatesFor(kind).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleApplyTemplate(t.id)}
                          className="rounded-md border border-line bg-raise p-3 transition-colors hover:border-pen"
                        >
                          <span className="block text-sm font-semibold text-ink">{t.name}</span>
                          <span className="mt-1 block text-xs leading-relaxed text-soft">
                            {t.description}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-soft">
                      Templates only add prompts to replace &mdash; they never fill in claims for you.
                    </p>
                  </div>
                )}

                <InsertZone onInsert={(type) => handleInsert(type, blocks.length)} />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-surface p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-soft">
                Content Blocks (Classic Accordion)
              </h2>
              <BlockBuilder value={blocks} onChange={setBlocks} />
            </div>
          )}
        </div>
      </div>

      {/* Save action footer */}
      <div>
        <SaveBar
          state={formState}
          isNew={isNew}
          isVisual={isVisual}
          dirty={dirty}
          blockedReason={blockedReason}
        />

        {/* Delete button (existing records only) */}
        {!isNew && (
          <div className="mt-8 border-t border-dashed border-line pt-6">
            <DeleteButton
              label={`Delete this ${kind} permanently`}
              onConfirm={async () => {
                if (isProject) await deleteProject(initial.id);
                else await deleteJournal(initial.id);
              }}
            />
          </div>
        )}
      </div>

      {/* Property Drawer (slides in from right for image uploads, code blocks, etc.) */}
      <PropertyDrawer
        open={drawerOpen}
        block={activeBlock}
        onChange={(data) => activeBlockId && handleUpdateBlock(activeBlockId, data)}
        onClose={() => setDrawerOpen(false)}
      />
    </form>
  );
}
