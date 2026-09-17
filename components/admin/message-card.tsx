"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMessage, setMessageStatus, type MessageStatus } from "@/app/admin/actions";
import { formatDate } from "@/lib/utils";

/**
 * One message, with a lifecycle.
 *
 * The dashboard used to offer a single "Dismiss Message" button that deleted
 * the row. Handling a message and destroying it are different intentions, so
 * they are now different buttons — and the destructive one asks first.
 */

export interface InboxMessage {
  id: string;
  name: string;
  email: string;
  body: string;
  created_at: string;
  status?: MessageStatus | null;
  handled_at?: string | null;
}

const STATUS_LABEL: Record<MessageStatus, string> = {
  new: "New",
  read: "Read",
  actioned: "Followed up",
  archived: "Archived",
};

const STATUS_STYLE: Record<MessageStatus, string> = {
  new: "bg-hl text-hl-ink",
  read: "bg-n-200 text-ink",
  actioned: "bg-pen-soft text-pen",
  archived: "bg-n-100 text-soft",
};

export function StatusPill({ status }: { status: MessageStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function MessageCard({
  message,
  compact = false,
}: {
  message: InboxMessage;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const status: MessageStatus = (message.status as MessageStatus) ?? "new";

  function move(to: MessageStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setMessageStatus(message.id, to);
      if (res.status === "error") setError(res.message ?? "Could not update this message.");
      else router.refresh();
    });
  }

  function destroy() {
    setError(null);
    startTransition(async () => {
      const res = await deleteMessage(message.id);
      if (res.status === "error") setError(res.message ?? "Could not delete this message.");
      else router.refresh();
    });
  }

  const replySubject = encodeURIComponent(`Re: your note via hilman.`);
  const mailto = `mailto:${message.email}?subject=${replySubject}`;
  const action =
    "rounded border border-line px-2.5 py-1.5 text-xs text-soft transition-colors hover:border-pen hover:text-pen disabled:opacity-50";

  return (
    <li
      className={`rounded-lg border bg-surface shadow-card ${
        status === "new" ? "border-hl" : "border-line"
      } ${compact ? "p-3" : "p-5"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className={compact ? "text-xs font-semibold" : "font-medium"}>
          {message.name}{" "}
          <a
            href={mailto}
            className="ml-1 text-sm font-normal text-pen underline-offset-4 hover:underline"
          >
            {message.email}
          </a>
        </p>
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          <span className="text-xs text-soft">{formatDate(message.created_at)}</span>
        </div>
      </div>

      <p
        className={`mt-3 whitespace-pre-wrap leading-relaxed text-soft ${
          compact ? "line-clamp-3 text-xs" : "text-sm"
        }`}
      >
        {message.body}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a href={mailto} className={`${action} no-underline`}>
          Reply by email ↗
        </a>
        {status === "new" && (
          <button type="button" className={action} disabled={pending} onClick={() => move("read")}>
            Mark read
          </button>
        )}
        {status !== "actioned" && (
          <button
            type="button"
            className={action}
            disabled={pending}
            onClick={() => move("actioned")}
          >
            Mark followed up
          </button>
        )}
        {status !== "archived" ? (
          <button
            type="button"
            className={action}
            disabled={pending}
            onClick={() => move("archived")}
          >
            Archive
          </button>
        ) : (
          <button type="button" className={action} disabled={pending} onClick={() => move("read")}>
            Unarchive
          </button>
        )}
        <button
          type="button"
          className="ml-auto rounded border border-line px-2.5 py-1.5 text-xs text-red transition-colors hover:border-red disabled:opacity-50"
          disabled={pending}
          onClick={() => setConfirming(true)}
        >
          Delete permanently
        </button>
      </div>

      {confirming && (
        <div className="mt-3 rounded border border-red bg-red-soft p-3 text-xs">
          <p className="font-semibold text-red">
            Delete this message from {message.name} for good?
          </p>
          <p className="mt-1 text-soft">
            It cannot be recovered. Archiving keeps it out of the way without destroying it.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={destroy}
              disabled={pending}
              className="rounded bg-red px-2.5 py-1 font-semibold text-[#220603] disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border border-line px-2.5 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-red">
          {error}
        </p>
      )}
    </li>
  );
}
