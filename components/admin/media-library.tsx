"use client";

import { useRef, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Field, TextInput, inputCls } from "./fields";
import { uploadToCloudinary } from "./upload";
import { DeleteButton } from "./delete-button";
import { deleteMedia, updateMediaMeta, type ActionState } from "@/app/admin/actions";
import { mediaSrc } from "@/lib/cloudinary";
import { useRouter } from "next/navigation";
import type { MediaRow } from "@/lib/types";

const initialState: ActionState = { status: "idle" };

export function MediaLibrary({ media }: { media: MediaRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState("hilman");
  const fileRef = useRef<HTMLInputElement>(null);
  const folders = Array.from(new Set(media.map((m) => m.folder).filter(Boolean))) as string[];
  const [filter, setFilter] = useState<string>("");

  const visible = filter ? media.filter((m) => m.folder === filter) : media;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadToCloudinary(file, folder.trim() || "hilman");
      }
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      {/* uploader */}
      <div className="rounded-lg border border-dashed border-line-strong bg-surface p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Field label="Folder">
              <TextInput value={folder} onChange={(e) => setFolder(e.target.value)} />
            </Field>
          </div>
          <label className={`inline-flex min-h-[44px] cursor-pointer items-center rounded bg-pen px-5 text-sm font-medium text-white hover:opacity-90 ${busy ? "opacity-50" : ""}`}>
            {busy ? "Uploading…" : "Upload files"}
            <input
              ref={fileRef}
              type="file"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={(e) => onFiles(e.target.files)}
            />
          </label>
          {folders.length > 0 && (
            <select
              aria-label="Filter by folder"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={`${inputCls} max-w-[200px]`}
            >
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-red">{error}</p>}
        <p className="mt-3 text-xs text-faint">
          Uploads are signed server-side and land in Cloudinary; images get f_auto/q_auto on delivery.
        </p>
      </div>

      {/* grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((m) => (
          <MediaCard key={m.id} item={m} />
        ))}
        {visible.length === 0 && (
          <p className="col-span-full rounded border border-dashed border-line-strong p-10 text-center text-sm text-faint">
            Nothing in the library yet.
          </p>
        )}
      </div>
    </div>
  );
}

function MetaSave() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded border border-line px-3 py-1.5 text-xs hover:border-pen hover:text-pen disabled:opacity-50">
      {pending ? "…" : "Save"}
    </button>
  );
}

function MediaCard({ item }: { item: MediaRow }) {
  const [state, action] = useFormState(updateMediaMeta, initialState);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  const src = item.kind === "image" ? mediaSrc(item.public_id, { width: 400 }) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <div className="relative aspect-square bg-n-100">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={item.alt ?? item.public_id} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl" aria-hidden>📄</div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(item.public_id);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="w-full truncate rounded bg-n-100 px-2 py-1.5 text-left font-mono text-2xs text-soft hover:text-pen"
          title="Copy public_id"
        >
          {copied ? "copied ✓" : item.public_id}
        </button>
        <form action={action} className="space-y-2">
          <input type="hidden" name="id" value={item.id} />
          <input name="alt" defaultValue={item.alt ?? ""} placeholder="alt text" className="w-full rounded border border-line bg-raise px-2 py-1.5 text-xs outline-none focus:border-pen" />
          <input name="title" defaultValue={item.title ?? ""} placeholder="title" className="w-full rounded border border-line bg-raise px-2 py-1.5 text-xs outline-none focus:border-pen" />
          <input name="folder" defaultValue={item.folder ?? ""} placeholder="folder" className="w-full rounded border border-line bg-raise px-2 py-1.5 text-xs outline-none focus:border-pen" />
          <div className="flex items-center justify-between">
            <MetaSave />
            <DeleteButton
              label="Delete"
              onConfirm={async () => {
                await deleteMedia(item.id, item.public_id, item.kind);
                startTransition(() => {});
              }}
            />
          </div>
          {state.status === "error" && <p className="text-2xs text-red">{state.message}</p>}
        </form>
      </div>
    </div>
  );
}
