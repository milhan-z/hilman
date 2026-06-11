import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/* ── Button ────────────────────────────────────────────── */

const buttonVariants = {
  pen: "bg-pen text-white hover:opacity-90",
  ghost: "border border-line-strong text-ink hover:border-pen hover:text-pen",
  hl: "bg-hl text-hl-ink hover:brightness-95",
  red: "bg-red text-white hover:opacity-90",
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
    "inline-flex min-h-[44px] items-center justify-center gap-2 rounded px-5 py-2.5 text-sm font-medium transition-all duration-base ease-out",
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

/* ── Tag chip ──────────────────────────────────────────── */

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
    "inline-flex items-center rounded-full border px-3 py-1 text-xs transition-colors duration-fast",
    active
      ? "border-transparent bg-hl text-hl-ink font-medium"
      : "border-line text-soft hover:border-pen hover:text-pen"
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return <span className={cls}>{children}</span>;
}

/* ── Notebook bits ─────────────────────────────────────── */

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
  const colors = {
    yellow: "bg-hl text-hl-ink",
    blue: "bg-pen-soft text-ink",
    red: "bg-red-soft text-ink",
  };
  return (
    <div
      className={cn(
        "tab-corner rotate-[-1deg] rounded-sm p-4 font-hand text-lg shadow-sticky",
        colors[color],
        className
      )}
    >
      {children}
    </div>
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

/* ── Section heading with index tab ───────────────────── */

export function SectionHeading({
  index,
  title,
  hint,
}: {
  index: string;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-8 flex items-baseline gap-3">
      <span className="font-hand text-lg text-faint" aria-hidden>
        {index}
      </span>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {hint && <span className="hidden font-hand text-lg text-red sm:inline">{hint}</span>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="dotgrid rounded-lg border border-dashed border-line-strong p-10 text-center">
      <p className="font-display text-lg text-soft">{title}</p>
      {hint && <p className="mt-2 font-hand text-lg text-faint">{hint}</p>}
    </div>
  );
}
