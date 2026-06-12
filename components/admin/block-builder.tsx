"use client";

import { useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { BLOCK_TYPES, BlockEditorFields, DEFAULT_DATA, blockSummary } from "./block-editors";
import { Select } from "./fields";
import { uid } from "@/lib/utils";
import type { Block, BlockType } from "@/lib/types";

/**
 * Block builder — drag to reorder, click to expand & edit.
 * Pure client state; the parent form serializes `value` into a hidden input.
 */
export function BlockBuilder({
  value,
  onChange,
}: {
  value: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  const [newType, setNewType] = useState<BlockType>("paragraph");
  const [openId, setOpenId] = useState<string | null>(null);

  function add() {
    const block: Block = {
      id: `new-${uid()}`,
      type: newType,
      position: value.length,
      data: structuredClone(DEFAULT_DATA[newType]),
    };
    onChange([...value, block]);
    setOpenId(block.id);
  }

  function update(id: string, data: Record<string, any>) {
    onChange(value.map((b) => (b.id === id ? { ...b, data } : b)));
  }

  function remove(id: string) {
    onChange(value.filter((b) => b.id !== id));
  }

  function move(id: string, dir: -1 | 1) {
    const i = value.findIndex((b) => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div>
      <Reorder.Group axis="y" values={value} onReorder={onChange} className="space-y-2">
        {value.map((block) => (
          <BlockRow
            key={block.id}
            block={block}
            open={openId === block.id}
            onToggle={() => setOpenId(openId === block.id ? null : block.id)}
            onChange={(data) => update(block.id, data)}
            onRemove={() => remove(block.id)}
            onMove={(dir) => move(block.id, dir)}
          />
        ))}
      </Reorder.Group>

      {value.length === 0 && (
        <p className="rounded border border-dashed border-line-strong p-6 text-center text-sm text-faint">
          No blocks yet — add the first one below.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Select
          value={newType}
          onChange={(e) => setNewType(e.target.value as BlockType)}
          aria-label="Block type to add"
          className="max-w-[220px]"
        >
          {BLOCK_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </Select>
        <button
          type="button"
          onClick={add}
          className="inline-flex min-h-[44px] items-center rounded bg-hl px-4 text-sm font-medium text-hl-ink transition-opacity hover:opacity-90"
        >
          + Add block
        </button>
      </div>
    </div>
  );
}

function BlockRow({
  block,
  open,
  onToggle,
  onChange,
  onRemove,
  onMove,
}: {
  block: Block;
  open: boolean;
  onToggle: () => void;
  onChange: (data: Record<string, any>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const controls = useDragControls();
  const label = BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? block.type;

  return (
    <Reorder.Item
      value={block}
      dragListener={false}
      dragControls={controls}
      className="rounded-lg border border-line bg-surface"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-label="Drag to reorder"
          onPointerDown={(e) => controls.start(e)}
          className="cursor-grab touch-none rounded p-2 text-faint hover:text-ink active:cursor-grabbing"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="8" cy="5" r="2" /><circle cx="16" cy="5" r="2" />
            <circle cx="8" cy="12" r="2" /><circle cx="16" cy="12" r="2" />
            <circle cx="8" cy="19" r="2" /><circle cx="16" cy="19" r="2" />
          </svg>
        </button>
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 py-1 text-left">
          <span className="shrink-0 rounded-sm bg-pen-soft px-2 py-0.5 text-2xs font-medium uppercase tracking-wider text-pen">
            {label}
          </span>
          <span className="truncate text-sm text-soft">{blockSummary(block.type, block.data)}</span>
        </button>
        <div className="flex shrink-0 items-center">
          <button type="button" aria-label="Move up" onClick={() => onMove(-1)} className="rounded p-2 text-faint hover:text-ink">↑</button>
          <button type="button" aria-label="Move down" onClick={() => onMove(1)} className="rounded p-2 text-faint hover:text-ink">↓</button>
          <button type="button" aria-label={`Delete ${label} block`} onClick={onRemove} className="rounded p-2 text-faint hover:text-red">✕</button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line p-4">
          <BlockEditorFields type={block.type} data={block.data} onChange={onChange} />
        </div>
      )}
    </Reorder.Item>
  );
}
