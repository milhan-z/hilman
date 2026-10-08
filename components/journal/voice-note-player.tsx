"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatVoiceNoteDuration } from "@/lib/voice-note";
import { cn } from "@/lib/utils";

/**
 * "Hilman reads this entry" — the author's own reading, in the entry's header.
 *
 * A strip of notebook paper, not a media player: cream, dark ink, one yellow
 * stroke, a handwritten initial. No waveform (there is no real one to draw),
 * no autoplay, no volume slider, no animation while it is not playing.
 *
 * ── without JavaScript ──
 *
 * The server renders a plain `<audio controls>`, which plays on its own. Once
 * this has hydrated it hides the browser's controls and shows its own. The
 * entry's writing never depends on any of it.
 *
 * ── what it costs ──
 *
 * `preload="metadata"`: the length and nothing else until someone presses
 * play, and the browser then streams with Range requests, so seeking does not
 * download the whole file. Progress follows `timeupdate`; there is no frame
 * loop. An entry without a recording renders none of this.
 */

const RATES = [1, 1.25, 1.5] as const;

/** Only one narration plays at a time, however many a page ever shows. */
const PLAY_EVENT = "voice-note:play";

function spoken(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts = [];
  if (m) parts.push(`${m} ${m === 1 ? "minute" : "minutes"}`);
  parts.push(`${s} ${s === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}

export function VoiceNotePlayer({
  src,
  duration: knownDuration,
  reader = "Hilman",
}: {
  src: string;
  /** From the database; may be null, in which case the file says. */
  duration: number | null;
  reader?: string;
}) {
  const id = useId();
  const audio = useRef<HTMLAudioElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState<number | null>(knownDuration);
  const [rate, setRate] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setEnhanced(true);
    const el = audio.current;
    if (!el) return;

    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    };
    const onPlay = () => {
      setPlaying(true);
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id }));
    };
    const onPause = () => setPlaying(false);
    const onError = () => {
      setFailed(true);
      setPlaying(false);
    };
    const onOther = (event: Event) => {
      if ((event as CustomEvent).detail !== id) el.pause();
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onPause);
    el.addEventListener("error", onError);
    window.addEventListener(PLAY_EVENT, onOther);
    onMeta();
    // A source that failed before this ran — a quick 404 — has already fired
    // its error event, and would otherwise look playable until pressed.
    if (el.error) onError();

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onPause);
      el.removeEventListener("error", onError);
      window.removeEventListener(PLAY_EVENT, onOther);
      // Leaving the page stops the reading; the element goes with the page.
      // Not `removeAttribute("src")`: an effect can be cleaned up and run
      // again on the same element (React does exactly that in development),
      // and React would not put back an attribute whose prop never changed.
      el.pause();
    };
  }, [id]);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (el.paused) {
      setFailed(false);
      el.play().catch(() => setFailed(true));
    } else {
      el.pause();
    }
  }

  function seek(seconds: number) {
    const el = audio.current;
    if (!el || !Number.isFinite(seconds)) return;
    el.currentTime = seconds;
    setCurrent(seconds);
  }

  function nextRate() {
    const next = (rate + 1) % RATES.length;
    setRate(next);
    if (audio.current) audio.current.playbackRate = RATES[next];
  }

  const total = duration ?? 0;
  const length = formatVoiceNoteDuration(duration);

  return (
    <section
      aria-label="Voice note"
      className="relative mt-8 max-w-xl rounded-sm border border-cream-line bg-cream px-4 pb-5 pt-3.5 text-cream-ink shadow-[0_1px_0_var(--cream-line)] sm:px-5"
    >
      <p className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-cream-soft tnum">
        <span>Voice note</span>
        {length && (
          <>
            <span aria-hidden>/</span>
            <span>{length}</span>
          </>
        )}
        {/* Lit while it is playing, and still: a recording light, not an alarm. */}
        <span
          aria-hidden
          className={cn(
            "ml-auto h-1.5 w-1.5 rounded-full bg-cream-red transition-opacity duration-300 motion-reduce:transition-none",
            playing ? "opacity-100" : "opacity-0"
          )}
        />
      </p>
      <span aria-hidden className="mt-1.5 block h-[3px] w-10 -rotate-1 rounded-full bg-hl" />

      <p className="mt-3 font-display text-lg font-semibold leading-snug">
        {reader} reads this entry
      </p>

      {/* The element itself: the browser's own controls until this has
          hydrated, then invisible and driven by the controls below. */}
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        controls={!enhanced}
        className={enhanced ? "hidden" : "mt-3 block w-full"}
      />

      {enhanced && (
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? "Pause voice note" : "Play voice note"}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-cream-ink text-cream-ink transition-colors hover:bg-cream-ink hover:text-cream focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream-ink"
          >
            {playing ? (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="currentColor">
                <rect x="3" y="2" width="3.5" height="12" rx="1" />
                <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="currentColor">
                <path d="M4 2.2v11.6a.8.8 0 0 0 1.2.7l9.4-5.8a.8.8 0 0 0 0-1.4L5.2 1.5A.8.8 0 0 0 4 2.2Z" />
              </svg>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <input
              type="range"
              min={0}
              max={total || 0}
              step={1}
              value={Math.min(current, total || current)}
              disabled={!total}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="Seek"
              aria-valuetext={`${spoken(current)} of ${total ? spoken(total) : "unknown length"}`}
              className="block h-11 w-full cursor-pointer accent-[var(--cream-ink)] disabled:cursor-default"
            />
            <p className="-mt-1 flex justify-between font-mono text-2xs text-cream-soft tnum" aria-hidden>
              <span>{formatVoiceNoteDuration(current) || "0:00"}</span>
              <span>{length || "–:––"}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={nextRate}
            aria-label={`Playback speed ${RATES[rate]}×. Change speed`}
            className="min-h-11 min-w-11 shrink-0 rounded-sm px-1.5 font-mono text-xs font-semibold text-cream-ink underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream-ink tnum"
          >
            {RATES[rate]}×
          </button>
        </div>
      )}

      {failed && (
        <p role="status" className="mt-2 text-sm text-cream-red">
          This recording can&apos;t be played right now. The entry below is the same words.
        </p>
      )}

      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-1 right-4 rotate-[-4deg] font-hand text-lg text-cream-soft"
      >
        read by h.
      </span>
    </section>
  );
}
