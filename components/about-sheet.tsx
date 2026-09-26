import type { CSSProperties, ReactNode } from "react";
import { HandDrawnReveal } from "@/components/bits/hand-drawn-reveal";
import { Pic } from "@/components/cld-image";
import { mediaSrc } from "@/lib/cloudinary";
import { classifyLink, linkAttrs } from "@/lib/links";

/**
 * About's first screen, drawn after Hilman's old About Me page: a card
 * clipped to a sheet of linen paper. The card holds the photo — cut out, on a
 * yellow block — the name with its last word signed in red, a summary and
 * the contacts. The sheet holds the rest in the same places the old page kept
 * them: red handwritten details and a handwritten paragraph under the card,
 * the work experience and the software beside it.
 *
 * A server component, like the page: it ships no JavaScript. The two
 * highlighted headings are HandDrawnReveal's marker, which waits for the
 * screen through InView like every other line in the notebook.
 */

export type AboutRole = { year?: string; text: string; place?: string };

/** The card and the sheet, from the About page's resolved content. */
export function AboutSheet({
  name,
  summary,
  photo,
  caption,
  email,
  instagram,
  phone,
  details,
  interests,
  note,
  roles,
  tools,
}: {
  name: string;
  summary?: string;
  /** A cut-out stands on the yellow block; a plain portrait fills it. */
  photo: { src: string; alt: string; cutout: boolean } | null;
  caption?: string;
  email?: string;
  instagram?: string;
  phone?: string;
  details: string[];
  interests: string[];
  note?: string;
  roles: AboutRole[];
  tools: string[];
}) {
  const contacts = contactLinks({ email, instagram, phone });
  // The last word is signed in red, and never parted from the one before it.
  const words = name.trim().split(/\s+/).filter(Boolean);
  const signed = words.length > 1 ? words.pop() : undefined;
  const beside = signed ? words.pop() : undefined;
  const handwritten = [...details, ...(interests.length ? [`Interests: ${interests.join(" · ")}`] : [])];

  return (
    <section aria-labelledby="about-name" className="paper-linen relative mt-14 rounded-[3px] text-cream-ink shadow-lift sm:mt-16 lg:mt-20">
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
              {/* Sized by its own column (cqi), so the name keeps to one
                  line on a card that is narrower at some widths than a
                  phone's. */}
              <div className="min-w-0 pt-6 [container-type:inline-size] sm:flex-1 sm:pt-7">
                <h2 id="about-name" className="font-body text-[clamp(2.1rem,15.5cqi,2.75rem)] font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-[clamp(2.1rem,15.5cqi,3.25rem)]">
                  {words.join(" ")}
                  {words.length > 0 && signed && " "}
                  {signed && (
                    <span className="whitespace-nowrap">
                      {beside}{" "}
                      <span className="relative -ml-[0.42em] inline-block -rotate-6 translate-y-[0.32em] font-hand text-[0.82em] font-bold tracking-normal text-cream-red">
                        {signed}
                      </span>
                    </span>
                  )}
                </h2>
                {summary && <p className="mt-7 max-w-md text-[0.95rem] leading-relaxed text-cream-soft">{summary}</p>}
                {contacts.length > 0 && (
                  <div className="mt-5 border-2 border-cream-ink px-4 py-3">
                    <h3 className="text-[0.95rem] font-bold tracking-tight">Contact &amp; Social Media</h3>
                    <ul className="mt-1 text-sm">
                      {contacts.map((contact) => (
                        <li key={contact.kind}>
                          <a
                            href={contact.href}
                            {...linkAttrs(classifyLink(contact.href))}
                            className="group inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream-ink sm:min-h-9"
                          >
                            <ContactIcon kind={contact.kind} />
                            <span className="sr-only">{contact.label}: </span>
                            <span className="truncate underline decoration-cream-line underline-offset-4 transition-colors duration-fast group-hover:decoration-cream-ink">
                              {contact.text}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {(handwritten.length > 0 || note) && (
            <div className="px-6 pb-4 pt-10 sm:px-10 lg:pb-14 lg:pl-12 lg:pr-4 lg:pt-12">
              {handwritten.length > 0 && (
                <ul className="space-y-1 font-hand text-[1.45rem] font-semibold leading-snug text-cream-red sm:text-[1.6rem] lg:text-[1.4rem]">
                  {handwritten.map((line, index) => <li key={index}>{line}</li>)}
                </ul>
              )}
              {note && (
                <p className={`${handwritten.length ? "mt-8" : ""} max-w-[36rem] whitespace-pre-line font-hand text-[1.35rem] leading-[1.75] text-cream-ink sm:text-[1.45rem]`}>
                  {note}
                </p>
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

/* ── contacts ─────────────────────────────────────────────── */

type ContactKind = "email" | "whatsapp" | "instagram";
type Contact = { kind: ContactKind; label: string; text: string; href: string };

/**
 * The card's contacts, each checked before it becomes a link: an address
 * that is not one, or a handle with a space in it, is left off rather than
 * sent somewhere wrong. The number is written as it was typed and dialled
 * through WhatsApp, as the old page did.
 */
export function contactLinks({ email, instagram, phone }: { email?: string; instagram?: string; phone?: string }): Contact[] {
  const out: Contact[] = [];
  const address = email?.trim();
  if (address && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    out.push({ kind: "email", label: "Email", text: address, href: `mailto:${address}` });
  }
  const number = phone?.trim();
  const digits = number?.replace(/\D/g, "").replace(/^0/, "62");
  if (number && digits && digits.length >= 8) {
    out.push({ kind: "whatsapp", label: "WhatsApp", text: number, href: `https://wa.me/${digits}` });
  }
  const handle = instagram
    ?.trim()
    .replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  if (handle && /^[A-Za-z0-9._]{1,30}$/.test(handle)) {
    out.push({ kind: "instagram", label: "Instagram", text: `@${handle}`, href: `https://www.instagram.com/${handle}/` });
  }
  return out;
}

function ContactIcon({ kind }: { kind: ContactKind }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "shrink-0" } as const;
  if (kind === "email") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="1.5" />
        <path d="m3.5 6 8.5 7 8.5-7" />
      </svg>
    );
  }
  if (kind === "whatsapp") {
    return (
      <svg {...common}>
        <path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.7z" />
        <path d="M9.2 8.6c.3-.6.9-.6 1.1 0l.6 1.4c.1.3 0 .6-.2.8l-.5.5a5.6 5.6 0 0 0 2.6 2.6l.5-.5c.2-.2.5-.3.8-.2l1.4.6c.6.2.6.8 0 1.1-1 .7-2.3.6-3.6-.1a8.4 8.4 0 0 1-2.9-2.9c-.7-1.3-.8-2.6-.1-3.6z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.9" />
      <circle cx="17.1" cy="6.9" r="0.6" fill="currentColor" stroke="none" />
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
