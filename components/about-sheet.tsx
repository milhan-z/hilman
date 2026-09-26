import type { CSSProperties, ReactNode } from "react";
import { HandDrawnReveal } from "@/components/bits/hand-drawn-reveal";
import { Pic } from "@/components/cld-image";
import { Button } from "@/components/ui";
import { mediaSrc } from "@/lib/cloudinary";

/**
 * About's first screen, in the style of Hilman's old About Me page — a card
 * clipped to a sheet of linen paper — and filled with the notebook's own
 * About: nothing on it is said twice, and nothing is copied from the old
 * page's CV.
 *
 * The card holds the photo (cut out, on a yellow block), the greeting with
 * "Hilman." signed in red, the introduction, the things he gravitates
 * towards in the old page's boxed style, and the way on. The sheet holds his
 * story in handwriting under the card, ending on his note in red, and beside
 * it the work experience and the software.
 *
 * A server component, like the page: it ships no JavaScript. The pen under
 * the signature draws as the page opens; the two highlighted headings are
 * HandDrawnReveal's marker, which waits for the screen through InView.
 */

export type AboutRole = { year?: string; text: string; place?: string };

/** The card and the sheet, from the About page's resolved content. */
export function AboutSheet({
  photo,
  caption,
  lede,
  interests,
  story,
  note,
  roles,
  tools,
}: {
  /** A cut-out stands on the yellow block; a plain portrait fills it. */
  photo: { src: string; alt: string; cutout: boolean } | null;
  caption?: string;
  lede?: string;
  interests: string[];
  story: string[];
  note?: string;
  roles: AboutRole[];
  tools: string[];
}) {
  const intro = lede ? afterGreeting(lede) : "";

  return (
    <section aria-labelledby="about-hello" className="paper-linen relative mt-14 rounded-[3px] text-cream-ink shadow-lift sm:mt-16 lg:mt-20">
      <div className="grid lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {/* The card, clipped on over the sheet's top-left corner. */}
          <div className="relative z-10 -mt-8 sm:-mx-4 sm:-mt-10 lg:-ml-5 lg:mr-0 xl:-ml-8">
            <div className="relative rotate-[-0.6deg] bg-cream p-4 shadow-lift sm:flex sm:-rotate-1 sm:gap-6 sm:p-5">
              <Paperclip className="absolute -top-11 left-12 z-20 h-24 w-auto -rotate-3 sm:left-16" />
              {photo && (
                <figure className="mx-auto w-full max-w-[18rem] sm:mx-0 sm:w-[42%] sm:max-w-none sm:shrink-0">
                  <div className="relative aspect-[4/5] overflow-hidden bg-hl">
                    <Pic
                      src={photo.src}
                      alt={photo.alt}
                      width={592}
                      height={740}
                      sizes="(max-width: 1023px) 296px, 272px"
                      // On the first screen at every width, and the largest
                      // thing on it: the page's LCP.
                      loading="eager"
                      fetchPriority="high"
                      className={`absolute inset-0 h-full w-full ${photo.cutout ? "object-contain object-bottom" : "object-cover"}`}
                    />
                  </div>
                  {caption && <figcaption className="mt-2 text-center font-hand text-lg leading-snug text-cream-soft">{caption}</figcaption>}
                </figure>
              )}
              {/* Sized by its own column (cqi), so the greeting keeps to one
                  line on a card that is narrower at some widths than a
                  phone's. */}
              <div className="min-w-0 pt-6 [container-type:inline-size] sm:flex-1 sm:pt-7">
                <h2 id="about-hello" className="whitespace-nowrap font-body text-[clamp(2rem,14cqi,2.75rem)] font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-[clamp(2rem,14cqi,3.25rem)]">
                  Hi, I&apos;m{" "}
                  <span className="relative inline-block -rotate-3 translate-y-[0.08em] font-hand text-[1.02em] font-bold tracking-normal text-cream-red">
                    Hilman.
                    <span aria-hidden className="absolute -bottom-[0.1em] left-0 right-[4%] overflow-hidden">
                      <HandDrawnReveal variant="underline2" tone="hl" fluid strokeWidth={3} delay={450} />
                    </span>
                  </span>
                </h2>
                {intro && <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-cream-soft sm:text-[1.0625rem]">{intro}</p>}
                {interests.length > 0 && (
                  <div className="mt-5 border-2 border-cream-ink px-4 py-3">
                    <h3 className="text-[0.95rem] font-bold tracking-tight">A few things I gravitate towards</h3>
                    <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 text-sm">
                      {interests.map((interest, index) => (
                        <li key={index} className="flex items-center gap-1.5">
                          <span aria-hidden className="text-cream-red">✦</span>
                          {interest}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button href="/connect">Let&apos;s make something</Button>
                  <Button href="/works" variant="paper">Explore my work</Button>
                </div>
              </div>
            </div>
          </div>

          {(story.length > 0 || note) && (
            <div className="px-6 pb-4 pt-10 sm:px-10 lg:pb-14 lg:pl-12 lg:pr-4 lg:pt-12">
              {story.length > 0 && (
                <div className="max-w-[36rem] space-y-4 font-hand text-[1.35rem] leading-[1.7] text-cream-ink sm:text-[1.45rem]">
                  {story.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
                </div>
              )}
              {note && (
                <p className={`${story.length ? "mt-6" : ""} max-w-[36rem] font-hand text-[1.5rem] font-semibold leading-snug text-cream-red sm:text-[1.6rem]`}>{note}</p>
              )}
            </div>
          )}
        </div>

        {(roles.length > 0 || tools.length > 0) && (
          <div className="min-w-0 space-y-12 px-6 pb-12 pt-10 sm:px-10 lg:pb-14 lg:pl-6 lg:pr-12 lg:pt-16">
            {roles.length > 0 && (
              <div>
                <Marked id="about-experience">Work experience</Marked>
                <ol aria-labelledby="about-experience" className="relative mt-7 space-y-6 pl-8 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:border-l-2 before:border-dashed before:border-cream-soft before:opacity-40">
                  {roles.map((role, index) => (
                    <li key={index}>
                      {role.year && <p className="text-sm italic text-cream-soft">{role.year}</p>}
                      <p className="relative mt-0.5 text-lg font-bold leading-[1.35] tracking-tight">
                        <span aria-hidden className="absolute -left-8 top-[0.675em] h-4 w-4 -translate-y-1/2 rounded-full border-[3px] border-cream-soft bg-cream" />
                        {role.text}
                      </p>
                      {role.place && <p className="mt-0.5 text-[0.95rem] text-cream-soft">{role.place}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {tools.length > 0 && <Software tools={tools} />}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The introduction as it reads under "Hi, I'm Hilman.": an opening "I'm
 * Hilman." has just been said by the greeting, so it is not said again. (The
 * About copy saved before the card existed opens that way.) Anything else is
 * shown as written, and an introduction that was only the name is not shown.
 */
export function afterGreeting(text: string): string {
  const rest = text.replace(/^\s*I['’]m Hilman(?:[.!,]|\s+[—–-])\s*/i, "");
  if (rest === text) return text.trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1).trimEnd();
}

/** A heading with the marker pressed flat behind it, as on the old page. */
function Marked({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="relative isolate inline-block px-1 font-body text-[1.85rem] font-bold leading-tight tracking-[-0.03em] sm:text-[2.1rem]">
      <span aria-hidden className="absolute -inset-x-2 bottom-[0.06em] -z-10">
        <HandDrawnReveal variant="marker" tone="hl" trigger="view" delay={120} />
      </span>
      {children}
    </h3>
  );
}

/* ── software ─────────────────────────────────────────────── */

/** The apps with a tile of their own; anything else is written as a tag. */
const APPS: Record<string, { mark: ReactNode; className: string }> = {
  photoshop: { mark: "Ps", className: "bg-[#001e36] text-[#31a8ff]" },
  illustrator: { mark: "Ai", className: "bg-[#330000] text-[#ff9a00]" },
  "premiere pro": { mark: "Pr", className: "bg-[#00005b] text-[#9999ff]" },
  "after effects": { mark: "Ae", className: "bg-[#00005b] text-[#9999ff]" },
  lightroom: { mark: "Lr", className: "bg-[#001e36] text-[#31a8ff]" },
  "lightroom classic": { mark: "Lr", className: "bg-[#001e36] text-[#31a8ff]" },
  indesign: { mark: "Id", className: "bg-[#49021f] text-[#ff3366]" },
  canva: {
    mark: <span className="font-hand text-[0.72em] font-bold italic">Canva</span>,
    className: "bg-gradient-to-br from-[#00c4cc] via-[#6a5cff] to-[#7d2ae8] text-white",
  },
  figma: { mark: <FigmaMark />, className: "bg-[#0d0d0d]" },
};

/** Cut with scissors, not a die: each tile's edges and tilt are its own. */
const CUTS = [
  { rotate: "-4deg", clipPath: "polygon(3% 0, 100% 4%, 97% 100%, 0 95%)" },
  { rotate: "3deg", clipPath: "polygon(0 3%, 96% 0, 100% 97%, 4% 100%)" },
  { rotate: "-2deg", clipPath: "polygon(2% 2%, 100% 0, 98% 92%, 90% 100%, 0 98%)" },
  { rotate: "4deg", clipPath: "polygon(0 0, 97% 3%, 100% 100%, 3% 96%)" },
  { rotate: "-3deg", clipPath: "polygon(4% 0, 100% 2%, 96% 100%, 0 97%)" },
  { rotate: "2deg", clipPath: "polygon(0 4%, 98% 0, 100% 96%, 2% 100%)" },
  { rotate: "-5deg", clipPath: "polygon(1% 0, 100% 3%, 98% 100%, 0 96%)" },
  { rotate: "3deg", clipPath: "polygon(0 2%, 97% 0, 100% 98%, 3% 100%)" },
] satisfies CSSProperties[];

function appFor(tool: string) {
  return APPS[tool.trim().toLowerCase().replace(/^adobe\s+/, "")];
}

function Software({ tools }: { tools: string[] }) {
  const apps = tools.filter((tool) => appFor(tool));
  const others = tools.filter((tool) => !appFor(tool));
  return (
    <div>
      <Marked id="about-software">Software</Marked>
      {apps.length > 0 && (
        <ul aria-labelledby="about-software" className="mt-7 flex max-w-[18.5rem] flex-wrap gap-x-5 gap-y-4 pl-1 sm:max-w-[20.5rem]">
          {apps.map((tool, index) => {
            const app = appFor(tool)!;
            return (
              <li key={index}>
                <span
                  title={tool}
                  style={CUTS[index % CUTS.length]}
                  className={`flex h-14 w-14 items-center justify-center font-body text-[1.45rem] font-bold tracking-tight sm:h-16 sm:w-16 sm:text-[1.65rem] ${app.className}`}
                >
                  <span aria-hidden>{app.mark}</span>
                  <span className="sr-only">{tool}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {others.length > 0 && (
        <ul aria-label={apps.length ? "More software" : undefined} aria-labelledby={apps.length ? undefined : "about-software"} className="mt-5 flex flex-wrap gap-2">
          {others.map((tool, index) => (
            <li key={index} className="rounded-[4px] border border-cream-line px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-cream-soft">
              {tool}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Figma's mark: five shapes, in its own colours. */
function FigmaMark() {
  return (
    <svg viewBox="0 0 38 57" className="h-[1.3em] w-auto" aria-hidden>
      <path fill="#1abcfe" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
      <path fill="#0acf83" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
      <path fill="#ff7262" d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
      <path fill="#f24e1e" d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
      <path fill="#a259ff" d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
    </svg>
  );
}

/* ── the clip ─────────────────────────────────────────────── */

/** A paperclip: one steel wire bent three times, with light along its top. */
function Paperclip({ className }: { className?: string }) {
  const wire = "M9 24V62a3.5 3.5 0 0 0 7 0V10a6.5 6.5 0 0 0-13 0v56a9 9 0 0 0 18 0V26";
  return (
    <svg viewBox="0 0 24 80" fill="none" aria-hidden className={className}>
      <path d={wire} stroke="#8a9098" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d={wire} stroke="#eef1f4" strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round" transform="translate(-0.4 -0.3)" />
    </svg>
  );
}

/** What the page hands the sheet for its photo, or null when there is none. */
export function aboutPhoto(d: Record<string, any>): { src: string; alt: string; cutout: boolean } | null {
  const alt = typeof d.portrait_alt === "string" && d.portrait_alt.trim() ? d.portrait_alt : "Hilman";
  if (mediaSrc(d.portrait_cutout)) return { src: d.portrait_cutout, alt, cutout: true };
  if (mediaSrc(d.portrait)) return { src: d.portrait, alt, cutout: false };
  return null;
}
