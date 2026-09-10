import { CardGridSkeleton, HeaderSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-wide px-5 py-14 sm:px-8">
      <HeaderSkeleton />
      <CardGridSkeleton />
    </div>
  );
}
