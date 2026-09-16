import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { MessageCard, type InboxMessage } from "@/components/admin/message-card";
import type { MessageStatus } from "@/app/admin/actions";

const FILTERS: { key: string; label: string; statuses: MessageStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["new", "read"] },
  { key: "actioned", label: "Followed up", statuses: ["actioned"] },
  { key: "archived", label: "Archived", statuses: ["archived"] },
  { key: "all", label: "All", statuses: ["new", "read", "actioned", "archived"] },
];

export default async function AdminMessagesPage(
  props: {
    searchParams: Promise<{ view?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const active = FILTERS.find((f) => f.key === searchParams.view) ?? FILTERS[0];

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false });

  const all = (data ?? []) as InboxMessage[];
  // Rows written before migration 0003 have no status — treat them as new.
  const withStatus = all.map((m) => ({ ...m, status: (m.status ?? "new") as MessageStatus }));
  const messages = withStatus.filter((m) => active.statuses.includes(m.status as MessageStatus));

  const counts = Object.fromEntries(
    FILTERS.map((f) => [f.key, withStatus.filter((m) => f.statuses.includes(m.status as MessageStatus)).length])
  );

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold">Messages</h1>
      <p className="mt-1 text-sm text-soft">
        Notes left through the Connect form. Archiving keeps a message; deleting destroys it.
      </p>

      {error && (
        <p role="alert" className="mt-5 rounded border border-red/40 bg-red-soft/10 p-4 text-sm text-red">
          Could not read the inbox: {error.message}
        </p>
      )}

      <nav aria-label="Filter messages" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "open" ? "/admin/messages" : `/admin/messages?view=${f.key}`}
            aria-current={f.key === active.key ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              f.key === active.key
                ? "bg-ink text-paper"
                : "border border-line text-soft hover:border-pen hover:text-pen"
            }`}
          >
            {f.label}
            <span className="ml-1.5 tnum text-xs opacity-70">{counts[f.key] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <ul className="mt-6 space-y-4">
        {messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}
        {messages.length === 0 && !error && (
          <li className="rounded-lg border border-dashed border-line-strong p-10 text-center text-sm text-soft">
            {withStatus.length === 0
              ? "No messages yet — the inbox is patient."
              : `Nothing in “${active.label}”.`}
          </li>
        )}
      </ul>
    </div>
  );
}
