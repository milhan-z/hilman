# Lottie — Hilman Bits illustrated moments

**Lottie is for illustrated moments. HILMAN BITS is for interface motion.**
There is at most one of these per screen, each plays **once**, and none is used where
`docs/HILMAN-BITS.md` already spends the page's motion budget.

| file | where | trigger |
|---|---|---|
| `sent-note` | Connect | only after the message was really sent |
| `page-not-filed` | 404 (`app/not-found.tsx`) | on load |
| `notebook-doodle` | static illustration only (Home is at 3/3 primitives). Can move, animated, to Journal | — |

Each asset comes in two forms:

- **`.lottie`** — a dotLottie v1 container (`manifest.json` + `animations/<id>.json`, deflate; `loop: false`, `autoplay: false`).
- **`.json`** — the same animation as plain Lottie JSON.

They are the same animation. Use `.lottie` with a dotLottie player (`@lottiefiles/dotlottie-web`, which loads a WASM renderer). Use `.json` with `lottie-web`'s light build, which cannot read `.lottie`.

The three are also uploaded to LottieFiles (workspace "milzhar's Workspace", Drafts). LottieFiles makes its own dotLottie and optimized dotLottie from each upload:

- Sent Note — https://app.lottiefiles.com/animation/8d821702-7626-4fe8-ad1f-86fdb1e97a6a
- Page Not Filed — https://app.lottiefiles.com/animation/231c6aa5-707c-4270-be3a-13a8d21feb46
- Notebook Doodle v3 — https://app.lottiefiles.com/animation/a62af5ab-9f96-40de-b3b8-2eae787e1530

## Shared spec

- Bodymovin 5.7.4, **30 fps**, canvas **320×320**. Meant to be shown at 120–280 px.
- Shape layers and nulls only. There are no expressions, effects, raster images, text layers, mattes or masks, so the files run in `lottie-web` light.
- Transparent background. Drawn for the cream sheet (`#F3EDDF`).
- Colours:
  - `#1F1D1B` ink;
  - `#F4EEDF` cream fill;
  - accents, only where named: `#F5C518` stabilo, `#B5162B` red pen.
- Lines are 3.6–5 px on the 320 canvas (about 2 px at 160 px on screen), with round caps and joins. Paths are slightly uneven, like a hand drew them.
- The main effect is trim path (the line draws itself). Every keyframe segment is ease-out `(0.33,1)→(0.68,1)`, with no bounce.
- Frame 0 is empty. The **last frame is the finished drawing**. Use it as the reduced-motion image.
- Play with `loop: false`. Mark the element `aria-hidden="true"`.

| asset | fps | frames | duration | layers | colours | .json | .lottie |
|---|---|---|---|---|---|---|---|
| sent-note | 30 | 39 | 1.3 s | 7 (1 null + 6) | ink, cream, stabilo, red | 14.6 KB | 2.4 KB |
| page-not-filed | 30 | 54 | 1.8 s | 7 | ink, cream, stabilo, red | 13.7 KB | 2.0 KB |
| notebook-doodle | 30 | 48 | 1.6 s | 7 (1 null + 6) | ink, cream, stabilo | 10.3 KB | 2.2 KB |

## sent-note — Connect success

A small note that is already written is stamped **SENT** in red pen and slides a little up and to the right, as if it has been sent.

| time | frames | what happens |
|---|---|---|
| 0.00–0.23 s | 0–7 | card with "hey hilman" + lines fades in and settles (rises 14 px, −5° → −2.5°) |
| 0.10–0.33 s | 3–10 | the last short line and a small sign-off are written |
| 0.27–0.60 s | 8–18 | yellow stabilo swipes under "hey hilman" |
| 0.57–1.10 s | 17–33 | red-pen stamp: box, then S-E-N-T letter by letter, then a small ✳ |
| 0.90–1.23 s | 27–37 | the note slides 20 px right / 16 px up, turning to +1.5°. Its shadow stays on the desk and softens |
| 1.23–1.30 s | 37–39 | hold |

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

## notebook-doodle — v3 of "Hilman Bits - Notebook Doodle"

This is the same drawing as the original LottieFiles file (`4f4495b7-…`), redone to the shared spec:

- canvas 240×200 → 320×320, scaled up 1.3×;
- 60 → 30 fps;
- stabilo `#F4C430` → `#F5C518`;
- lines 2.3–3.4 → about 4–5 px;
- every segment is ease-out.

A cream index card is set on the desk, tilting to −2.2°. It has three lines of handwriting, a stabilo swipe, an ink underline that curls into a loop, and a three-stroke asterisk.

| time | frames | what happens |
|---|---|---|
| 0.00–0.63 s | 0–19 | card fades in, rises and settles; shadow tightens |
| 0.47–1.00 s | 14–30 | stabilo swipe on the first line |
| 0.87–1.30 s | 26–39 | ink underline with a loop |
| 1.23–1.50 s | 37–45 | asterisk, three strokes |
| 1.50–1.60 s | 45–48 | hold |

**Analysis of the original** (240×200, 60 fps, 96 frames, 7 layers, ~10 KB):

- **What was already fine:** no expressions, effects or raster; transparent background; frame 0 empty; last frame complete; no loop in the file.
- **What failed the spec:**
  - the stabilo colour;
  - thin lines (2.3–2.4 px);
  - some ease-in-out segments.

v3 fixes these.

Home already uses 3/3 animated primitives, so there it should only be the static last frame. Played once, it would fit Journal.
