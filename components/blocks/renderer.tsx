import { Pic } from "../cld-image";
import { Prose, ProseInline } from "../prose";
import { Button, NoteDivider } from "../ui";
import { YouTubeFacade } from "../youtube-facade";
import { LoopClipFacade } from "../loop-clip-facade";
import { CustomBlock } from "../lab/registry";
import { fileSrc } from "@/lib/cloudinary";
import { parseEmbed } from "@/lib/embed";
import { sanitizeStudioHtml } from "@/lib/studio-html";
import { blockLayoutClasses, pixelDimension } from "@/lib/block-layout";
import {
  LEGACY_GALLERY_LAYOUT,
  resolveGalleryLayout,
  resolveImageLayout,
  resolveLoopClipLayout,
  resolveYouTubeLayout,
} from "@/lib/media-layouts";
import { ImagePresentation } from "./image-layouts";
import { GalleryGrid } from "./gallery/grid";
import { GalleryCarousel } from "./gallery/carousel";
import { GalleryStack } from "./gallery/stack";
import { GalleryAccordion } from "./gallery/accordion";
import { galleryItems } from "./gallery/shared";
import { LinkCard } from "./link-card";
import { resolveLinkPresentation } from "@/lib/links";
import { cn } from "@/lib/utils";
import type { Block, BlockType } from "@/lib/types";
import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
   Block engine renderer: map type → component.
   Adding a block type = one entry here + one in
   components/admin/block-editors.tsx.
   ───────────────────────────────────────────────────────── */

export type BlockFC = (props: { data: Record<string, any> }) => React.JSX.Element | null;

const HeadingBlock: BlockFC = ({ data }) => {
  const level = data.level === 4 ? "h4" : data.level === 3 ? "h3" : "h2";
  const cls = {
    h2: "font-display text-2xl font-semibold mt-12",
    h3: "font-display text-xl font-semibold mt-10",
    h4: "text-lg font-semibold mt-8",
  }[level];
  const H = level as any;
  return <H className={cls}>{data.text}</H>;
};

const ParagraphBlock: BlockFC = ({ data }) => <ProseInline text={data.text ?? ""} />;

const MarkdownBlock: BlockFC = ({ data }) => <Prose md={data.md ?? ""} />;

/**
 * `data.layout` picks the framing; the default is what every published image
 * already looks like. An unknown value resolves to that default rather than
 * falling through to nothing — see resolveImageLayout().
 */
const ImageBlock: BlockFC = ({ data }) => (
  <ImagePresentation layout={resolveImageLayout(data)} data={data} />
);

/**
 * Four presentations of the same list of photographs.
 *
 * Each one is its own component rather than a branch inside this function:
 * the carousel owns a scroll position, the accordion owns a selection, and
 * neither of those belongs in a switch statement next to a static grid.
 *
 * `"columns"` is the legacy two-up value, still in the database and still
 * meaning what it meant. Anything unrecognised becomes a grid.
 */
const GalleryBlock: BlockFC = ({ data }) => {
  const items = galleryItems(data);
  if (items.length === 0) return null;

  switch (resolveGalleryLayout(data)) {
    case "carousel":
      return <GalleryCarousel items={items} />;
    case "stack":
      return <GalleryStack items={items} />;
    case "accordion":
      return <GalleryAccordion items={items} />;
    case LEGACY_GALLERY_LAYOUT:
      return <GalleryGrid items={items} columns />;
    case "grid":
    default:
      return <GalleryGrid items={items} />;
  }
};

/**
 * The embed is untouched — same facade, same id handling, same click-to-load.
 * Cinema only changes what surrounds it: a dark, wider field so the video is
 * the lit thing on the page.
 */
const YouTubeBlock: BlockFC = ({ data }) => {
  if (resolveYouTubeLayout(data) === "cinema") {
    return (
      <div className="!max-w-none rounded-lg bg-n-900 px-3 py-4 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-4xl">
          <YouTubeFacade youtubeId={data.youtube_id} caption={data.caption} />
        </div>
      </div>
    );
  }
  return (
    <div className="!max-w-none">
      <YouTubeFacade youtubeId={data.youtube_id} caption={data.caption} />
    </div>
  );
};

/**
 * A short, silent, looping clip — the studio's answer to "I want a GIF here".
 *
 * `data.src` is either a finished https URL or, briefly, a `pending:`
 * placeholder while the file is still uploading. The second case should never
 * reach the public renderer — publish is held back while any block still
 * names one (see hasPendingRefs() in lib/studio-media-refs.ts) — but the
 * check costs one line and means a bug upstream renders nothing instead of a
 * broken <video src="pending:..."> tag.
 *
 * autoplay/muted/loop/playsInline are not settings; they are what this block
 * *is*. A clip that only plays on tap or that has sound is a Video block, not
 * a Loop Clip — see BLOCK_HINTS in lib/types.ts.
 */
const LoopClipBlock: BlockFC = ({ data }) => {
  const src = String(data.src ?? "");
  if (!src || src.startsWith("pending:")) return null;
  return (
    <LoopClipFacade
      src={src}
      caption={data.caption}
      fit={data.fit === "contain" ? "contain" : "cover"}
      layout={resolveLoopClipLayout(data)}
    />
  );
};

const EmbedBlock: BlockFC = ({ data }) => {
  // Accepts a bare URL or a full <iframe> snippet (Figma/CodePen/maps/…).
  // Owner-authored content via the CMS, so no sandbox — maximises compatibility.
  const { src, ratio } = parseEmbed(data.url);
  if (!src) return null;
  const fixedHeight = typeof data.height === "number" ? data.height : null;
  return (
    <div className="!max-w-none overflow-hidden rounded-md border border-line bg-n-100">
      <iframe
        src={src}
        title={data.provider ? `${data.provider} embed` : "Embedded content"}
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={cn("w-full border-0", !fixedHeight && !ratio && "aspect-video")}
        style={fixedHeight ? { height: fixedHeight } : ratio ? { aspectRatio: String(ratio) } : undefined}
      />
    </div>
  );
};

const QuoteBlock: BlockFC = ({ data }) => (
  <blockquote className="my-2 border-l-[3px] border-hl py-1 pl-5">
    <p className="font-display text-xl italic leading-relaxed text-ink">“{data.text}”</p>
    {data.source && <cite className="mt-2 block font-hand text-lg not-italic text-faint">— {data.source}</cite>}
  </blockquote>
);

const DividerBlock: BlockFC = ({ data }) => <NoteDivider style={data.style ?? "line"} />;

const CodeBlock: BlockFC = ({ data }) => (
  <div className="!max-w-none">
    {data.language && (
      <span className="mb-[-1px] inline-block rounded-t border border-b-0 border-line bg-surface px-3 py-1 font-mono text-2xs uppercase tracking-wider text-faint">
        {data.language}
      </span>
    )}
    <pre className="overflow-x-auto rounded-md rounded-tl-none border border-line bg-[#1c1813] p-5 text-sm leading-relaxed text-[#f1ede2]">
      <code>{data.code}</code>
    </pre>
  </div>
);

const ButtonBlock: BlockFC = ({ data }) => (
  <div>
    <Button href={data.href} variant={data.variant === "ghost" ? "ghost" : "pen"}>
      {data.label}
    </Button>
  </div>
);

/**
 * A destination, presented as a card.
 *
 * `presentation` is additive in exactly the way `layout` is on the media
 * blocks: absent means the default card, which is what every Link block
 * written before this existed renders as. See lib/links.ts.
 */
const LinkBlock: BlockFC = ({ data }) => (
  <LinkCard data={data} presentation={resolveLinkPresentation(data)} />
);

const FileBlock: BlockFC = ({ data }) => {
  const href = fileSrc(data.public_id ?? data.src) ?? "#";
  const kb = data.size ? `${Math.round(data.size / 1024)} KB` : null;
  return (
    <a
      href={href}
      download
      className="group inline-flex items-center gap-3 rounded-md border border-dashed border-line-strong bg-surface px-4 py-3 transition-colors duration-fast hover:border-pen"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--pen)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
      <span className="text-sm font-medium group-hover:text-pen">{data.filename ?? "Download"}</span>
      {kb && <span className="text-xs text-faint">{kb}</span>}
    </a>
  );
};

export const renderers: Record<BlockType, BlockFC> = {
  heading: HeadingBlock,
  paragraph: ParagraphBlock,
  markdown: MarkdownBlock,
  image: ImageBlock,
  gallery: GalleryBlock,
  youtube: YouTubeBlock,
  "loop-clip": LoopClipBlock,
  embed: EmbedBlock,
  quote: QuoteBlock,
  divider: DividerBlock,
  code: CodeBlock,
  button: ButtonBlock,
  link: LinkBlock,
  file: FileBlock,
  /**
   * Markup the owner pasted, rendered after being put through the allowlist.
   *
   * Sanitised here as well as at the point it was stored. Storage-time
   * sanitising is what actually protects the site; this second pass covers
   * rows written before that existed, and means the public page cannot be made
   * to execute anything even if something malformed reached the database by
   * another route.
   */
  html: ({ data }) => {
    const clean = sanitizeStudioHtml(String(data.html ?? ""));
    if (!clean.trim()) return <></>;
    return (
      <div
        className="prose-h my-6 max-w-none"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  },
  custom: ({ data }) => <CustomBlock component={data.component} props={data.props} />,
};

/*
   The span and spacing tables moved to lib/block-layout.ts, where they can be
   tested without a DOM and where the one comment explaining why `span` is not
   called `width` sits next to the code it explains.

   The `type` argument went with them: it only ever fed an `isText` local that
   nothing read.
*/

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  if (!blocks?.length) return null;
  return (
    <div className="flex flex-col w-full">
      {blocks
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((block) => {
          const Renderer = renderers[block.type];
          if (!Renderer) return null;
          return (
            <div key={block.id} id={`block-${block.id}`} className={cn("scroll-mt-24", blockLayoutClasses(block.data, block.type))}>
              <Renderer data={block.data ?? {}} />
            </div>
          );
        })}
    </div>
  );
}
