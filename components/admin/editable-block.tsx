"use client";

import { memo, Suspense, useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Reorder, useDragControls } from "framer-motion";
import { BlockDragGrip } from "./mobile/block-drag-grip";
import { collectPendingRefs } from "@/lib/studio-media-refs";
import { PendingClip, PendingPhoto } from "./pending-media";
import { DeferredUnavailable, useLoadedOr } from "./deferred";
import { BLOCK_TYPES } from "./block-editors";
import type { Block, BlockType } from "@/lib/types";

type RendererPreview = typeof import("./block-preview").BlockPreview;

/** The renderer, once this browser has it. See useLoadedOr(). */
let loadedPreview: RendererPreview | null = null;

const remember = (module: typeof import("./block-preview")) => {
  // Browser only: on the server, going through next/dynamic every time is
  // what puts a preload for the renderer's code into the page.
  if (typeof window !== "undefined") loadedPreview = module.BlockPreview;
  return module.BlockPreview;
};

/**
 * The canvas draws each block with the public renderer, fetched rather than
 * imported (see block-preview.tsx for what it would bring along).
 *
 * The server still draws every preview into the HTML, so the page looks the
 * same from the first paint. In the browser each preview waits behind its own
 * Suspense boundary until the renderer arrives — which keeps that wait from
 * holding up the rest of the editor, whose controls work in the meantime.
 */
const LazyBlockPreview = dynamic(() =>
  import("./block-preview").then(remember, () => DeferredUnavailable)
);

/** Fetches the renderer ahead of need. See warmEditor() in live-editor.tsx. */
export function prefetchBlockPreview(): Promise<unknown> {
  return import("./block-preview").then(remember);
}

/**
 * Memoised on purpose, not for speed.
 *
 * The editor re-renders every block whenever anything about the document
 * changes, and it does so within moments of loading. A Suspense boundary that
 * is still holding the server's HTML and receives new props at that point
 * gives the HTML up and shows its fallback until the code arrives. Held still,
 * it keeps the server's copy on screen and simply comes alive when it can.
 * `data` is the block's own object, which an edit to another block leaves
 * alone, so a preview only renders again when its own block changes.
 */
const BlockPreview = memo(function BlockPreview({
  type,
  data,
}: {
  type: BlockType;
  data: Block["data"];
}) {
  const Preview = useLoadedOr(loadedPreview, LazyBlockPreview);
  return (
    <Suspense fallback={null}>
      <Preview type={type} data={data} />
    </Suspense>
  );
});

interface EditableBlockProps {
  block: Block;
  active: boolean;
  onActivate: () => void;
  onChange: (data: Record<string, any>) => void;
  onOpenDrawer: () => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate?: () => void;
  onInsertBelow?: (type: BlockType) => void;
  onConvert?: (type: BlockType) => void;
  /** Position in the list, for the screen-reader announcement on pick-up. */
  index?: number;
  total?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  /** Opens the Add sheet positioned after this block. */
  onAddBelow?: () => void;
  /** Disabled at the ends of the list rather than silently doing nothing. */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

// Auto-resizing textarea for paragraphs/quotes
function AutoResizingTextarea({
  value,
  onChange,
  className,
  placeholder,
  active,
  onKeyDown,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className: string;
  placeholder?: string;
  active?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);

  useEffect(() => {
    if (active && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [active]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className={className}
      placeholder={placeholder}
      rows={1}
      style={{ overflow: "hidden" }}
    />
  );
}

function getBlockIcon(type: BlockType) {
  switch (type) {
    case "heading":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4v16M18 4v16M6 12h12"/>
        </svg>
      );
    case "paragraph":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H9a5 5 0 0 0 0 10h11M14 2v18M18 2v18"/>
        </svg>
      );
    case "markdown":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M7 8h10M7 12h10M7 16h6"/>
        </svg>
      );
    case "image":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
      );
    case "gallery":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
      );
    case "youtube":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M23 7a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7z"/>
          <polygon points="10 11 10 15 14 13"/>
        </svg>
      );
    case "embed":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
      );
    case "quote":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21c3 0 7-9 7-14a5 5 0 0 0-10 0c0 5 3.5 12 3.5 14zm11 0c3 0 7-9 7-14a5 5 0 0 0-10 0c0 5 3.5 12 3.5 14z"/>
        </svg>
      );
    case "divider":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      );
    case "code":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      );
    case "button":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <path d="M8 12h8"/>
        </svg>
      );
    case "link":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
        </svg>
      );
    case "file":
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      );
    default:
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      );
  }
}

export function EditableBlock({
  block,
  active,
  onActivate,
  onChange,
  onOpenDrawer,
  onRemove,
  onMove,
  onDuplicate,
  onInsertBelow,
  onConvert,
  index,
  total,
  onDragStart,
  onDragEnd,
  onAddBelow,
  canMoveUp = true,
  canMoveDown = true,
}: EditableBlockProps) {
  const dragControls = useDragControls();
  const [lifted, setLifted] = useState(false);

  // Photos in this block that have not reached Cloudinary yet.
  const stashedPhotos = collectPendingRefs(block.data);

  // Keyboard navigation & slash menu states
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Hide slash menu if block becomes inactive
  useEffect(() => {
    if (!active) {
      setShowSlashMenu(false);
    }
  }, [active]);

  const hasDrawerConfig = !["paragraph", "divider"].includes(block.type);

  const handleTextChange = (text: string) => {
    onChange({ ...(block.data ?? {}), text });
    if (text === "/") {
      setShowSlashMenu(true);
      setSelectedIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  };

  const handleTextKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const value = e.currentTarget.value;
    if (showSlashMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % BLOCK_TYPES.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + BLOCK_TYPES.length) % BLOCK_TYPES.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const selectedType = BLOCK_TYPES[selectedIndex].type;
        onConvert?.(selectedType);
        setShowSlashMenu(false);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashMenu(false);
      }
    } else {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onInsertBelow?.("paragraph");
      } else if (e.key === "Backspace" && value === "") {
        e.preventDefault();
        onRemove();
      }
    }
  };

  // Custom Inline Editors
  const renderInlineEditor = () => {
    const data = block.data ?? {};

    switch (block.type) {
      case "heading": {
        const level = data.level === 4 ? "h4" : data.level === 3 ? "h3" : "h2";
        const cls = {
          h2: "font-display text-2xl font-semibold mt-12 w-full bg-transparent border-0 border-b border-dashed border-line focus:border-pen outline-none p-0 resize-none text-ink",
          h3: "font-display text-xl font-semibold mt-10 w-full bg-transparent border-0 border-b border-dashed border-line focus:border-pen outline-none p-0 resize-none text-ink",
          h4: "text-lg font-semibold mt-8 w-full bg-transparent border-0 border-b border-dashed border-line focus:border-pen outline-none p-0 resize-none text-ink",
        }[level];

        return (
          <div className="relative w-full">
            <AutoResizingTextarea
              value={data.text ?? ""}
              placeholder="Type your heading..."
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleTextKeyDown}
              active={active}
              className={cls}
            />
            {showSlashMenu && renderSlashMenu()}
          </div>
        );
      }

      case "paragraph": {
        return (
          <div className="relative w-full">
            <AutoResizingTextarea
              value={data.text ?? ""}
              placeholder="Write a paragraph. Inline markdown is supported..."
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleTextKeyDown}
              active={active}
              className="w-full bg-transparent border-0 border-b border-dashed border-line focus:border-pen outline-none p-0 font-body text-base text-ink resize-none leading-relaxed"
            />
            {showSlashMenu && renderSlashMenu()}
          </div>
        );
      }

      case "quote": {
        return (
          <div className="my-2 border-l-[3px] border-hl py-1 pl-5 space-y-2 relative">
            <AutoResizingTextarea
              value={data.text ?? ""}
              placeholder="Enter quote..."
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleTextKeyDown}
              active={active}
              className="w-full bg-transparent border-0 border-b border-dashed border-line focus:border-pen outline-none p-0 font-display text-lg italic leading-relaxed text-ink resize-none"
            />
            {showSlashMenu && renderSlashMenu()}
            <input
              type="text"
              value={data.source ?? ""}
              placeholder="— Source / Attribution"
              onChange={(e) => onChange({ ...data, source: e.target.value })}
              className="w-full bg-transparent border-0 border-b border-dashed border-line focus:border-pen outline-none p-0 font-hand text-lg text-faint"
            />
          </div>
        );
      }

      case "image": {
        // The picture is already on screen via the renderer above; what is
        // missing once it lands is the two lines that describe it. Offered
        // here rather than only behind the settings button, because "add a
        // caption" should not require finding a gear icon.
        return (
          <div className="mt-3 space-y-2 border-t border-dashed border-line pt-3">
            <input
              type="text"
              value={data.caption ?? ""}
              onChange={(e) => onChange({ ...data, caption: e.target.value })}
              placeholder="Add caption"
              className="w-full border-0 border-b border-dashed border-line bg-transparent p-0 pb-1 text-base text-ink outline-none transition-colors focus:border-pen"
            />
            <input
              type="text"
              value={data.alt ?? ""}
              onChange={(e) => onChange({ ...data, alt: e.target.value })}
              placeholder="Add description (for screen readers)"
              className="w-full border-0 border-b border-dashed border-line bg-transparent p-0 pb-1 text-base text-soft outline-none transition-colors focus:border-pen"
            />
          </div>
        );
      }

      case "button": {
        return (
          <div className="inline-flex items-center gap-2 rounded bg-hl px-4 py-2 text-hl-ink">
            <input
              type="text"
              value={data.label ?? ""}
              placeholder="Button Label"
              onChange={(e) => onChange({ ...data, label: e.target.value })}
              className="bg-transparent border-0 border-b border-dashed border-hl-ink focus:border-hl-ink outline-none p-0 text-sm font-medium text-hl-ink placeholder:text-hl-ink w-28 text-center"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDrawer();
              }}
              className="text-hl-ink hover:text-hl-ink"
              title="Edit Link & Variant"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
              </svg>
            </button>
          </div>
        );
      }

      default:
        return null;
    }
  };

  const renderSlashMenu = () => {
    return (
      <div className="absolute left-0 top-full mt-1 z-30 w-56 rounded-lg border border-line bg-raise p-1 shadow-lift backdrop-blur max-h-60 overflow-y-auto">
        <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wider text-faint border-b border-line mb-1">
          Turn into block...
        </div>
        {BLOCK_TYPES.map((item, idx) => {
          const isSelected = idx === selectedIndex;
          return (
            <button
              key={item.type}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConvert?.(item.type);
                setShowSlashMenu(false);
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full text-left flex items-center gap-2.5 px-2.5 py-1.5 rounded transition-colors ${
                isSelected
                  ? "bg-pen-soft text-pen font-semibold"
                  : "text-soft hover:bg-bg-card-hover hover:text-ink"
              }`}
            >
              <span className={isSelected ? "text-pen" : "text-faint"}>
                {getBlockIcon(item.type)}
              </span>
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Reorder.Item
      value={block}
      dragListener={false}
      dragControls={dragControls}
      data-block-lift
      onDragStart={() => {
        setLifted(true);
        onDragStart?.();
      }}
      onDragEnd={() => {
        setLifted(false);
        onDragEnd?.();
      }}
      // While a block is off the ground it has to sit above its neighbours, or
      // the one it is passing over is drawn on top of it.
      style={{ position: "relative", zIndex: lifted ? 30 : undefined }}
      animate={
        lifted
          ? { scale: 1.02, boxShadow: "var(--shadow-lift)" }
          : { scale: 1, boxShadow: "0px 0px 0px rgba(0,0,0,0)" }
      }
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      className="relative group/block my-1"
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
        /*
          A block is the writing, not a card containing the writing.

          Every block used to carry a border box and, when selected, a shadow
          as well, so a document of ten blocks read as ten stacked panels. Now
          nothing is drawn around a block at rest; selection is a rail in the
          left gutter and a barely-there wash, which is enough to answer "which
          one am I in" without competing with the words for attention.
        */
        className={`relative -mx-3 cursor-pointer rounded-md px-3 py-1.5 transition-colors duration-fast ${
          lifted
            ? "bg-raise"
            : active
              ? "bg-raise"
              : "sm:hover:bg-raise"
        }`}
      >
        {/* Absolutely positioned rather than a left border: a border would be
            2px the layout has to find, so every block would step sideways as
            selection moved down the document. */}
        {(active || lifted) && (
          <span
            aria-hidden
            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-hl"
          />
        )}
        {/*
          The block's controls, twice, for the two input methods.

          `floating` is the desktop pill: hover, or selected. `inline` is the
          phone's row underneath, shown only for the selected block — a pill
          hanging over the text at thumb size would cover the words being
          edited, and a row under every block is what made the canvas unreadable.
        */}
        <BlockControls
          variant="floating"
          active={active}
          onAddBelow={onAddBelow}
          dragControls={dragControls}
          hasDrawerConfig={hasDrawerConfig}
          onActivate={onActivate}
          onOpenDrawer={onOpenDrawer}
          onMove={onMove}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />

        {/* Content Render/Editor switcher */}
        {active && ["heading", "paragraph", "quote", "button"].includes(block.type) ? (
          <div onClick={(e) => e.stopPropagation()}>{renderInlineEditor()}</div>
        ) : stashedPhotos.length > 0 ? (
          /* The block's media is still a Blob on this device, so the normal
             renderer would draw an empty frame. Show the clip/photo itself, and say
             plainly that the site has not got it yet. */
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            {stashedPhotos.map((ref) =>
              block.type === "loop-clip" ? (
                <PendingClip key={ref} clipRef={ref} />
              ) : (
                <PendingPhoto key={ref} photoRef={ref} />
              )
            )}
          </div>
        ) : (
          <BlockPreview type={block.type} data={block.data} />
        )}

        {active && block.type === "image" && (
          <div onClick={(e) => e.stopPropagation()}>{renderInlineEditor()}</div>
        )}

        <BlockControls
          variant="inline"
          active={active}
          onAddBelow={onAddBelow}
          dragControls={dragControls}
          hasDrawerConfig={hasDrawerConfig}
          onActivate={onActivate}
          onOpenDrawer={onOpenDrawer}
          onMove={onMove}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />
      </div>
    </Reorder.Item>
  );
}


interface BlockControlsProps {
  variant: "floating" | "inline";
  active: boolean;
  dragControls: ReturnType<typeof useDragControls>;
  hasDrawerConfig: boolean;
  onActivate: () => void;
  onOpenDrawer: () => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate?: () => void;
  onRemove: () => void;
  onAddBelow?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

/**
 * Move / duplicate / settings / delete for one block.
 *
 * `floating` is the desktop pill that appears on hover and, now, whenever the
 * block is selected. Below `sm` it turns into a row underneath the selected
 * block: 44px targets in a pill hanging over the text would cover the words
 * being edited, which is the one thing a block toolbar must not do.
 */
function BlockControls({
  variant,
  active,
  dragControls,
  hasDrawerConfig,
  onActivate,
  onOpenDrawer,
  onMove,
  onDuplicate,
  onRemove,
  onAddBelow,
  canMoveUp,
  canMoveDown,
}: BlockControlsProps) {
  const button =
    "flex min-h-11 min-w-11 items-center justify-center rounded text-faint transition-colors lg:min-h-0 lg:min-w-0 lg:p-1";

  const stop = (run: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    run();
  };

  const buttons = (
    <>
      {/* One grip for both, rather than a desktop-only one. A mouse press on
          it starts the drag immediately; a finger has to hold. It used to be
          `hidden sm:flex`, which meant the phone — the device this studio is
          for — had no way to drag a block at all. */}
      <BlockDragGrip dragControls={dragControls} className="lg:h-9 lg:w-9" />

      <button
        type="button"
        onClick={stop(() => onMove(-1))}
        disabled={!canMoveUp}
        aria-label="Move this block up"
        className={`${button} hover:text-ink disabled:pointer-events-none disabled:opacity-30`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <button
        type="button"
        onClick={stop(() => onMove(1))}
        disabled={!canMoveDown}
        aria-label="Move this block down"
        className={`${button} hover:text-ink disabled:pointer-events-none disabled:opacity-30`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <button
        type="button"
        onClick={stop(() => onDuplicate?.())}
        aria-label="Duplicate this block"
        className={`${button} hover:text-pen`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>

      {hasDrawerConfig && (
        <button
          type="button"
          onClick={stop(() => {
            onActivate();
            onOpenDrawer();
          })}
          aria-label="Block settings"
          className={`${button} hover:text-pen`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {onAddBelow && (
        <button
          type="button"
          onClick={stop(onAddBelow)}
          aria-label="Add a block after this one"
          className={`${button} hover:text-pen`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      <button
        type="button"
        onClick={stop(onRemove)}
        aria-label="Delete this block"
        className={`${button} hover:text-red`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </>
  );

  // Phone: a row under the block, and only under the one you are in.
  //
  // It used to be under every block, so that the grip — the only way to drag —
  // was always within reach. The cost turned out to be the whole canvas: seven
  // icons and a rule under every paragraph is not a document you can read, and
  // on a phone you are reading the document far more often than you are
  // reordering it. Selecting a block is the tap you were already making to
  // edit it, so reordering now shares that tap instead of charging every other
  // block for it.
  if (variant === "inline") {
    if (!active) return null;
    return (
      <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-line pt-1.5 lg:hidden">
        {buttons}
      </div>
    );
  }

  // Pointer: the familiar floating pill, on hover or while selected.
  return (
    <div
      className={`absolute -top-3.5 right-2 z-20 items-center gap-1 rounded-full border border-line bg-raise px-2 py-0.5 shadow-card backdrop-blur transition-all ${
        active ? "hidden lg:flex" : "hidden lg:group-hover/block:flex"
      }`}
    >
      {buttons}
    </div>
  );
}
