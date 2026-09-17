"use client";

import { Field } from "./fields";
import { MediaCapture } from "./media-capture";
import { PendingClip } from "./pending-media";
import { discardPendingMedia } from "@/lib/studio-local/media";
import { isPendingRef } from "@/lib/studio-media-refs";
import { resolveLoopClipSrc } from "@/lib/loop-clip";

/**
 * Choosing the video behind a Loop Clip block.
 *
 * Deliberately not `<MediaField />` wearing an `accept="video/mp4"`. That
 * component's other half — "Choose from your photos", the Cloudinary media
 * library, the "paste folder/asset-id" fallback — is about *reusing* an
 * asset already on the site, and there is no library of clips to reuse: v1
 * doesn't build one, per the same "no transcoding, no poster pipeline yet"
 * scoping as the rest of this block. So this is its own small field: capture
 * or pick a file, watch it upload, and nothing else. R2 never appears in it —
 * the author sees a video and a Remove button, same as the Photo field shows
 * a picture and a Remove button.
 */
export function LoopClipField({
  value,
  onChange,
}: {
  /** A finished https URL, a `pending:` placeholder, or empty. */
  value: string;
  onChange: (v: string) => void;
}) {
  const pending = isPendingRef(value);
  const resolvedSrc = resolveLoopClipSrc(value);

  return (
    <Field label="Clip">
      <div className="space-y-2">
        {/* What was actually uploaded. `controls`, not the public render's
            autoplay/loop/muted — this is the author checking their own clip,
            not a visitor watching it play in a case study. */}
        {value && !pending && (
          <figure className="overflow-hidden rounded-md border border-line bg-raise">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video src={resolvedSrc} controls muted playsInline className="block max-h-56 w-full bg-n-900" />
            <figcaption className="flex justify-end px-2 py-1">
              <button
                type="button"
                onClick={() => onChange("")}
                className="min-h-11 px-2 text-sm text-red transition-opacity hover:opacity-80"
              >
                Remove
              </button>
            </figcaption>
          </figure>
        )}

        <MediaCapture
          accept="video/mp4"
          kind="loop-clip"
          folder="clips"
          onCaptured={(ref) => onChange(ref)}
        />

        {pending && (
          <PendingClip
            clipRef={value}
            onDiscard={() => {
              void discardPendingMedia(value);
              onChange("");
            }}
          />
        )}
      </div>
    </Field>
  );
}
