import { ListSkeleton, Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div>
      <Shimmer className="h-8 w-48" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Shimmer key={i} className="h-24" />
        ))}
      </div>
      <ListSkeleton count={3} />
    </div>
  );
}
