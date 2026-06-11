import { marked } from "marked";
import { cn } from "@/lib/utils";

/**
 * Markdown renderer. Content is owner-authored via the single-user CMS,
 * so it is treated as trusted (no third-party UGC flows through here).
 */
export function Prose({ md, className }: { md: string; className?: string }) {
  const html = marked.parse(md, { async: false }) as string;
  return <div className={cn("prose-h", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Inline markdown (bold/italic/links) for paragraph blocks. */
export function ProseInline({ text, className }: { text: string; className?: string }) {
  const html = marked.parseInline(text, { async: false }) as string;
  return <p className={cn("prose-h", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
