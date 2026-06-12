import { Pic } from "../cld-image";
import { Prose, ProseInline } from "../prose";
import { Button, NoteDivider } from "../ui";
import { YouTubeFacade } from "../youtube-facade";
import { CustomBlock } from "../lab/registry";
import { fileSrc } from "@/lib/cloudinary";
import { parseEmbed } from "@/lib/embed";
import { cn } from "@/lib/utils";
import type { Block, BlockType } from "@/lib/types";
import type { ReactNode } from "react";

/* ─────────────────────────────────────────────────────────
   Block engine renderer: map type → component.
   Adding a block type = one entry here + one in
   components/admin/block-editors.tsx.
   ───────────────────────────────────────────────────────── */

export type BlockFC = (props: { data: Record<string, any> }) => JSX.Element | null;

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

const ImageBlock: BlockFC = ({ data }) => (
  <figure className="!max-w-none">
    <div className="overflow-hidden rounded-md border border-line shadow-card">
      <Pic
        src={data.public_id ?? data.src}
        alt={data.alt ?? ""}
        width={data.width ?? 1600}
        height={data.height ?? 1000}
        sizes="(max-width: 900px) 100vw, 860px"
        className="w-full"
      />
    </div>
    {data.caption && (
      <figcaption className="mt-2 font-hand text-lg text-faint">{data.caption}</figcaption>
    )}
  </figure>
);

const GalleryBlock: BlockFC = ({ data }) => {
  const items: any[] = data.items ?? [];
  const columns = data.layout === "columns";
  return (
    <div
      className={cn(
        "!max-w-none grid gap-4",
        columns ? "sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
      )}
    >
      {items.map((item, i) => (
        <figure key={i}>
          <div className="overflow-hidden rounded border border-line">
            <Pic
              src={item.public_id ?? item.src}
              alt={item.alt ?? ""}
              width={900}
              height={columns ? 506 : 1200}
              sizes="(max-width: 640px) 50vw, 33vw"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          {item.caption && (
            <figcaption className="mt-1.5 font-hand text-base text-faint">{item.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
};

const YouTubeBlock: BlockFC = ({ data }) => (
  <div className="!max-w-none">
    <YouTubeFacade youtubeId={data.youtube_id} caption={data.caption} />
  </div>
);

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

const LinkBlock: BlockFC = ({ data }) => (
  <a
    href={data.url}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex items-center gap-4 rounded-md border border-line bg-surface p-4 shadow-card transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-lift"
  >
    {data.thumbnail && (
      <div className="hidden h-16 w-24 shrink-0 overflow-hidden rounded sm:block">
        <Pic src={data.thumbnail} alt="" width={192} height={128} className="h-full w-full object-cover" />
      </div>
    )}
    <div className="min-w-0">
      <p className="truncate font-medium text-ink transition-colors group-hover:text-pen">{data.title ?? data.url}</p>
      {data.description && <p className="mt-0.5 line-clamp-2 text-sm text-soft">{data.description}</p>}
      <p className="mt-1 truncate text-xs text-faint">{data.url}</p>
    </div>
  </a>
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
  embed: EmbedBlock,
  quote: QuoteBlock,
  divider: DividerBlock,
  code: CodeBlock,
  button: ButtonBlock,
  link: LinkBlock,
  file: FileBlock,
  custom: ({ data }) => <CustomBlock component={data.component} props={data.props} />,
};

export function getBlockLayoutClasses(type: BlockType, data: Record<string, any>) {
  const isText = ["paragraph", "heading", "quote", "markdown", "button"].includes(type);
  const width = (data.width as string) || "prose";
  const spacing = (data.spacing as string) || "medium";

  // Width mapping
  const widthCls = (
    {
      prose: "max-w-prose mx-auto w-full px-5",
      wide: "max-w-content mx-auto w-full px-5 sm:px-8",
      full: "max-w-none w-full",
    } as Record<string, string>
  )[width] ?? "max-w-prose mx-auto w-full px-5";

  // Spacing mapping
  const spacingCls = (
    {
      none: "py-0",
      small: "py-2 sm:py-3.5",
      medium: "py-4 sm:py-7",
      large: "py-8 sm:py-16",
    } as Record<string, string>
  )[spacing] ?? "py-4 sm:py-7";

  return cn(widthCls, spacingCls);
}

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
            <div key={block.id} className={getBlockLayoutClasses(block.type, block.data ?? {})}>
              <Renderer data={block.data ?? {}} />
            </div>
          );
        })}
    </div>
  );
}
