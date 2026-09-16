import { ListSkeleton } from "@/components/admin/mobile/route-skeleton";

export default function Loading() {
  return <ListSkeleton title="Messages" rows={4} search={false} />;
}
