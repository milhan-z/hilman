import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ════════════════════════════════════════════════════════════
   Hilman. UI primitives — the stationery kit.
   Three tools carry meaning: ink pen (blue), highlighter (yellow),
   red pen (red). Everything else is paper, rule, and tab.
   ════════════════════════════════════════════════════════════ */

/* ── Button ──────────────────────────────────────────────── */

const buttonVariants = {
  pen: "bg-hl text-hl-ink hover:brightness-[0.97] shadow-card hover:shadow-glow", // primary — yellow marker
  ghost: "border border-line-strong text-ink hover:border-pen hover:text-pen",
  hl: "bg-hl text-hl-ink hover:brightness-[0.97] shadow-card hover:shadow-glow",
  red: "bg-red text-[#220603] hover:brightness-110 shadow-card",
} as const;

export function Button({
  href,
  variant = "pen",
  className,
  children,
  ...rest
}: {
  href?: string;
  variant?: keyof typeof buttonVariants;
  className?: string;
  children: ReactNode;
} & Record<string, any>) {
  const cls = cn(
    "group inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium",
    "transition-all duration-base ease-out active:translate-y-px",
    buttonVariants[variant],
    className
  );
  if (href) {
    const external = href.startsWith("http") || href.startsWith("mailto:");
    if (external)
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={cls} {...rest}>
          {children}
        </a>
      );
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}

/* ── Inline ink-pen link (the "→ next" pattern) ──────────── */

export function ArrowLink({
  href,
  children,
  className,
  back = false,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  back?: boolean;
}) {
  const arrow = back ? "←" : "→";
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-1.5 text-sm font-medium text-pen underline-offset-4 hover:underline",
        className
      )}
    >
      {back && <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">{arrow}</span>}
      {children}
      {!back && <span aria-hidden className="transition-transform group-hover:translate-x-0.5">{arrow}</span>}
    </Link>
  );
}

/* ── Tag — a filed catalog keyword ───────────────────────── */

export function Tag({
  children,
  href,
  active = false,
}: {
  children: ReactNode;
  href?: string;
  active?: boolean;
}) {
  const cls = cn(
    "inline-flex items-center rounded-[4px] border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast",
    active
      ? "border-transparent bg-hl text-hl-ink font-semibold"
      : "border-line-strong text-soft hover:border-pen hover:text-pen"
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return <span className={cls}>{children}</span>;
}

/* ── Entry metadata — the mono ledger strip ──────────────── */

export function EntryMeta({
  items,
  className,
}: {
  items: (string | null | undefined)[];
  className?: string;
}) {
  const clean = items.filter(Boolean) as string[];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-2xs uppercase tracking-wider text-faint tnum",
        className
      )}
    >
      {clean.map((item, i) => (
        <span key={i} className="flex items-center gap-2.5">
          {i > 0 && <span aria-hidden className="text-line-strong">/</span>}
          {item}
        </span>
      ))}
    </div>
  );
}

/* ── Kicker — hand-written page eyebrow ──────────────────── */

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-hand text-xl leading-none text-faint", className)}>{children}</p>
  );
}

/* ── Notebook bits ───────────────────────────────────────── */

export function Marginalia({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-hand text-lg leading-none text-red", className)}>{children}</span>
  );
}

export function StickyNote({
  children,
  color = "yellow",
  className,
}: {
  children: ReactNode;
  color?: "yellow" | "blue" | "red";
  className?: string;
}) {
  // sticky notes are physical paper objects — fixed bright colours, theme-independent
  const colors = {
    yellow: "bg-[#f5c518] text-[#2a2208]",
    blue: "bg-[#18d9b4] text-[#06231d]",
    red: "bg-[#ff6b5b] text-[#2c0a06]",
  };
  return (
    <div
      className={cn(
        "tab-corner rotate-[-1.5deg] rounded-sm p-4 font-hand text-lg leading-snug shadow-sticky",
        colors[color],
        className
      )}
    >
      {children}
    </div>
  );
}

/* ── Archival rubber stamp — featured / status mark ──────── */

export function Stamp({
  children,
  tone = "hl",
  className,
}: {
  children: ReactNode;
  tone?: "hl" | "red" | "pen";
  className?: string;
}) {
  const tones = {
    hl: "border-hl text-hl-ink bg-hl",
    red: "border-red text-red",
    pen: "border-pen text-pen",
  };
  return (
    <span
      className={cn(
        "inline-flex select-none items-center gap-1 rounded-[3px] border-[1.5px] px-1.5 py-0.5 font-mono text-2xs font-bold uppercase tracking-widest",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function NoteDivider({ style = "line" }: { style?: "line" | "dots" | "scribble" }) {
  if (style === "dots")
    return (
      <div aria-hidden className="my-10 flex justify-center gap-3 text-line-strong">
        <span>•</span>
        <span>•</span>
        <span>•</span>
      </div>
    );
  if (style === "scribble")
    return (
      <svg aria-hidden viewBox="0 0 120 12" className="mx-auto my-10 h-3 w-28 text-line-strong">
        <path
          d="M2 8 Q 12 2, 22 8 T 42 8 T 62 8 T 82 8 T 102 8 T 118 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  return <hr aria-hidden className="my-10 border-t border-dashed border-line-strong" />;
}

/* ── Section heading — numbered, sitting on a ruled baseline ─ */

export function SectionHeading({
  index,
  title,
  hint,
  href,
  hrefLabel,
}: {
  index: string;
  title: string;
  hint?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="rule-baseline mb-8 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex items-end gap-3">
        <span className="font-mono text-sm font-semibold text-pen tnum" aria-hidden>
          {index}
        </span>
        <h2 className="font-display text-2xl font-semibold leading-none tracking-tight">{title}</h2>
        {hint && <span className="hidden font-hand text-lg text-red sm:inline">{hint}</span>}
      </div>
      {href && hrefLabel && (
        <ArrowLink href={href} className="pb-0.5">
          {hrefLabel}
        </ArrowLink>
      )}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────── */

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="dotgrid rounded-lg border border-dashed border-line-strong p-12 text-center">
      <p className="font-display text-lg text-soft">{title}</p>
      {hint && <p className="mt-2 font-hand text-lg text-faint">{hint}</p>}
    </div>
  );
}
