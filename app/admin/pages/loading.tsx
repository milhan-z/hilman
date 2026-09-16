import { ListSkeleton } from "@/components/admin/mobile/route-skeleton";

export default function Loading() {
  return <ListSkeleton title="Pages" rows={3} search={false} />;
}
