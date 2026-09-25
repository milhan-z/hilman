# HILMAN BITS

The notebook's own motion language: a handful of small primitives in
`components/bits/`, each with one visual idea, that pages compose. It is not a
component library and it is not React Bits. It borrows React Bits' way of
building things (one idea per file, a thin component over a cheap engine,
styling through data attributes and CSS variables) and none of its look.

What they should feel like: paper, ink, photographs, a person's handwriting.
Editorial, tactile, slightly imperfect, playful without being loud. What they
must never become: neon, glass, particles, a cursor that follows you, text
that blurs in letter by letter, a page that scrolls itself.

## The primitives

| Primitive | The one idea | Engine | Status |
|---|---|---|---|
| `HandDrawnReveal` | A line drawing itself under, around or beside a word — with a pen, or with a brush | Pen: SVG through a dashed mask (`pathLength`). Brush: CSS `scale`, compositor only | Wave 1 |
| `EditorialReveal` | The details around a title inked in after it, the title already printed | CSS keyframes; `InView` for `trigger="view"` | Wave 1 |
| `PaperCard` | A card lifted a little off the desk | CSS | Wave 1 |
| `Tally` | A number that rolls over when it changes in front of you | Web Animations API | Wave 1 |
| `WorkTransition` | A card's photograph carried into the cover of the work it opens | React `<ViewTransition>` over the browser's View Transitions, compositor only | Wave 2 |
| `PhotoStack` | Photographs dropped on a desk (the gallery stack, generalised) | CSS variables + `InView` | Wave 2 |
| `ImagePeek` | A photograph peeking out from behind a title | CSS + pointer → CSS variables | Wave 2 |
| `ChapterMark` | An archive tab that changes with the chapter | One IntersectionObserver + CSS | Wave 3 |
| `MarginNote` | A handwritten note in the margin | SVG + CSS (needs a Studio block) | Wave 3 |
| MagneticNote, CursorReaction, PaperFloat | Ambient, always moving | — | Lab only |

`InView` (`components/bits/in-view.tsx`) is not a primitive but the trigger
the others share: *wait until this is on screen, then play, once*. The server
sends everything finished; after hydration, whatever is below the fold is put
back to where its entrance starts and plays as it comes into view. The
gallery Stack settles through it too (the "Pile" section of `bits.css`): the
tilt of each print is its shape, and the drop onto the desk is the shared
entrance, with the shared numbers — no observer or state of its own.

## Where they are used

The budget is one signature moment per screen and at most three animated
primitives per page. Every page is inside it.

| Page | What moves | Primitives |
|---|---|---|
| Home | The brush swept under "Hilman"; the lines under the title arriving in turn; section headings arriving as they scroll in; the pen under "together."; the cards | 3 |
| Works, Journal | The line under the title; the cards | 2 |
| A work, a journal entry | The details around the title (never the title); the reader count; the related cards; a Stack gallery's prints settling onto the desk as it comes into view, when the author chose a Stack | 2–3, and the pile |
| About, Lab, Connect | The line under the title | 1 |
| Studio | Nothing — feedback only, 150 ms or less. (It downloads bits.css with the rest of the stylesheet; nothing there uses it.) | 0 |

`WorkTransition` is not in the counts: it moves *between* two pages, while
nothing on either is moving. Opening a work from its card on Home or Works
carries the card's photograph into the cover (520 ms) under the entry header,
which is simply there; the pages themselves swap at once, as on every other
navigation. Going back through the site's own links ("Back to the archive",
the nav) carries it back into its card when both are on screen. What it does
not do, on purpose or by measurement:

- No pair, no movement: a work without a cover, a destination not prefetched
  yet, a photograph off screen at either end, a browser without View
  Transitions. Those are ordinary navigations.
- The browser's back button and a swipe back are ordinary navigations too:
  React does not start a transition for them (measured on React 19.3 /
  Next 16.3), and a phone's own swipe animation is better left alone.
- A cover can still be loading when it lands — React holds the page for small
  images, not for one that size — so the photograph stays solid and the cover
  fades in over it, instead of the two cross-fading into an empty frame.
- It costs about 50 ms between the click and the new page (the browser
  photographs the card first); the click itself answers as fast as before.
- It needs `data-scroll-behavior="smooth"` on `<html>`: without it, a page
  opened from far down the list glided up from there for over half a second
  (on master too) and the photograph landed on a cover still on its way up.

## The rules

1. **Purpose.** Motion earns its place by explaining a change, answering a
   touch, setting the hierarchy, or being *the* moment of a screen. "It looks
   cool" is not on the list.
2. **Budget.** See above. Everything else on the page is still.
3. **Timing.** From the tokens in `app/globals.css`, always in milliseconds:
   `--motion-fast` 150 (a press), `--motion-base` 250 (a change of state),
   `--motion-reveal` 520 (an arrival), `--motion-draw` 900 (a line). A stagger
   step is 40–80 ms and a whole sequence staggers for 400 ms at most. Nothing
   in the interface takes longer than 1.2 s.
4. **Easing.** Arrivals decelerate (`--motion-ease-out`); lines draw on
   `--motion-ease-draw`. No bounce on text, ever. Linear is for progress only.
5. **Distance.** Translate 4–12 px (`--motion-rise` is 8, and 6 on a phone),
   rotate 1.5° at most, scale between 0.97 and 1.03. Paper doesn't fly.
6. **Hover is a bonus.** Every hover has a `:focus-visible` twin and a touch
   answer (`:active`, a tap). Hover styles live behind
   `(hover: hover) and (pointer: fine)`. Nothing is only visible on hover.
7. **Scroll.** Entrances play once, through `InView`. No scroll-jacking, no
   smooth-scroll library, nothing scrubbed to the scroll position except a
   progress indicator.
8. **Reduced motion is not an option you can turn off.** There is no
   `respectReducedMotion` prop. Movement is written inside
   `prefers-reduced-motion: no-preference` blocks, so reduced motion gets the
   finished page by construction: no translate, rotate, scale or autoplay; a
   fade of 150 ms or less at most.
9. **The page is finished without JavaScript.** Content is in the HTML and
   visible with no script. Nothing is hidden waiting to animate in, and
   nothing on the first screen starts invisible: a load entrance begins at
   half opacity, so it is readable, and counted as painted, from the first
   frame. Which element is the largest on the first screen changes with the
   screen and the words — on a phone the Home intro outgrows the title —
   and fading it in from 0 held LCP back by ~740ms. Titles never move at
   all. Measure a new entrance with Lighthouse against master before
   shipping it.
10. **Only what is cheap moves.** `translate`, `rotate`, `scale`, `opacity`,
    and a stroke offset. No filters, no blur, no animated shadows (fade in a
    pseudo-element that already has the shadow instead). No frame loops on
    public pages; canvas and WebGL stay in the Lab, with the device pixel
    ratio capped (2, and 1.5 on touch screens) and the loop paused off screen.
11. **Accessible.** Real text stays in the DOM; decoration is `aria-hidden`.
    Interactive things are real links and buttons. An animation never moves
    focus.
12. **Small APIs.** One idea per primitive. Content is required, never a
    placeholder default. Randomness comes from a `seed`. No global side
    effects. `as` and `className` where they make sense. A prop exists
    because somebody needs to change it, not because it could be changed.

## Adding a primitive

- It does one thing you can describe in a sentence, and that sentence isn't
  already in the table above.
- One file in `components/bits/`, a doc comment on every export, a server
  component unless it truly needs the browser (then it joins the allowlist in
  `tests/bits-contract.test.ts`, with a reason).
- Its CSS is a section of `components/bits/bits.css`: `bits-` class names and
  keyframes, movement inside `prefers-reduced-motion: no-preference`, any
  "waiting" state inside `@media screen and (…no-preference)`. The sheet is
  imported next to `globals.css` so it ships in the same file; a stylesheet
  of its own is one more render-blocking request on every page.
- Client code stays where it is used. A module the lists import must not
  bring a primitive only the entry pages need (why `ReaderTally` lives apart
  from `ReaderCount`).
- It works on a phone at 390 px with a finger, with a keyboard, with reduced
  motion, and with JavaScript off.
- If it reads a token from JavaScript, it reads it with its unit
  (`cssDuration` in `tally.tsx`): the production build's minifier ships
  `520ms` as `.52s`, and a bare `parseFloat` turns that into half a
  millisecond. Check it in `next build`, not only in `next dev`.
- `npm test` passes: the contract test, a render test showing its content is
  in the server HTML, and tests for any logic it carries.
- It is added to both tables above, including where it is used.
