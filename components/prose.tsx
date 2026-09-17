import { marked } from "marked";
import { sanitizeStudioHtml } from "@/lib/studio-html";
import { cn } from "@/lib/utils";

/**
 * Markdown, rendered.
 *
 * This used to note that content is owner-authored through a single-user CMS
 * and could therefore be treated as trusted. That was true while the only way
 * to fill a Markdown block was to type into one.
 *
 * It stopped being true when the studio learned to import documents. Markdown
 * pasted from a chat, a file or a web page can carry raw HTML — `marked`
 * passes it through untouched, by design — so "the owner pasted it" is now the
 * strongest claim available, and that is not the same as "the owner wrote it".
 *
 * Both functions therefore run their output through the same allowlist the
 * Custom HTML block uses. Ordinary markup survives; scripts, styles, frames
 * and event handlers do not. These are server components, so this is real
 * server-side sanitisation rather than a courtesy performed in the author's
 * browser.
 */
export function Prose({ md, className }: { md: string; className?: string }) {
  const html = sanitizeStudioHtml(marked.parse(md, { async: false }) as string);
  return <div className={cn("prose-h", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Inline markdown (bold/italic/links) for paragraph blocks. */
export function ProseInline({ text, className }: { text: string; className?: string }) {
  const html = sanitizeStudioHtml(marked.parseInline(text, { async: false }) as string);
  return <p className={cn("prose-h", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
