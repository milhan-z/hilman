/**
 * Route-level placeholders.
 *
 * Paired with the `loading.tsx` files: Next streams these while the page's data
 * is still in flight, so a navigation paints on the first frame instead of
 * leaving the previous page on screen until the query returns. Shapes match the
 * real layout so nothing jumps when the content swaps in.
 */
import { cn } from "@/lib/utils";

export function Shimmer({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

/** Header block: kicker, title, standfirst. */
export function HeaderSkeleton() {
  return (
    <div className="max-w-2xl">
      <Shimmer className="h-3 w-40" />
      <Shimmer className="mt-4 h-10 w-64" />
      <Shimmer className="mt-6 h-4 w-full" />
      <Shimmer className="mt-2 h-4 w-3/4" />
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-4">
          <Shimmer className="aspect-[4/3] w-full" />
          <Shimmer className="mt-4 h-5 w-2/3" />
          <Shimmer className="mt-2 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mt-10 space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface p-5">
          <Shimmer className="h-3 w-32" />
          <Shimmer className="mt-3 h-6 w-1/2" />
          <Shimmer className="mt-3 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function ArticleSkeleton() {
  return (
    <div className="mx-auto max-w-prose">
      <Shimmer className="h-3 w-32" />
      <Shimmer className="mt-4 h-11 w-4/5" />
      <Shimmer className="mt-6 aspect-[16/9] w-full" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Shimmer key={i} className={cn("h-4", i % 3 === 2 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}
