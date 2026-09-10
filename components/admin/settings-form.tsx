"use client";

import { useTransition } from "react";
import { Field, TextArea, TextInput } from "./fields";
import { SaveStatus, DraftRecoveryNotice } from "./save-status";
import { useEditorDraft } from "./use-editor-draft";
import { saveSettingsData } from "@/app/admin/actions";
import type { Settings } from "@/lib/types";

/**
 * Identity settings, edited as lists rather than JSON.
 *
 * The link fields validate as you go: a bare `https://instagram.com/` is a
 * placeholder, not a profile, and shipping one sends visitors to the wrong
 * account. The form says so instead of saving it quietly.
 */

const PLACEHOLDER_HOSTS = [
  "instagram.com",
  "www.instagram.com",
  "github.com",
  "www.github.com",
  "youtube.com",
  "www.youtube.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "www.linkedin.com",
  "behance.net",
  "www.behance.net",
  "dribbble.com",
];

export function linkProblem(url: string): string | null {
  const value = url.trim();
  if (!value) return "Add the URL or remove the row.";
  if (value.startsWith("mailto:")) {
    const address = value.slice("mailto:".length);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return "That doesn't look like an email address.";
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Not a valid URL — include https://";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Use an https:// link or a mailto: address.";
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (!path && PLACEHOLDER_HOSTS.includes(parsed.hostname)) {
    return "This is the site's front page, not your profile — add your username.";
  }
  return null;
}

type Row = { label: string; url: string };
type NavRow = { label: string; href: string };

export function SettingsForm({ settings }: { settings: Settings }) {
  const draft = useEditorDraft("settings", {
    hero_roles: settings.hero_roles.join("\n"),
    socials: (settings.socials ?? []) as Row[],
    nav: (settings.nav ?? []) as NavRow[],
  });
  const [pending, startTransition] = useTransition();

  const socialProblems = draft.value.socials.map((s) => linkProblem(s.url));
  const blocking = socialProblems.some(Boolean);

  function onSave() {
    if (blocking) {
      draft.markError("fix the link problems below first");
      return;
    }
    const snapshot = draft.value;
    draft.markSaving();
    startTransition(async () => {
      const res = await saveSettingsData({
        hero_roles: snapshot.hero_roles
          .split("\n")
          .map((r) => r.trim())
          .filter(Boolean),
        socials: snapshot.socials
          .map((s) => ({ label: s.label.trim(), url: s.url.trim() }))
          .filter((s) => s.label && s.url),
        nav: snapshot.nav
          .map((n) => ({ label: n.label.trim(), href: n.href.trim() }))
          .filter((n) => n.label && n.href),
      });
      if (res.status === "error") draft.markError(res.message ?? "save failed");
      else draft.markSaved(snapshot, res.savedAt);
    });
  }

  const rowBtn =
    "rounded border border-line px-2 py-1 text-xs text-soft transition-colors hover:border-pen hover:text-pen disabled:opacity-40";

  return (
    <div className="max-w-2xl space-y-6">
      <DraftRecoveryNotice
        recovery={draft.recovery}
        onAccept={draft.acceptRecovery}
        onDiscard={draft.discardRecovery}
      />

      <Field label="Hero roles" hint="One per line — these rotate on the home page.">
        <TextArea
          rows={6}
          value={draft.value.hero_roles}
          onChange={(e) => draft.setValue((p) => ({ ...p, hero_roles: e.target.value }))}
        />
      </Field>

      <fieldset className="rounded-md border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-medium text-ink">Where to find you</legend>
        <p className="mb-3 text-xs text-soft">
          Only accounts you actually use. Empty means the “Elsewhere” lists stay hidden rather
          than pointing somewhere wrong.
        </p>

        {draft.value.socials.length === 0 && (
          <p className="rounded border border-dashed border-line-strong p-4 text-sm text-soft">
            No links yet. Visitors currently have no way to find you outside this site.
          </p>
        )}

        <div className="space-y-3">
          {draft.value.socials.map((row, i) => (
            <div key={i} className="rounded border border-line bg-raise p-3">
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-soft">Label</span>
                    <TextInput
                      value={row.label}
                      placeholder="Instagram"
                      onChange={(e) => {
                        const next = [...draft.value.socials];
                        next[i] = { ...next[i], label: e.target.value };
                        draft.setValue((p) => ({ ...p, socials: next }));
                      }}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-soft">
                      URL or mailto: address
                    </span>
                    <TextInput
                      value={row.url}
                      placeholder="https://instagram.com/your-handle"
                      aria-invalid={socialProblems[i] ? true : undefined}
                      onChange={(e) => {
                        const next = [...draft.value.socials];
                        next[i] = { ...next[i], url: e.target.value };
                        draft.setValue((p) => ({ ...p, socials: next }));
                      }}
                    />
                  </label>
                  {socialProblems[i] && (
                    <p role="alert" className="text-xs text-red">
                      {socialProblems[i]}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="h-fit rounded border border-line px-2 py-1 text-xs text-red hover:border-red"
                  aria-label={`Remove link ${i + 1}`}
                  onClick={() =>
                    draft.setValue((p) => ({
                      ...p,
                      socials: p.socials.filter((_, j) => j !== i),
                    }))
                  }
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="mt-3 rounded border border-line-strong px-3 py-2 text-sm text-soft transition-colors hover:border-pen hover:text-pen"
          onClick={() =>
            draft.setValue((p) => ({ ...p, socials: [...p.socials, { label: "", url: "" }] }))
          }
        >
          + Add link
        </button>
      </fieldset>

      <fieldset className="rounded-md border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-medium text-ink">Navigation</legend>
        <p className="mb-3 text-xs text-soft">
          Order matters. Paths start with a slash, e.g. <code>/works</code>.
        </p>
        <div className="space-y-2">
          {draft.value.nav.map((row, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className="min-w-[120px] flex-1">
                <span className="mb-1 block text-xs font-medium text-soft">Label</span>
                <TextInput
                  value={row.label}
                  onChange={(e) => {
                    const next = [...draft.value.nav];
                    next[i] = { ...next[i], label: e.target.value };
                    draft.setValue((p) => ({ ...p, nav: next }));
                  }}
                />
              </label>
              <label className="min-w-[120px] flex-1">
                <span className="mb-1 block text-xs font-medium text-soft">Path</span>
                <TextInput
                  value={row.href}
                  onChange={(e) => {
                    const next = [...draft.value.nav];
                    next[i] = { ...next[i], href: e.target.value };
                    draft.setValue((p) => ({ ...p, nav: next }));
                  }}
                />
              </label>
              <div className="flex gap-1 pb-1">
                <button
                  type="button"
                  className={rowBtn}
                  disabled={i === 0}
                  aria-label={`Move ${row.label || "item"} up`}
                  onClick={() =>
                    draft.setValue((p) => {
                      const next = [...p.nav];
                      const [item] = next.splice(i, 1);
                      next.splice(i - 1, 0, item);
                      return { ...p, nav: next };
                    })
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={rowBtn}
                  disabled={i === draft.value.nav.length - 1}
                  aria-label={`Move ${row.label || "item"} down`}
                  onClick={() =>
                    draft.setValue((p) => {
                      const next = [...p.nav];
                      const [item] = next.splice(i, 1);
                      next.splice(i + 1, 0, item);
                      return { ...p, nav: next };
                    })
                  }
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded border border-line px-2 py-1 text-xs text-red hover:border-red"
                  aria-label={`Remove ${row.label || "item"}`}
                  onClick={() =>
                    draft.setValue((p) => ({ ...p, nav: p.nav.filter((_, j) => j !== i) }))
                  }
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mt-3 rounded border border-line-strong px-3 py-2 text-sm text-soft transition-colors hover:border-pen hover:text-pen"
          onClick={() =>
            draft.setValue((p) => ({ ...p, nav: [...p.nav, { label: "", href: "/" }] }))
          }
        >
          + Add nav item
        </button>
      </fieldset>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 py-4 backdrop-blur">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="rounded bg-hl px-5 py-2.5 text-sm font-semibold text-hl-ink disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
        <SaveStatus state={draft.save} />
      </div>
    </div>
  );
}
