"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Field, TextArea, TextInput } from "./fields";
import { SaveStatus, DraftRecoveryNotice } from "./save-status";
import { useEditorDraft } from "./use-editor-draft";
import { MediaSelectorButton } from "./media-library-context";
import { savePageData } from "@/app/admin/actions";
import { hasPendingRefs, replacePendingRefs } from "@/lib/studio-media-refs";
import { flushPendingMedia } from "@/lib/studio-local/media";
import {
  cleanPageData,
  readField,
  type FieldSpec,
  type PageSchema,
} from "./page-schemas";

/**
 * Form-based editor for the pages that describe you: Home, About, Connect.
 *
 * These used to be edited as raw JSON, which made "update my bio" a coding
 * task and made a stray comma capable of blanking the page.
 */
export function StructuredPageEditor({
  schema,
  title,
  data,
  initialData = data,
  preserveEmptyFields = [],
  previewHref,
}: {
  schema: PageSchema;
  title: string;
  data: Record<string, any>;
  initialData?: Record<string, any>;
  preserveEmptyFields?: string[];
  previewHref?: string;
}) {
  const initial = {
    title,
    fields: Object.fromEntries(schema.fields.map((f) => [f.key, readField(initialData, f)])),
  };

  const draft = useEditorDraft(`page:${schema.slug}`, initial);
  const [pending, startTransition] = useTransition();

  function setField(key: string, value: any) {
    draft.setValue((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }));
  }

  function onSave() {
    const snapshot = draft.value;
    if (!snapshot.title.trim()) {
      draft.markError("the page needs a title");
      return;
    }
    draft.markSaving();
    startTransition(async () => {
      // Older recovered drafts can lack newly added fields. Keep their initial
      // values, while explicitly cleared fields still override the defaults.
      const fields = { ...initial.fields, ...snapshot.fields };
      let payload = cleanPageData(schema, fields, data, preserveEmptyFields);

      /* Pages are saved straight to the server rather than through the outbox,
         so nothing here holds a photo back on their behalf. Upload whatever is
         still stashed on the device first, and refuse rather than write a
         reference the public site could never resolve. */
      if (hasPendingRefs(payload)) {
        const { resolved } = await flushPendingMedia();
        payload = replacePendingRefs(payload, resolved);
      }
      if (hasPendingRefs(payload)) {
        draft.markError(
          "a photo is still waiting to upload — reconnect, or remove it before saving"
        );
        return;
      }

      const res = await savePageData(schema.slug, snapshot.title.trim(), payload);
      if (res.status === "error") draft.markError(res.message ?? "save failed");
      else draft.markSaved(snapshot, res.savedAt);
    });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <DraftRecoveryNotice
        recovery={draft.recovery}
        onAccept={draft.acceptRecovery}
        onDiscard={draft.discardRecovery}
      />

      <p className="text-sm leading-relaxed text-soft">{schema.blurb}</p>

      <Field label="Page title" hint="Internal — shown in the CMS and the browser tab.">
        <TextInput
          value={draft.value.title}
          onChange={(e) => draft.setValue((p) => ({ ...p, title: e.target.value }))}
        />
      </Field>

      <div className="space-y-6">
        {schema.fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={draft.value.fields[field.key] ?? initial.fields[field.key]}
            onChange={(v) => setField(field.key, v)}
          />
        ))}
      </div>

      <div
        className="sticky -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-1 sm:px-1"
        // Rides above the keyboard — see <KeyboardInset />.
        style={{ bottom: "var(--keyboard-inset, 0px)" }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={pending || draft.save.kind === "saving"}
          className="min-h-12 rounded-md bg-hl px-5 text-sm font-semibold text-hl-ink transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save page"}
        </button>
        <SaveStatus state={draft.save} />
        {previewHref && (
          <Link
            href={previewHref}
            target="_blank"
            className="ml-auto text-sm text-pen underline-offset-4 hover:underline"
          >
            View page ↗
          </Link>
        )}
      </div>
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  onChange,
}: {
  field: FieldSpec;
  value: any;
  onChange: (v: any) => void;
}) {
  switch (field.kind) {
    case "text":
    case "url":
      return (
        <Field label={field.label} hint={field.hint}>
          <TextInput
            type={field.kind === "url" ? "url" : "text"}
            value={value ?? ""}
            placeholder={"placeholder" in field ? field.placeholder : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case "longtext":
      return (
        <Field label={field.label} hint={field.hint}>
          <TextArea
            rows={field.rows ?? 4}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case "media":
      return (
        <Field label={field.label} hint={field.hint}>
          <div className="flex flex-wrap items-center gap-2">
            <TextInput
              value={value ?? ""}
              placeholder="hilman/portrait"
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <MediaSelectorButton onSelect={(publicId) => onChange(publicId)} />
          </div>
        </Field>
      );

    case "stringList":
      return <StringListField field={field} value={value ?? []} onChange={onChange} />;

    case "objectList":
      return <ObjectListField field={field} value={value ?? []} onChange={onChange} />;
  }
}

/* ── repeatable lists ──────────────────────────────────── */

function ListShell({
  label,
  hint,
  children,
  onAdd,
  addLabel,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <fieldset className="rounded-md border border-line bg-surface p-4">
      <legend className="px-1 text-sm font-medium text-ink">{label}</legend>
      {hint && <p className="mb-3 text-xs text-soft">{hint}</p>}
      <div className="space-y-3">{children}</div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 rounded border border-line-strong px-3 py-2 text-sm text-soft transition-colors hover:border-pen hover:text-pen"
      >
        + {addLabel}
      </button>
    </fieldset>
  );
}

function RowControls({
  index,
  total,
  onMove,
  onRemove,
  itemLabel,
}: {
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  itemLabel: string;
}) {
  const btn =
    "rounded border border-line px-2 py-1 text-xs text-soft transition-colors hover:border-pen hover:text-pen disabled:opacity-40";
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <button
        type="button"
        className={btn}
        disabled={index === 0}
        aria-label={`Move ${itemLabel} ${index + 1} up`}
        onClick={() => onMove(index, index - 1)}
      >
        ↑
      </button>
      <button
        type="button"
        className={btn}
        disabled={index === total - 1}
        aria-label={`Move ${itemLabel} ${index + 1} down`}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="rounded border border-line px-2 py-1 text-xs text-red transition-colors hover:border-red"
        aria-label={`Remove ${itemLabel} ${index + 1}`}
        onClick={() => onRemove(index)}
      >
        ✕
      </button>
    </div>
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function StringListField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: "stringList" }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <ListShell
      label={field.label}
      hint={field.hint}
      addLabel={`Add ${field.itemLabel.toLowerCase()}`}
      onAdd={() => onChange([...value, ""])}
    >
      {value.length === 0 && (
        <p className="text-sm text-soft">Nothing here yet — this section won't be shown.</p>
      )}
      {value.map((item, i) => (
        <div key={i} className="flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{`${field.itemLabel} ${i + 1}`}</span>
            {field.multiline ? (
              <TextArea
                rows={3}
                value={item}
                onChange={(e) => {
                  const next = [...value];
                  next[i] = e.target.value;
                  onChange(next);
                }}
              />
            ) : (
              <TextInput
                value={item}
                onChange={(e) => {
                  const next = [...value];
                  next[i] = e.target.value;
                  onChange(next);
                }}
              />
            )}
          </label>
          <RowControls
            index={i}
            total={value.length}
            itemLabel={field.itemLabel}
            onMove={(from, to) => onChange(move(value, from, to))}
            onRemove={(index) => onChange(value.filter((_, j) => j !== index))}
          />
        </div>
      ))}
    </ListShell>
  );
}

function ObjectListField({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: "objectList" }>;
  value: Record<string, string>[];
  onChange: (v: Record<string, string>[]) => void;
}) {
  const blank = () => Object.fromEntries(field.columns.map((c) => [c.key, ""]));

  return (
    <ListShell
      label={field.label}
      hint={field.hint}
      addLabel={`Add ${field.itemLabel.toLowerCase()}`}
      onAdd={() => onChange([...value, blank()])}
    >
      {value.length === 0 && (
        <p className="text-sm text-soft">Nothing here yet — this section won't be shown.</p>
      )}
      {value.map((row, i) => (
        <div key={i} className="flex gap-2 rounded border border-line bg-raise p-3">
          <div className="min-w-0 flex-1 space-y-2">
            {field.columns.map((col) => (
              <label key={col.key} className="block">
                <span className="mb-1 block text-xs font-medium text-soft">{col.label}</span>
                {col.multiline ? (
                  <TextArea
                    rows={2}
                    value={row[col.key] ?? ""}
                    placeholder={col.placeholder}
                    onChange={(e) => {
                      const next = [...value];
                      next[i] = { ...next[i], [col.key]: e.target.value };
                      onChange(next);
                    }}
                  />
                ) : (
                  <TextInput
                    value={row[col.key] ?? ""}
                    placeholder={col.placeholder}
                    onChange={(e) => {
                      const next = [...value];
                      next[i] = { ...next[i], [col.key]: e.target.value };
                      onChange(next);
                    }}
                  />
                )}
              </label>
            ))}
          </div>
          <RowControls
            index={i}
            total={value.length}
            itemLabel={field.itemLabel}
            onMove={(from, to) => onChange(move(value, from, to))}
            onRemove={(index) => onChange(value.filter((_, j) => j !== index))}
          />
        </div>
      ))}
    </ListShell>
  );
}

/** Kept for pages that have no schema yet — raw JSON, but never silently lossy. */
export function RawPageDataEditor({
  slug,
  title,
  data,
}: {
  slug: string;
  title: string;
  data: Record<string, any>;
}) {
  const [text, setText] = useState(JSON.stringify(data ?? {}, null, 2));
  const [pageTitle, setPageTitle] = useState(title);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message?: string }>({
    kind: "idle",
  });
  const [pending, startTransition] = useTransition();

  function onSave() {
    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(text);
    } catch (e: any) {
      setStatus({ kind: "error", message: `Not valid JSON — nothing saved. ${e.message}` });
      return;
    }
    if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
      setStatus({ kind: "error", message: "Page data must be a JSON object." });
      return;
    }
    startTransition(async () => {
      const res = await savePageData(slug, pageTitle, parsed);
      setStatus(
        res.status === "error"
          ? { kind: "error", message: res.message }
          : { kind: "ok", message: "Saved" }
      );
    });
  }

  return (
    <div className="max-w-3xl space-y-5">
      <Field label="Title">
        <TextInput value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} />
      </Field>
      <Field label="Structured content (JSON)" hint="This page has no form yet.">
        <TextArea
          rows={22}
          className="font-mono text-sm"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatus({ kind: "idle" });
          }}
        />
      </Field>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded bg-hl px-5 py-2.5 text-sm font-semibold text-hl-ink disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save page"}
        </button>
        {status.kind === "ok" && <span className="text-sm text-pen">Saved ✓</span>}
        {status.kind === "error" && (
          <span role="alert" className="text-sm text-red">
            {status.message}
          </span>
        )}
      </div>
    </div>
  );
}
