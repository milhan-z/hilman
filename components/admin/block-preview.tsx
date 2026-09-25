import { renderers } from "../blocks/renderer";
import type { BlockType } from "@/lib/types";

/**
 * One block, drawn by the public renderer exactly as the page will draw it.
 *
 * Its own module so the editor can fetch it rather than import it: the
 * renderer's paragraph and Markdown blocks bring marked, and those and the
 * Custom HTML block put their markup through lib/studio-html.ts — which is
 * sanitize-html, postcss and an HTML parser. See the preview in
 * editable-block.tsx for how that is kept off the editor's first download
 * without changing what the canvas shows.
 */
export function BlockPreview({ type, data }: { type: BlockType; data?: Record<string, any> | null }) {
  const Renderer = renderers[type];
  return Renderer ? (
    <Renderer data={data ?? {}} />
  ) : (
    <div className="text-xs text-faint italic">Unknown block type: {type}</div>
  );
}
