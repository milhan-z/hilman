import type { ReactNode } from "react";
import { HandDrawnReveal } from "@/components/bits/hand-drawn-reveal";
import { Pic } from "@/components/cld-image";
import { Button } from "@/components/ui";
import { mediaSrc } from "@/lib/cloudinary";

/**
 * About's first screen, in the style of Hilman's old About Me page and filled
 * with the notebook's own About, each thing said once. It is the top of the
 * sheet of linen paper that app/(site)/about/page.tsx lays on the page; the
 * rest of About is written further down the same sheet.
 *
 * On the left, a card clipped over the sheet's top-left corner: the photo (cut out, on a yellow
 * block), the greeting with "Hilman." signed in red, the introduction, the
 * things he gravitates towards in the old page's boxed style, and the way
 * on. Under it, his story in handwriting, ending on his note in red. On the
 * right, where his curiosity goes and his work experience, each under a
 * marker.
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
  focus,
  roles,
}: {
  /** A cut-out stands on the yellow block; a plain portrait fills it. */
  photo: { src: string; alt: string; cutout: boolean } | null;
  caption?: string;
  lede?: string;
  interests: string[];
  story: string[];
  note?: string;
  focus: string[];
  roles: AboutRole[];
}) {
  const intro = lede ? afterGreeting(lede) : "";

  return (
    <section aria-labelledby="about-hello" className="grid text-cream-ink lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        {/* The card, clipped on over the sheet's top-left corner. */}
        <div className="relative z-10 -mt-8 sm:-mx-4 sm:-mt-10 lg:-ml-5 lg:mr-0 xl:-ml-8">
          <div className="relative rotate-[-0.6deg] bg-cream p-4 shadow-lift sm:flex sm:-rotate-1 sm:gap-6 sm:p-5">
            <Paperclip className="absolute -top-11 left-12 z-20 h-24 w-auto -rotate-3 sm:left-16" />
            {photo && (
              <figure className="mx-auto w-full max-w-[18rem] sm:mx-0 sm:w-[42%] sm:max-w-none sm:shrink-0 lg:w-[40%]">
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
          <div className="px-6 pb-4 pt-10 sm:px-10 lg:pb-6 lg:pl-12 lg:pr-4 lg:pt-12">
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

      {(focus.length > 0 || roles.length > 0) && (
        <div className="min-w-0 space-y-12 px-6 pb-4 pt-10 sm:px-10 lg:pb-6 lg:pl-6 lg:pr-12 lg:pt-16">
          {focus.length > 0 && (
            <div>
              <Marked id="focus-heading">Where my curiosity goes</Marked>
              <ul aria-labelledby="focus-heading" className="mt-6 space-y-3">
                {focus.map((item, index) => (
                  <li key={index} className="flex items-baseline gap-3 text-lg leading-snug">
                    <span aria-hidden className="text-cream-red">↗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
        </div>
      )}
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

/**
 * A heading with the marker pressed flat behind it, as on the old page. The
 * marker is one stroke under the heading's last line, so the heading keeps to
 * one line: where its column is narrow (a phone, a small laptop) its size
 * follows the screen.
 */
function Marked({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="relative isolate inline-block px-1 font-body text-[clamp(1.1rem,5.9vw,1.85rem)] font-bold leading-tight tracking-[-0.03em] sm:text-[2.1rem] lg:text-[clamp(1.6rem,2.6vw,2.1rem)]">
      <span aria-hidden className="absolute -inset-x-2 bottom-[0.06em] -z-10">
        <HandDrawnReveal variant="marker" tone="hl" trigger="view" delay={120} />
      </span>
      {children}
    </h3>
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
