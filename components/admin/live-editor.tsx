"use client";

import { useState, useRef, useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { Reorder } from "framer-motion";
import { InsertZone } from "./insert-zone";
import { EditableBlock } from "./editable-block";
import { PropertyDrawer } from "./property-drawer";
import { MetaBar } from "./meta-bar";
import { BlockBuilder } from "./block-builder";
import { DEFAULT_DATA } from "./block-editors";
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
}

function SaveBar({ state, isNew, isVisual }: SaveBarProps) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 z-30 -mx-4 flex items-center justify-between border-t border-line bg-paper/95 px-4 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur shadow-sticky sm:-mx-8 sm:px-8">
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[44px] items-center rounded bg-hl px-6 text-sm font-semibold text-hl-ink shadow-card transition-all hover:opacity-90 disabled:opacity-50 active:scale-98"
        >
          {pending ? "Saving…" : isNew ? "Create" : "Save changes"}
        </button>
        {state.status === "success" && !pending && (
          <span className="text-sm font-medium text-green-500 flex items-center gap-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Saved successfully!
          </span>
        )}
        {state.status === "error" && !pending && (
          <span role="alert" className="text-sm font-medium text-red">
            {state.message}
          </span>
        )}
      </div>
      <span className="hidden text-xs text-faint sm:inline font-mono">
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

  let parsedMeta: Record<string, any> = {};
  try {
    parsedMeta = JSON.parse(rawMeta);
  } catch {
    // ignore
  }

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

  const handleReorder = (newBlocks: Block[]) => {
    setBlocks(newBlocks.map((b, idx) => ({ ...b, position: idx })));
  };

  const activeBlock = blocks.find((b) => b.id === activeBlockId) || null;

  return (
    <form action={action} className="relative min-h-[calc(100vh-140px)] flex flex-col justify-between">
      {/* Hidden serialization fields */}
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      <input type="hidden" name="tag_ids" value={JSON.stringify(tagIds)} />

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
                <p className="text-2xs font-semibold uppercase tracking-wider text-faint text-center mb-6">
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
                  <div className="rounded-lg border border-dashed border-line-strong p-12 text-center my-6">
                    <p className="text-sm text-soft font-medium mb-4">No content blocks yet.</p>
                    <p className="text-xs text-faint">
                      Use the insertion zone below to add your first heading, paragraph, image, or custom element.
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
        <SaveBar state={formState} isNew={isNew} isVisual={isVisual} />

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
