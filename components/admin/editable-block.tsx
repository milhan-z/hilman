"use client";

import { useRef, useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { BlockDragGrip } from "./mobile/block-drag-grip";
import { collectPendingRefs } from "@/lib/studio-media-refs";
import { PendingPhoto } from "./pending-media";
import { renderers } from "../blocks/renderer";
import { BLOCK_TYPES } from "./block-editors";
import type { Block, BlockType } from "@/lib/types";

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
  const blockRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation & slash menu states
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Close active state when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (blockRef.current && !blockRef.current.contains(e.target as Node)) {
        // We let the parent container handle deactivation if needed
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
              className="bg-transparent border-0 border-b border-dashed border-hl-ink/40 focus:border-hl-ink outline-none p-0 text-sm font-medium text-hl-ink placeholder:text-hl-ink/50 w-28 text-center"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDrawer();
              }}
              className="text-hl-ink/70 hover:text-hl-ink"
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

  const Renderer = renderers[block.type];

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
        ref={blockRef}
        onClick={(e) => {
          e.stopPropagation();
          onActivate();
        }}
        className={`relative rounded-lg p-3 -m-3 border transition-all duration-fast cursor-pointer ${
          lifted
            ? "border-pen bg-raise"
            : active
              ? "border-pen bg-raise shadow-card"
              : "border-transparent hover:border-line-strong hover:bg-raise/30"
        }`}
      >
        {/*
          The block's controls.

          They used to exist only inside `group-hover:flex`, which on a phone
          means they do not exist at all: there is no hover, so moving,
          duplicating or deleting a block was unreachable by touch. They now
          appear when the block is tapped as well — and on a small screen they
          sit in the flow underneath it rather than floating over the text you
          are editing, at a size a thumb can actually hit.
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
          /* The block's picture is still a Blob on this device, so the normal
             renderer would draw an empty frame. Show the photo itself, and say
             plainly that the site has not got it yet. */
          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
            {stashedPhotos.map((ref) => (
              <PendingPhoto key={ref} photoRef={ref} />
            ))}
          </div>
        ) : Renderer ? (
          <Renderer data={block.data ?? {}} />
        ) : (
          <div className="text-xs text-faint italic">Unknown block type: {block.type}</div>
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
 * block is selected. Below `sm` it turns into a row underneath the block:
 * 44px targets in a pill hanging over the text would cover the words being
 * edited, which is the one thing a block toolbar must not do.
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
    "flex min-h-11 min-w-11 items-center justify-center rounded text-faint transition-colors sm:min-h-0 sm:min-w-0 sm:p-1";

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
      <BlockDragGrip dragControls={dragControls} className="sm:h-9 sm:w-9" />

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

  // Phone: a row under the block. Always present, not only once the block has
  // been tapped — the grip is how you move a block, and having to select one
  // first would mean a tap before every drag.
  if (variant === "inline") {
    return (
      <div
        className={`mt-3 flex items-center justify-end gap-1 border-t pt-2 transition-colors sm:hidden ${
          active ? "border-line" : "border-line/40"
        }`}
      >
        {buttons}
      </div>
    );
  }

  // Pointer: the familiar floating pill, on hover or while selected.
  return (
    <div
      className={`absolute -top-3.5 right-2 z-20 items-center gap-1 rounded-full border border-line bg-raise/95 px-2 py-0.5 shadow-card backdrop-blur transition-all ${
        active ? "hidden sm:flex" : "hidden sm:group-hover/block:flex"
      }`}
    >
      {buttons}
    </div>
  );
}
