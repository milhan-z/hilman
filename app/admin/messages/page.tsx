import { deleteMessage } from "../actions";
import { createServerSupabase } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function AdminMessagesPage() {
  const supabase = createServerSupabase();
  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold">Messages</h1>
      <p className="mt-1 text-sm text-soft">Notes left through the Connect form.</p>
      <ul className="mt-6 space-y-4">
        {(messages ?? []).map((m) => (
          <li key={m.id} className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                {m.name}{" "}
                <a href={`mailto:${m.email}`} className="ml-1 text-sm font-normal text-pen hover:underline">
                  {m.email}
                </a>
              </p>
              <span className="text-xs text-faint">{formatDate(m.created_at)}</span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-soft">{m.body}</p>
            <form
              className="mt-4"
              action={async () => {
                "use server";
                await deleteMessage(m.id);
              }}
            >
              <button className="text-xs text-red underline-offset-4 hover:underline">Delete</button>
            </form>
          </li>
        ))}
        {(messages ?? []).length === 0 && (
          <li className="rounded-lg border border-dashed border-line-strong p-10 text-center text-sm text-faint">
            No messages yet — the inbox is patient.
          </li>
        )}
      </ul>
    </div>
  );
}
