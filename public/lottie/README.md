# Lottie — Hilman Bits illustrated moments

**Lottie is for illustrated moments. HILMAN BITS is for interface motion.**
There is at most one of these per screen, and each plays **once**, except the loop variant, which is marked as such.
None is used where `docs/HILMAN-BITS.md` already spends the page's motion budget.

The three assets are one family: a small story about paper.

| asset | where | the paper is… | trigger |
|---|---|---|---|
| `filed-idea` | Home, placement still open. Home is at 3/3 primitives, so either the still, or it replaces one | **created**: loose scraps are gathered into a card | on view, once |
| `sent-note` | Connect | **sent**: a signed note leaves the desk | only after the message was really sent |
| `page-not-filed` | 404 (`app/not-found.tsx`) | **searched for**: a card is pulled out and it is empty | on load, once |
| `page-not-filed-loop` | 404, looping variant (see its section) | the same, and it goes back | on load, loops |

**Shared grammar**

- Paper always enters and leaves physically: it slides, tilts 1–4° and settles, with no pop and no scale.
- Ink is always drawn (trim path), never faded in. Handwriting only appears once the paper is there.
- Yellow is a gesture: a highlighter swipe or a marked tab, never just a fill.
- Red is always annotation: crop marks, a question, a small ✳.
- Code is a thin-ink `{ }`. There is no cyan: one accent colour besides yellow, as in the palette.
- "h." is the signature.
- The reduced-motion still is either the last frame, or the frame named by a `static` marker where the last frame is not the finished drawing.

Each asset comes in two forms:

- **`.lottie`** — a dotLottie v1 container (`manifest.json` + `animations/<id>.json`). `loop` and `autoplay` are false, except in the loop variant.
- **`.json`** — the same animation as plain Lottie JSON.

They are the same animation. Use `.lottie` with a dotLottie player (`@lottiefiles/dotlottie-web`, which loads a WASM renderer). Use `.json` with `lottie-web`'s light build, which cannot read `.lottie`.

On LottieFiles (workspace "milzhar's Workspace", Drafts), LottieFiles makes its own dotLottie from each upload:

- Page Not Filed — https://app.lottiefiles.com/animation/231c6aa5-707c-4270-be3a-13a8d21feb46
- Page Not Filed (loop) — https://app.lottiefiles.com/animation/7fa7f980-6408-4cab-8e80-50312efb1ea1
- `sent-note` v2 and `filed-idea` are **not uploaded yet**: the workspace is at its 5-animation limit. The LottieFiles "Sent Note" (8d821702-…) is still v1.

## Shared spec

- Bodymovin 5.7.4, **30 fps**, canvas **320×320**. Meant to be shown at 120–280 px.
- Shape layers and nulls only. There are no expressions, effects, raster images, text layers, mattes or masks, so the files run in `lottie-web` light.
- Transparent background. Drawn for the cream sheet (`#F3EDDF`).
- Colours:
  - `#1F1D1B` ink;
  - `#F4EEDF` cream fill;
  - accents, only where named: `#F5C518` stabilo, `#B5162B` red pen.
- Lines are 3–5 px on the 320 canvas (about 2 px at 160 px on screen), with round caps and joins. Paths are slightly uneven, like a hand drew them.
- The main effect is trim path. Every keyframe segment is ease-out `(0.33,1)→(0.68,1)`, except the take-off in `sent-note`, which is `(0.5,0)→(0.7,1)`. There is no bounce.
- Frame 0 is empty, except in the loop variant.
- Mark the element `aria-hidden="true"`.

| asset | fps | frames | duration | layers | colours | .json | .lottie | reduced-motion still |
|---|---|---|---|---|---|---|---|---|
| filed-idea | 30 | 72 | 2.4 s | 7 | ink, cream, stabilo, red | 15.7 KB | 2.4 KB | last frame |
| sent-note | 30 | 60 | 2.0 s | 6 (1 null + 5) | ink, cream, stabilo, red | 11.2 KB | 2.1 KB | marker `static` @ 37 |
| page-not-filed | 30 | 54 | 1.8 s | 7 | ink, cream, stabilo, red | 13.7 KB | 2.0 KB | last frame |
| page-not-filed-loop | 30 | 96 | 3.2 s loop | 7 | ink, cream, stabilo, red | 12.8 KB | 2.1 KB | marker `static` @ 60 |

## filed-idea — Home ("Messy Idea → Filed Idea")

Random curiosity, made into something. Three loose scraps land on the desk:

- one with writing (ink);
- one with a tiny photo sketch, framed by red crop marks;
- one with a thin-ink `{ }`.

A notebook card slides in under them. The scraps are gathered onto it, a yellow highlighter swipe binds them, and the card is signed "h.". It is the card that `page-not-filed` later cannot find.

| time | frames | what happens |
|---|---|---|
| 0.00–0.40 s | 0–12 | three scraps slide onto the desk, scattered and tilted (−9°, +10°, +7°) |
| 0.20–0.50 s | 6–15 | two lines of writing on the first scrap |
| 0.40–0.73 s | 12–22 | horizon + sun on the second, then its four red crop corners |
| 0.60–0.87 s | 18–26 | `{`, `}`, and a dot on the third |
| 0.87–1.20 s | 26–36 | the card slides in under them and settles at −1° |
| 1.00–1.53 s | 30–46 | the scraps are gathered onto the card one after another (tilts settle to −3°, +4°, −2°) |
| 1.47–1.80 s | 44–54 | one yellow swipe across the card |
| 1.73–2.00 s | 52–60 | "h." in the corner |
| 2.00–2.40 s | 60–72 | hold: the filed card |

## sent-note — Connect success ("a note leaving the desk")

This is not a success badge. A note is written, one line is marked, and it is signed "h." with a tiny red ✳. Then someone picks it up and it leaves the desk.

| time | frames | what happens |
|---|---|---|
| 0.00–0.27 s | 0–8 | the note slides in (8 px, −3.5° → −1.5°) |
| 0.27–0.67 s | 8–20 | three lines of ink, written quickly one after another, with word gaps |
| 0.60–0.93 s | 18–28 | yellow highlighter over the middle line only, slightly off-register |
| 0.93–1.23 s | 28–37 | "h." in the corner, then a tiny red ✳. Marker **`static`** @ 37: the finished, signed note |
| 1.23–1.57 s | 37–47 | picked up: it nudges up-right and turns to +1.5°; the shadow drifts and softens (lift) |
| 1.57–1.87 s | 47–56 | it leaves the desk: slides up-right until about 70% is out of frame; the shadow is gone |
| 1.87–2.00 s | 56–60 | hold: the corner of the note on its way out |

The last frame is on purpose not the reduced-motion still. Use the `static` marker frame for that.

## page-not-filed — 404

An archive drawer is searched. The marked card is pulled up, and it is empty: "hmm…", then a red "?".

| time | frames | what happens |
|---|---|---|
| 0.00–0.40 s | 0–12 | drawer draws itself: rim, three index cards with tabs, the front and its label |
| 0.33–0.53 s | 10–16 | stabilo swipe on the middle card's tab |
| 0.50–0.87 s | 15–26 | that card is pulled 84 px up out of the drawer, tilting −2.5° |
| 0.87–1.40 s | 26–42 | "hmm…" is written in ink to its left |
| 1.30–1.70 s | 39–51 | a red-pen "?" and its dot on the empty card |
| 1.70–1.80 s | 51–54 | hold |

## page-not-filed-loop — 404, seamless loop

This is the same drawer as `page-not-filed`, but it never finishes. The drawer is always drawn. The search happens, then everything goes back where it was. Frame 96 is identical to frame 0, so it loops with no seam. Its dotLottie manifest says `loop: true`.

| time | frames | what happens |
|---|---|---|
| 0.00–0.33 s | 0–10 | drawer at rest: three cards with tabs, label |
| 0.33–0.53 s | 10–16 | stabilo swipe on the middle card's tab |
| 0.50–0.87 s | 15–26 | the card is pulled up; it is empty |
| 0.87–1.40 s | 26–42 | "hmm…" is written beside it |
| 1.30–1.70 s | 39–51 | a red-pen "?" and its dot |
| 1.70–2.10 s | 51–63 | hold. Marker **`static`** at frame 60 is the still to show for reduced motion |
| 2.10–2.47 s | 63–74 | "?" and "hmm…" lift off the paper, in the order they were written |
| 2.40–2.80 s | 72–84 | the card slides back into the drawer |
| 2.73–2.93 s | 82–88 | the stabilo lifts off the tab |
| 2.93–3.20 s | 88–96 | at rest → frame 0 |

**Note.** Rule 10 of `docs/HILMAN-BITS.md` says "No frame loops on public pages", and 404 is a public page. If this variant ships, it needs a rule exception written down in the doc. It should also be paused off screen and never run under `prefers-reduced-motion`; show the `static` frame instead. Stopping after a few loops (for example 3) keeps it close to the rule. The one-shot `page-not-filed` needs no exception.
