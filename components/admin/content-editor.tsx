"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { BlockBuilder } from "./block-builder";
import { CheckRow, Field, Select, TextArea, TextInput } from "./fields";
import { DeleteButton } from "./delete-button";
import {
  deleteJournal,
  deleteProject,
  saveJournal,
  saveProject,
  type ActionState,
} from "@/app/admin/actions";
import { STREAMS, type Block, type JournalPost, type Project, type TagRow } from "@/lib/types";
import { slugify } from "@/lib/utils";

const initialState: ActionState = { status: "idle" };

function SaveBar({ state, isNew }: { state: ActionState; isNew: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 -mx-1 flex items-center gap-3 border-t border-line bg-paper/95 px-1 py-3 backdrop-blur">
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center rounded bg-pen px-6 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : isNew ? "Create" : "Save changes"}
      </button>
      {state.status === "success" && !pending && (
        <span className="text-sm text-pen">Saved ✓</span>
      )}
      {state.status === "error" && !pending && (
        <span role="alert" className="text-sm text-red">{state.message}</span>
      )}
    </div>
  );
}

export function ContentEditor({
  kind,
  initial,
  allTags,
}: {
  kind: "project" | "journal";
  initial: (Project & JournalPost) | null;
  allTags: TagRow[];
}) {
  const isProject = kind === "project";
  const [state, action] = useFormState(isProject ? saveProject : saveJournal, initialState);
  const [blocks, setBlocks] = useState<Block[]>(initial?.blocks ?? []);
  const [tagIds, setTagIds] = useState<string[]>((initial?.tags ?? []).map((t) => t.id));
  const [title, setTitle] = useState(initial?.title ?? "");

  return (
    <form action={action} className="space-y-8">
      <input type="hidden" name="id" value={initial?.id ?? ""} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />
      <input type="hidden" name="tag_ids" value={JSON.stringify(tagIds)} />

      <section className="grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2">
        <Field label="Title">
          <TextInput name="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Slug" hint="Leave empty to generate from the title.">
          <TextInput name="slug" defaultValue={initial?.slug ?? ""} placeholder={slugify(title) || "auto"} />
        </Field>
        {isProject && (
          <Field label="Subtitle">
            <TextInput name="subtitle" defaultValue={initial?.subtitle ?? ""} />
          </Field>
        )}
        {isProject && (
          <Field label="Stream">
            <Select name="stream" defaultValue={initial?.stream ?? "visual-design"}>
              {Object.entries(STREAMS).map(([key, s]) => (
                <option key={key} value={key}>{s.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label="Excerpt" hint="Shown on cards and in search results.">
            <TextArea name="excerpt" rows={2} defaultValue={initial?.excerpt ?? ""} />
          </Field>
        </div>
        <Field label="Thumbnail public_id / URL">
          <TextInput name="thumbnail_public_id" defaultValue={initial?.thumbnail_public_id ?? ""} />
        </Field>
        <Field label="Cover public_id / URL">
          <TextInput name="cover_public_id" defaultValue={initial?.cover_public_id ?? ""} />
        </Field>
        {isProject ? (
          <>
            <Field label="Year">
              <TextInput name="year" type="number" defaultValue={initial?.year ?? ""} />
            </Field>
            <Field label="Sort order" hint="Lower numbers appear first.">
              <TextInput name="sort_order" type="number" defaultValue={initial?.sort_order ?? 0} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Meta (JSON)" hint='{ "role": "…", "tools": ["…"], "client": "…", "links": [{ "label": "…", "url": "…" }] }'>
                <TextArea
                  name="meta"
                  rows={4}
                  className="font-mono text-sm"
                  defaultValue={JSON.stringify(initial?.meta ?? {}, null, 2)}
                />
              </Field>
            </div>
          </>
        ) : (
          <Field label="Reading minutes">
            <TextInput name="reading_minutes" type="number" defaultValue={initial?.reading_minutes ?? 3} />
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
          <Field label="Status">
            <Select name="status" defaultValue={initial?.status ?? "draft"}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
          </Field>
          <CheckRow name="featured" label="Featured (pinned with the highlighter)" defaultChecked={initial?.featured ?? false} />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold">Tags</h2>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          {allTags.map((t) => (
            <CheckRow
              key={t.id}
              label={t.name}
              checked={tagIds.includes(t.id)}
              onChange={(e) =>
                setTagIds((prev) =>
                  e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                )
              }
            />
          ))}
          {allTags.length === 0 && (
            <p className="text-sm text-faint">No tags yet — create some under Taxonomy.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Content blocks</h2>
        <BlockBuilder value={blocks} onChange={setBlocks} />
      </section>

      <SaveBar state={state} isNew={!initial} />

      {initial && (
        <div className="border-t border-dashed border-line pt-6">
          <DeleteButton
            label={`Delete this ${kind} permanently`}
            onConfirm={async () => {
              if (isProject) await deleteProject(initial.id);
              else await deleteJournal(initial.id);
            }}
          />
        </div>
      )}
    </form>
  );
}
