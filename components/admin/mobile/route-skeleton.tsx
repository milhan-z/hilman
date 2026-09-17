/**
 * What a screen looks like before its data arrives.
 *
 * Deliberately not a spinner. A spinner says "something is happening
 * somewhere"; a skeleton in the shape of the destination says "you are on the
 * Projects screen and the projects are coming", which is the thing a tap needs
 * to confirm within the first frame.
 *
 * Server components, no "use client": these are prefetched along with the
 * route, so they have to cost nothing to render.
 */

function Bar({ w, h = "h-4" }: { w: string; h?: string }) {
  return <div aria-hidden className={`${h} ${w} rounded bg-line`} />;
}

/** The pulse is one animation on the wrapper, not one per bar. */
function Pulse({ children }: { children: React.ReactNode }) {
  return <div className="animate-pulse motion-reduce:animate-none">{children}</div>;
}

export function ListSkeleton({
  title,
  rows = 5,
  search = true,
}: {
  title: string;
  rows?: number;
  search?: boolean;
}) {
  return (
    <div className="max-w-6xl space-y-4">
      <h1 className="font-display text-2xl font-bold">{title}</h1>
      <Pulse>
        <div className="space-y-4">
          {search && <div aria-hidden className="h-12 rounded-md bg-line" />}
          <div className="flex gap-2">
            <Bar w="w-16" h="h-9" />
            <Bar w="w-20" h="h-9" />
            <Bar w="w-16" h="h-9" />
          </div>
          <ul className="space-y-2.5">
            {Array.from({ length: rows }, (_, index) => (
              <li
                key={index}
                className="space-y-2 rounded-lg border border-line bg-surface p-4"
                // Later rows matter less; fading them stops the page reading as
                // a wall of grey bars.
                style={{ opacity: 1 - index * 0.13 }}
              >
                <Bar w="w-2/3" h="h-5" />
                <Bar w="w-1/3" h="h-3" />
              </li>
            ))}
          </ul>
        </div>
      </Pulse>
      <p className="sr-only" role="status">
        Loading {title.toLowerCase()}…
      </p>
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <div className="max-w-6xl space-y-6">
      <Pulse>
        <div className="space-y-6">
          <div className="space-y-2">
            <Bar w="w-48" h="h-7" />
            <Bar w="w-32" h="h-4" />
          </div>
          <div className="h-[76px] rounded-lg border border-line bg-surface" />
          <div className="grid grid-cols-2 gap-2.5">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-[68px] rounded-lg border border-line bg-surface" />
            ))}
          </div>
          <div className="space-y-2.5">
            <Bar w="w-24" h="h-4" />
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="h-14 rounded-lg border border-line bg-surface" />
            ))}
          </div>
        </div>
      </Pulse>
      <p className="sr-only" role="status">
        Loading the studio…
      </p>
    </div>
  );
}

export function EditorSkeleton() {
  return (
    <div className="space-y-4">
      <Pulse>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Bar w="w-8" h="h-8" />
            <Bar w="w-40" h="h-5" />
          </div>
          <Bar w="w-28" h="h-3" />
          <div className="h-12 rounded-md border border-line bg-surface" />
          <div className="space-y-3 rounded-lg border border-line bg-surface p-5">
            <Bar w="w-3/4" h="h-8" />
            <Bar w="w-1/2" h="h-4" />
            <div className="pt-4" />
            <Bar w="w-full" h="h-4" />
            <Bar w="w-full" h="h-4" />
            <Bar w="w-4/5" h="h-4" />
          </div>
        </div>
      </Pulse>
      <p className="sr-only" role="status">
        Opening the editor…
      </p>
    </div>
  );
}
