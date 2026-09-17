"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field, TextInput, inputCls } from "./fields";
import { uploadToCloudinary } from "./upload";
import {
  deleteMedia,
  getMediaReferences,
  updateMediaMeta,
  type ActionState,
  type MediaReference,
} from "@/app/admin/actions";
import { mediaSrc } from "@/lib/cloudinary";
import { useRouter } from "next/navigation";
import type { MediaRow } from "@/lib/types";

const initialState: ActionState = { status: "idle" };

export function MediaLibrary({ media }: { media: MediaRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [folder, setFolder] = useState("hilman");
  const fileRef = useRef<HTMLInputElement>(null);
  const folders = Array.from(new Set(media.map((m) => m.folder).filter(Boolean))) as string[];
  const [filter, setFilter] = useState<string>("");

  const visible = filter ? media.filter((m) => m.folder === filter) : media;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    setWarnings([]);
    const notRecorded: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const asset = await uploadToCloudinary(file, folder.trim() || "hilman");
        // Uploaded, but the library row failed — a half-done upload must not
        // read as a finished one.
        if (asset.unrecorded) {
          notRecorded.push(`${file.name} → uploaded as ${asset.public_id}, but ${asset.unrecorded}`);
        }
      }
      setWarnings(notRecorded);
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
          <label
            className={`inline-flex min-h-[44px] cursor-pointer items-center rounded bg-hl px-5 text-sm font-medium text-hl-ink hover:opacity-90 ${busy ? "opacity-50" : ""}`}
          >
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
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red">
            {error}
          </p>
        )}
        {warnings.length > 0 && (
          <div role="alert" className="mt-3 rounded border border-red bg-red-soft p-3">
            <p className="text-sm font-semibold text-red">Uploaded, but not fully filed</p>
            <ul className="mt-1.5 space-y-1 text-xs text-soft">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-soft">
              The file is in Cloudinary. Upload it again to retry the library entry.
            </p>
          </div>
        )}
        <p className="mt-3 text-xs text-soft">
          Uploads are signed server-side and land in Cloudinary; images get f_auto/q_auto on delivery.
        </p>
      </div>

      {/* grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((m) => (
          <MediaCard key={m.id} item={m} />
        ))}
        {visible.length === 0 && (
          <p className="col-span-full rounded border border-dashed border-line-strong p-10 text-center text-sm text-soft">
            {filter ? `Nothing filed under “${filter}”.` : "Nothing in the library yet."}
          </p>
        )}
      </div>
    </div>
  );
}

function MetaSave() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border border-line px-3 py-1.5 text-xs hover:border-pen hover:text-pen disabled:opacity-50"
    >
      {pending ? "…" : "Save"}
    </button>
  );
}

type DeleteStage =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "confirm"; refs: MediaReference[] }
  | { step: "deleting" }
  | { step: "error"; message: string };

function MediaCard({ item }: { item: MediaRow }) {
  const router = useRouter();
  const [state, action] = useActionState(updateMediaMeta, initialState);
  const [copied, setCopied] = useState(false);
  const [stage, setStage] = useState<DeleteStage>({ step: "idle" });
  const src = item.kind === "image" ? mediaSrc(item.public_id, { width: 400 }) : null;

  /**
   * Deleting an asset is checked against the content that still points at it,
   * so a picture used by a published case study cannot disappear on one click.
   */
  async function startDelete() {
    setStage({ step: "checking" });
    const refs = await getMediaReferences(item.public_id);
    setStage({ step: "confirm", refs });
  }

  async function confirmDelete(force: boolean) {
    setStage({ step: "deleting" });
    const res = await deleteMedia(item.id, item.public_id, item.kind, { force });
    if (res.status === "error") {
      setStage({ step: "error", message: res.message ?? "Delete failed." });
      return;
    }
    setStage({ step: "idle" });
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <div className="relative aspect-square bg-n-100">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={item.alt ?? item.public_id}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl" aria-hidden>
            📄
          </div>
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
          className="w-full truncate rounded bg-n-100 px-2 py-1.5 text-left font-mono text-xs text-soft hover:text-pen"
          title="Copy public_id"
        >
          {copied ? "copied ✓" : item.public_id}
        </button>
        <form action={action} className="space-y-2">
          <input type="hidden" name="id" value={item.id} />
          <input
            name="alt"
            defaultValue={item.alt ?? ""}
            placeholder="alt text"
            aria-label={`Alt text for ${item.public_id}`}
            className="min-h-12 w-full rounded border border-line bg-raise px-2.5 py-1.5 text-base outline-none focus:border-pen sm:min-h-0 sm:text-xs"
          />
          <input
            name="title"
            defaultValue={item.title ?? ""}
            placeholder="title"
            aria-label={`Title for ${item.public_id}`}
            className="min-h-12 w-full rounded border border-line bg-raise px-2.5 py-1.5 text-base outline-none focus:border-pen sm:min-h-0 sm:text-xs"
          />
          <input
            name="folder"
            defaultValue={item.folder ?? ""}
            placeholder="folder"
            aria-label={`Folder for ${item.public_id}`}
            className="min-h-12 w-full rounded border border-line bg-raise px-2.5 py-1.5 text-base outline-none focus:border-pen sm:min-h-0 sm:text-xs"
          />
          <div className="flex items-center justify-between">
            <MetaSave />
            <button
              type="button"
              onClick={startDelete}
              disabled={stage.step === "checking" || stage.step === "deleting"}
              className="text-xs text-red underline-offset-4 hover:underline disabled:opacity-50"
            >
              {stage.step === "checking"
                ? "Checking…"
                : stage.step === "deleting"
                  ? "Deleting…"
                  : "Delete"}
            </button>
          </div>
          {state.status === "error" && (
            <p role="alert" className="text-xs text-red">
              {state.message}
            </p>
          )}
        </form>

        {stage.step === "confirm" && (
          <div className="rounded border border-line-strong bg-raise p-2.5 text-xs">
            {stage.refs.length === 0 ? (
              <p className="text-soft">
                Nothing references this file. Delete it from Cloudinary and the library?
              </p>
            ) : (
              <>
                <p className="font-semibold text-red">
                  Still used by {stage.refs.length} item{stage.refs.length > 1 ? "s" : ""}:
                </p>
                <ul className="mt-1 space-y-0.5 text-soft">
                  {stage.refs.slice(0, 5).map((r, i) => (
                    <li key={`${r.kind}-${r.ref_id}-${i}`}>
                      <span className="font-mono text-soft">{r.kind}</span> — {r.label}
                    </li>
                  ))}
                  {stage.refs.length > 5 && <li>…and {stage.refs.length - 5} more</li>}
                </ul>
                <p className="mt-1.5 text-soft">
                  Deleting now leaves those places with a broken image.
                </p>
              </>
            )}
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={() => confirmDelete(stage.refs.length > 0)}
                className="rounded bg-red px-2.5 py-1 text-xs font-semibold text-[#220603]"
              >
                {stage.refs.length ? "Delete anyway" : "Delete"}
              </button>
              <button
                type="button"
                onClick={() => setStage({ step: "idle" })}
                className="rounded border border-line px-2.5 py-1 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {stage.step === "error" && (
          <p role="alert" className="text-xs text-red">
            {stage.message}{" "}
            <button
              type="button"
              onClick={() => setStage({ step: "idle" })}
              className="underline"
            >
              dismiss
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
