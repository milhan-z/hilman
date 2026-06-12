"use client";

import { useState } from "react";
import { extractYouTubeId } from "@/lib/embed";

/**
 * Lite YouTube embed — renders only a thumbnail + play button until clicked,
 * keeping the iframe (and ~1MB of YouTube JS) off the critical path.
 * Accepts a bare id, a watch/share URL, or a pasted <iframe> snippet.
 */
export function YouTubeFacade({ youtubeId, caption }: { youtubeId: string; caption?: string }) {
  const [playing, setPlaying] = useState(false);
  const id = extractYouTubeId(youtubeId);

  return (
    <figure>
      <div className="relative aspect-video overflow-hidden rounded-md border border-line bg-n-900">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
            title={caption || "YouTube video"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video${caption ? `: ${caption}` : ""}`}
            className="group absolute inset-0 h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-90 transition-opacity duration-base group-hover:opacity-100"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-paper/90 shadow-lift transition-transform duration-base ease-out group-hover:scale-110">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--pen)" aria-hidden>
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              </span>
            </span>
          </button>
        )}
      </div>
      {caption && (
        <figcaption className="mt-2 font-hand text-lg text-faint">{caption}</figcaption>
      )}
    </figure>
  );
}
