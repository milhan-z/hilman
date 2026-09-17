"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { LAYOUT_CHOICES, selectedLayoutValue } from "@/lib/media-layouts";
import type { BlockType } from "@/lib/types";

/**
 * Choosing how a media block is presented.
 *
 * ── why not a <Select> ──
 *
 * Every other control in this drawer is a dropdown, and for "Medium margin" or
 * "language: ts" that is right — the words are the whole meaning. These are not
 * words. "Accordion" and "Stack" mean nothing until you have seen one, and the
 * difference between them is entirely visual. A dropdown would make the author
 * pick blind, read the result, and go back; a row of small pictures lets them
 * pick the shape they already have in mind.
 *
 * The diagrams are deliberately crude — grey bars, no photographs. They say
 * *which arrangement*, and the canvas behind the drawer says what it actually
 * looks like with the author's own images in it, live, the moment they choose.
 * Two accurate previews of the same thing would be one too many.
 *
 * ── it is radio buttons ──
 *
 * Real `<input type="radio">`, visually hidden under the tiles. That is not
 * pedantry: it buys arrow-key movement between options, Space to select, a
 * focus ring that lands in the right place, correct announcement as "Carousel,
 * radio button, 2 of 4", and the grouping semantics of `<fieldset>` — all of
 * which a row of `<button>`s would have to reimplement, usually incompletely.
 *
 * ── choosing is not publishing ──
 *
 * This calls `onChange`, exactly like typing in a caption does. The block
 * becomes an unsaved change in the draft and nothing reaches the live site
 * until the author publishes deliberately.
 */
export function LayoutPicker({
  type,
  data,
  onChange,
}: {
  type: BlockType;
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
}) {
  const name = useId();
  const choices = LAYOUT_CHOICES[type];
  if (!choices) return null;

  const selected = selectedLayoutValue(type, data);
  const detail = choices.find((choice) => choice.value === selected)?.detail;

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-ink">Presentation</legend>

      {/* Scrolls at 390px rather than squashing five tiles into a phone;
          wraps once there is room for them. */}
      <div
        className={cn(
          "-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {choices.map((choice) => {
          const isSelected = choice.value === selected;
          return (
            <label
              key={choice.value}
              className={cn(
                // 4.5rem so that four tiles — every type except image — fit
                // across a 375px phone without the last one being clipped by a
                // few pixels, which reads as breakage rather than as a hint
                // that the row scrolls. Image's five still scroll, obviously.
                "relative flex w-[4.5rem] shrink-0 snap-start cursor-pointer flex-col items-center gap-1.5",
                "rounded-md border bg-raise px-1.5 py-2 transition-colors",
                isSelected ? "border-pen" : "border-line hover:border-line-strong",
                // The ring follows the hidden input's focus, so a keyboard user
                // can see where they are while arrowing along the row.
                "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-pen"
              )}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={isSelected}
                onChange={() => onChange({ ...data, layout: choice.value })}
                // `onChange` alone is not enough for one case. A gallery still
                // holding the legacy `"columns"` shows Grid as selected —
                // because it is one — so clicking Grid changes nothing and
                // fires nothing, leaving the author unable to reach the
                // three-up grid the tile is describing. Writing the value on
                // click as well fixes that; for every other tile it sets the
                // key to what it already is.
                onClick={() => onChange({ ...data, layout: choice.value })}
                className="sr-only"
              />
              <LayoutGlyph type={type} value={choice.value} active={isSelected} />
              <span
                className={cn(
                  "text-center text-2xs leading-tight",
                  isSelected ? "font-medium text-ink" : "text-soft"
                )}
              >
                {choice.label}
              </span>
            </label>
          );
        })}
      </div>

      {/* One line, for whichever is chosen. Repeating it under all five tiles
          would triple the height of the control to say the same thing. */}
      {detail && <p className="mt-1 text-xs text-faint">{detail}</p>}
    </fieldset>
  );
}

/* ── the diagrams ──────────────────────────────────────────

   Schematic, not representative: enough to recognise an arrangement, small
   enough that five fit across a phone. Each one draws inside a fixed 44×30
   box so the tiles line up regardless of which shape is inside.
   ──────────────────────────────────────────────────────── */

function LayoutGlyph({
  type,
  value,
  active,
}: {
  type: BlockType;
  value: string;
  active: boolean;
}) {
  // One fill for every part of every diagram: the accent when chosen, a grey
  // that reads as "picture" when not.
  const fill = active ? "bg-pen" : "bg-line-strong";
  const frame = active ? "border-pen" : "border-line-strong";

  return (
    <span className="flex h-[30px] w-[44px] items-center justify-center" aria-hidden>
      {glyph(`${type}:${value}`, fill, frame)}
    </span>
  );
}

function glyph(key: string, fill: string, frame: string) {
  switch (key) {
    /* ── image ── */
    case "image:default":
    case "youtube:default":
    case "loop-clip:default":
      return <span className={cn("h-[22px] w-[32px] rounded-sm", fill)} />;

    case "image:full":
      return <span className={cn("h-[24px] w-[44px] rounded-sm", fill)} />;

    case "image:polaroid":
      return (
        <span
          className={cn("flex w-[30px] flex-col gap-[3px] rounded-sm border bg-paper p-[3px] pb-[7px]", frame)}
          style={{ transform: "rotate(-4deg)" }}
        >
          <span className={cn("h-[15px] w-full rounded-[1px]", fill)} />
        </span>
      );

    /* ── frames shared by image and loop clip ── */
    case "image:browser":
    case "loop-clip:browser":
      return (
        <span className={cn("w-[38px] overflow-hidden rounded-sm border bg-paper", frame)}>
          <span className={cn("flex h-[5px] items-center gap-[2px] border-b px-[3px]", frame)}>
            <span className={cn("h-[2px] w-[2px] rounded-full", fill)} />
            <span className={cn("h-[2px] w-[2px] rounded-full", fill)} />
          </span>
          <span className={cn("block h-[17px] w-full", fill)} />
        </span>
      );

    case "image:phone":
    case "loop-clip:phone":
      return (
        <span className={cn("w-[17px] overflow-hidden rounded border p-[2px] pt-[4px]", frame)}>
          <span className={cn("block h-[22px] w-full rounded-[1px]", fill)} />
        </span>
      );

    case "loop-clip:floating":
      return (
        <span className="relative flex h-full w-[34px] items-center justify-center">
          <span className={cn("h-[20px] w-[30px] rounded-sm", fill)} />
          {/* The cast shadow is the whole idea of this one. */}
          <span className="absolute bottom-[1px] h-[3px] w-[22px] rounded-full bg-line" />
        </span>
      );

    /* ── gallery ── */
    case "gallery:grid":
      return (
        <span className="grid w-[38px] grid-cols-3 gap-[3px]">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={cn("h-[9px] rounded-[1px]", fill)} />
          ))}
        </span>
      );

    case "gallery:carousel":
      return (
        <span className="flex w-[44px] items-center justify-center gap-[3px] overflow-hidden">
          {/* The clipped neighbours are what distinguishes it from Default. */}
          <span className={cn("h-[14px] w-[5px] shrink-0 rounded-[1px] bg-line")} />
          <span className={cn("h-[22px] w-[24px] shrink-0 rounded-sm", fill)} />
          <span className={cn("h-[14px] w-[5px] shrink-0 rounded-[1px] bg-line")} />
        </span>
      );

    case "gallery:stack":
      return (
        <span className="relative h-[26px] w-[32px]">
          {[
            { rotate: -7, x: 0, y: 0 },
            { rotate: 4, x: 3, y: 2 },
            { rotate: -2, x: 1, y: 4 },
          ].map((card, i) => (
            <span
              key={i}
              className={cn(
                "absolute left-0 top-0 h-[18px] w-[26px] rounded-[2px] border border-paper",
                i === 2 ? fill : "bg-line"
              )}
              style={{ transform: `translate(${card.x}px, ${card.y}px) rotate(${card.rotate}deg)` }}
            />
          ))}
        </span>
      );

    case "gallery:accordion":
      return (
        <span className="flex w-[38px] items-stretch gap-[2px]">
          <span className={cn("h-[24px] flex-[3] rounded-[2px]", fill)} />
          <span className="h-[24px] flex-1 rounded-[2px] bg-line" />
          <span className="h-[24px] flex-1 rounded-[2px] bg-line" />
          <span className="h-[24px] flex-1 rounded-[2px] bg-line" />
        </span>
      );

    /* ── youtube ── */
    case "youtube:cinema":
      return (
        <span className="flex h-[26px] w-[44px] items-center justify-center rounded-sm bg-n-800">
          <span className={cn("h-[15px] w-[30px] rounded-[1px]", fill)} />
        </span>
      );

    default:
      // A layout with no diagram yet still gets a tile rather than a hole.
      return <span className={cn("h-[22px] w-[32px] rounded-sm", fill)} />;
  }
}
