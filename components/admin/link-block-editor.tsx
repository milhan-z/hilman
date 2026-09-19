"use client";

import { useEffect, useState } from "react";
import { getLinkTargets, type LinkTargetRow } from "@/app/admin/actions";
import { classifyLink, relatedCta } from "@/lib/links";
import { cn } from "@/lib/utils";
import { Field, Select, TextInput } from "./fields";
import { MediaField } from "./block-editors";
import { DraftTargetWarning, LinkTargetPicker } from "./link-target-picker";

/**
 * Editing a Link block.
 *
 * ── the shape of the form follows the shape of the job ──
 *
 * Almost every link in this portfolio is one of two things: another page of
 * this site, or an external URL that was copied from somewhere. The old form
 * treated both as "type a URL, then type a title, then type a description",
 * which is four fields of transcription on a phone for something the site
 * already knows.
 *
 * So the common path is first and takes two taps — pick Projects or Journal,
 * tap the entry — and everything that follows is a correction rather than a
 * requirement. The external path is one field, unchanged.
 *
 * Fine-tuning (presentation, CTA wording, overrides, thumbnail) sits behind a
 * disclosure, because it exists and should be reachable, but putting six more
 * inputs on the canvas is how a mobile editor stops being usable.
 */

type Mode = "internal" | "external";

export function LinkBlockEditor({
  data,
  onChange,
}: {
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
}) {
  const classified = classifyLink(data.url);
  const hasUrl = Boolean(String(data.url ?? "").trim());

  // An existing block opens on the tab that matches what it already holds; a
  // new one opens on the internal picker, which is the case worth making easy.
  const [mode, setMode] = useState<Mode>(
    hasUrl && classified.kind === "external" ? "external" : "internal"
  );
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<LinkTargetRow[]>([]);

  // Only to tell whether the chosen target is still a draft. Failure is
  // silent: the warning simply does not appear, and nothing else depends on it.
  useEffect(() => {
    let alive = true;
    getLinkTargets()
      .then((index) => {
        if (alive) setTargets([...index.projects, ...index.journal]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Selection copies a snapshot in, and switches the block to the related
   * presentation — that is what somebody is doing when they link a project
   * from a journal entry, and it is one fewer control to find.
   *
   * Anything already typed wins. Re-picking a target to refresh its wording
   * should not silently throw away a title the author wrote themselves.
   */
  function pick(target: LinkTargetRow & { kind: "project" | "journal" }) {
    onChange({
      ...data,
      url: target.url,
      title: String(data.title ?? "").trim() || target.title,
      description: String(data.description ?? "").trim() || target.description,
      thumbnail: data.thumbnail || target.thumbnail || undefined,
      label: String(data.label ?? "").trim() || relatedCta(target.url),
      presentation: "related",
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(
          [
            ["internal", "This site"],
            ["external", "External URL"],
          ] as [Mode, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={cn(
              "min-h-12 flex-1 rounded-md border text-sm font-semibold transition-colors",
              mode === value
                ? "border-pen bg-hl-soft text-ink"
                : "border-line-strong bg-raise text-soft hover:text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "internal" ? (
        <LinkTargetPicker onPick={pick} />
      ) : (
        <Field label="URL" hint="An address starting with https://">
          <TextInput
            value={data.url ?? ""}
            inputMode="url"
            placeholder="https://example.com"
            onChange={(e) => onChange({ ...data, url: e.target.value })}
          />
        </Field>
      )}

      {/* What the block currently points at, so the result of a tap is
          visible without opening anything. */}
      {hasUrl && (
        <div className="rounded-md border border-line bg-raise px-3 py-2">
          <p className="truncate text-sm font-medium text-ink">{data.title || data.url}</p>
          <p className="truncate text-2xs text-faint">{data.url}</p>
        </div>
      )}

      {hasUrl && classified.kind === "unsafe" && (
        <p role="alert" className="rounded border border-red bg-red-soft px-3 py-2 text-sm text-red">
          That address can&rsquo;t be linked to. Use an https:// address, or a path on this site
          like /works/something.
        </p>
      )}

      <DraftTargetWarning url={data.url} targets={targets} />

      <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer py-2 text-sm font-medium text-soft">
          Wording and appearance
        </summary>

        <div className="space-y-3 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Presentation">
              <Select
                value={data.presentation === "related" ? "related" : "default"}
                onChange={(e) => onChange({ ...data, presentation: e.target.value })}
              >
                <option value="default">Link card</option>
                <option value="related">Related — editorial</option>
              </Select>
            </Field>
            <Field label="Call to action" hint={`Defaults to “${relatedCta(data.url)}”`}>
              <TextInput
                value={data.label ?? ""}
                placeholder={relatedCta(data.url)}
                onChange={(e) => onChange({ ...data, label: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Title">
            <TextInput
              value={data.title ?? ""}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
            />
          </Field>

          <Field label="Description">
            <TextInput
              value={data.description ?? ""}
              onChange={(e) => onChange({ ...data, description: e.target.value })}
            />
          </Field>

          <MediaField
            label="Thumbnail (optional)"
            value={data.thumbnail ?? ""}
            onChange={(v) => onChange({ ...data, thumbnail: v })}
            onSelectAsset={(id) => onChange({ ...data, thumbnail: id })}
          />
        </div>
      </details>
    </div>
  );
}
