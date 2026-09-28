# Lottie doodles

Four ink doodles for the notebook. Each one plays **once** and stops on its last frame.
The last frame is a finished drawing, so it can be shown as-is when the reader has
`prefers-reduced-motion` on (e.g. `goToAndStop(op - 1, true)`, or `autoplay: false` + last frame).

All four follow the same rules:

- Lottie JSON, bodymovin 5.7.4, **60 fps**. Hand-written as shape layers only.
- They run in lottie-web's **light** SVG build. None of them use expressions, effects, raster images, text layers, track mattes or masks.
- Transparent background (no bounding box). They are meant to sit on the cream sheet (`#F3EDDF`).
- Colours:
  - `#1F1D1B` ink for lines;
  - `#F4EEDF` cream for fills;
  - accents only where named: `#F5C518` stabilo, `#B5162B` red pen.
- Lines are ~3 px at native size, with round caps and joins. Paths are slightly irregular, as if drawn by hand.
- The main effect is trim path (the line draws itself). Every keyframe segment is ease-out, except the pre-sampled motion paths. Those are keyed every 1–2 frames with linear interpolation, and the ease-out is baked into their progress curve.
- Frame 0 is empty.

| file | canvas | fps | frames | duration | layers | colours | size |
|---|---|---|---|---|---|---|---|
| `notebook-doodle.json` | 240×200 | 60 | 96 | 1.6 s | 7 (1 null + 6 shape) | ink, cream, stabilo | 10.3 KB |
| `paper-plane.json` | 320×200 | 60 | 120 | 2.0 s | 2 | ink, cream | 14.6 KB |
| `notebook-flip.json` | 240×200 | 60 | 144 | 2.4 s | 7 | ink, cream, red pen | 16.1 KB |
| `pencil-scribble.json` | 200×160 | 60 | 108 | 1.8 s | 3 | ink, cream, stabilo | 14.0 KB |

Sizes are minified JSON, before gzip.

---

## notebook-doodle.json — analysis of "Hilman Bits - Notebook Doodle"

The source is the LottieFiles file `4f4495b7-cd6e-4754-8d31-d0de569c7772`, version 1
(public link `lottie.host/97d2896e-…/Ak9SdFAmjF.lottie`). It has not been edited since it was uploaded.

**What it draws.** A small cream index card is set down on the desk, with a slight tilt that settles at −2.2°. On it:

- three lines of scribbled "handwriting";
- a yellow stabilo swipe over the first line;
- an ink underline that curls into a little loop;
- a hand-drawn asterisk, made of three strokes.

A soft flat shadow sits under the card.

**Timeline**

| time | frames | what happens |
|---|---|---|
| 0.00–0.18 s | 0–11 | card + handwriting fade in; card rises from 24 px lower, tilted −6.5° |
| 0.18–0.63 s | 11–38 | card lifts slightly past its spot (0.32 s), then settles at −2.2°; shadow tightens |
| 0.45–1.00 s | 27–60 | stabilo swipe draws left → right (a small hesitation at ~60%) |
| 0.87–1.28 s | 52–77 | ink underline draws, ending in a small loop |
| 1.23–1.50 s | 74–90 | asterisk, three strokes one after another |
| 1.50–1.60 s | 90–96 | hold (last frame = finished card) |

**Tech.**

- Canvas: 240×200, 60 fps, 96 frames (1.6 s).
- Layers: 7 (1 null "paper-rig" + 6 shape layers).
- Colours: ink `#1F1D1B`, cream `#F4EEDF`, yellow `#F4C430`. The shadow is ink at 22% opacity.
- No raster images; about 10 KB.

**Checked against the spec**

| check | original | status |
|---|---|---|
| expressions / effects / raster / text / mattes / masks | none | ✅ |
| background | transparent | ✅ |
| loop | the JSON has no loop; looping is a player setting | ✅ (play with `loop: false`) |
| frame 0 empty | card, handwriting and shadow start at 0% opacity | ✅ |
| last frame | finished card | ✅ |
| stabilo colour | `#F4C430` | ❌ spec is `#F5C518` |
| line weight ~3 px | handwriting 2.3, card outline 2.4 | ❌ too thin at small sizes |
| easing ease-out | several segments were ease-in-out `(0.25,0.1)→(0.3,1)` | ❌ |

**What changed in this file (v2).** The drawing, layout and timing are kept.

- Stabilo is now `#F5C518`.
- Line weights are 2.8–3.4 px:
  - handwriting and card 2.8;
  - underline 3.2;
  - asterisk 3.4.
- Every segment uses ease-out `(0.33,1)→(0.68,1)`.

The version on LottieFiles is still the original. This repo file is the corrected one.

**Where to use it.** Use it on Home, as a small full stop between the hero and **Selected Works**, at 160–220 px wide. Play it once when it scrolls into view. It also works at the top of **Journal**.

---

## paper-plane.json — Connect, after "Got it. Thanks!"

| time | frames | what happens |
|---|---|---|
| 0.03–0.60 s | 2–36 | paper plane is drawn in ink: wing, then body, then the fold; its paper fill fades in behind the lines |
| 0.60–1.80 s | 36–108 | plane flies to the upper right along a curve with **one loop**, pointing along its path. A dashed ink trail draws behind it in step with the plane. The plane shrinks 100% → 55% |
| 1.80–2.00 s | 108–120 | hold: whole trail, small plane at its end, still inside the canvas |

- Layers: plane, trail.
- The plane's position, rotation and scale, and the trail's trim, are keyed every 2 frames from one sampled path. This keeps the plane on the tip of the trail. The trail is a dashed stroke (5 on, 8 off).

## notebook-flip.json — 404 ("flipped through every page…")

| time | frames | what happens |
|---|---|---|
| 0.00–0.55 s | 0–33 | open notebook draws itself: spine, both pages, the page-block edges underneath; cream fades in; faint ruled lines draw in (ink 32%) |
| 0.55–1.60 s | 33–96 | three pages turn right → left, starting 0.3 s apart. Each turn is a morph of the page outline: flat, then lifted, then landed |
| 1.65–2.25 s | 99–135 | a small **red-pen question mark** is written on the right page, then its dot |
| 2.25–2.40 s | 135–144 | hold: open book with the question mark |

- Layers:
  - question mark;
  - ruled lines, left and right;
  - three turning pages;
  - the book.

## pencil-scribble.json — spare, for Journal or Lab

| time | frames | what happens |
|---|---|---|
| 0.00–0.12 s | 0–7 | pencil fades in and lands at the start of the line |
| 0.10–1.05 s | 6–63 | pencil writes a wavy, loopy scribble. Its tip stays on the end of the line, and it rocks ±4° with the stroke |
| 1.05–1.55 s | 63–93 | a yellow stabilo underline swipes under the scribble; the pencil lifts a touch and rests at the end |
| 1.55–1.80 s | 93–108 | hold: scribble + underline, pencil resting at the end of the line |

- Layers: pencil, scribble, stabilo.
- The pencil's position and rotation are keyed every 2 frames. The scribble's trim is keyed every frame, so the line stays exactly under the lead.
