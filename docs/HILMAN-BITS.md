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
| `HandDrawnReveal` | A line drawing itself under, around or beside a word — with a pen, a brush, or a marker pressed flat behind it | Pen: SVG through a dashed mask (`pathLength`). Brush and marker: CSS `scale`, compositor only | Wave 1 |
| `EditorialReveal` | The details around a title inked in after it, the title already printed | CSS keyframes; `InView` for `trigger="view"` | Wave 1 |
| `PaperCard` | A card lifted a little off the desk | CSS | Wave 1 |
| `Tally` | A number that rolls over when it changes in front of you | Web Animations API | Wave 1 |
| `WorkTransition` | A card's photograph carried into the cover of the work it opens | React `<ViewTransition>` over the browser's View Transitions, compositor only | Wave 2 |
| `PhotoStack` | A pile of prints, one on top with its words, the rest underneath; put the top one back to see the next | A server-drawn pile (CSS grid, one cell) + `InView`; its hands — put back, look closer — load after the page (Web Animations API for the lift) | Wave 2 |
| `ImagePeek` | A photograph tucked behind a card, its top peeking out over the card's edge while you point at the card or focus it | CSS only: the picture is a `background-image` that only the hover and focus rules set, so it is fetched when first wanted and never on a phone. It does not follow the pointer | Wave 2 |
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
| Home | HandDrawnReveal (name brush), EditorialReveal (intro details), NotebookMoment (Play drawings and invitation; one finite illustration per section). Project proofs and Journal are static; no card lift/peek or count animation on Home. | 3 |
| Works, Journal | The line under the title; the cards (on Journal, an entry's cover peeks out from behind its card as you point at it) | 2–3 |
| A work, a journal entry | The details around the title (never the title); the reader count; previous and next, lifted cards with the page they lead to peeking out from behind them; a Stack gallery's prints settling onto the desk as it comes into view, when the author chose a Stack | 2–3, and the pile |
| About | The pen under the signed "Hilman." on the card as the page opens; the marker behind the page's two headings as they come into view; the moments, a pile dropped on the desk as it comes into view, and a print put back underneath when you ask (only when there are moments) | 1–2 |
| Lab | The line under the title | 1 |
| Connect | The line under the title; a small SVG response inside the transparent send button | 1 primitive + action feedback |
| 404 | The card pulled from the drawer (Lottie) | 1 |
| Studio | Nothing — feedback only, 150 ms or less. (It downloads bits.css with the rest of the stylesheet; nothing there uses it.) | 0 |

`WorkTransition` is not in the counts: it moves *between* two pages, while
nothing on either is moving. Opening a work from its card on Works
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

## Home contract after the October audit

The project proof and Journal sections are server-rendered, already in their
finished state. They add no scroll triggers, timelines or continuous loops.
Their links navigate normally; repeated input and interruption belong to the
browser/router rather than an animation queue. With reduced motion or no
JavaScript, the same media, context and links remain. Missing real media is
omitted, not replaced with an invented proof.

The name brush and intro EditorialReveal still play once. NotebookPlay now
uses three original transparent Lottie drawings instead of glyph entrances.
Choosing Design/Motion/Code updates caption and pressed state immediately;
rapid choices cancel the previous drawing and leave the latest mode selected.
Selecting the same mode does nothing; the separate **Play again** button is an
explicit replay. Reduced motion shows the matching static SVG and makes replay unavailable without removing keyboard focus.
The invitation's former animated underline is now static, accompanied by the
existing `filed-idea` drawing. No extra sensor experiment or dependency is added.
The existing light Lottie runtime is shared by these placements and the 404.

## Local verification of decorative moments — 12 October 2026

Against `work` at `6bb77c0`, the decorative follow-up passed 77 relevant existing
tests, typecheck and production build. Chromium checked Home at 360/390/430/768/
1440px in Night/Paper and normal/reduced motion (20 combinations), including
keyboard/touch-equivalent selection, replay, immediate state changes and no
horizontal overflow. Delayed old requests, HTTP503 fallback, offscreen pause,
simulated background visibility, reduced-motion interruption with stable focus,
no-JavaScript SVGs and the existing 404 illustration passed. Production Home
also played all three modes to completion at 390px. Evidence and recordings:
`/workspace/hilman-audit/lottie-moments/`. Physical iPhone/Safari/VoiceOver and
real mobile OS suspension remain unverified. These checks preceded the user’s
subsequent authorization to commit and push this follow-up to master. It
introduces no schema or dependency changes.

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

## Public controls: ink and paper feedback

Buttons, arrow links, navigation and filter controls share small, user-triggered
responses. Nothing new plays on load or continuously; the existing page
entrances and NotebookPlay glyph remain their own moments. These controls use
CSS and inline SVG rather than another animation runtime.

- **Buttons:** a fixed offset paper edge fades in on hover/focus, with a 1px
  press. Primary navigation arrows travel 2px diagonally; ghost/cream buttons
  answer with an ink tint. Disabled controls stay still and retain their native
  disabled behavior. Only named properties transition; shadows themselves do not.
- **Links and navigation:** a short underline inks in and arrow links point
  3px toward their destination (reversed for Back). Current-route ink stays
  visible. Hover is gated to a fine pointer; focus and pressing provide the
  equivalent cue. Arrow-link touch targets are at least 44px high.
- **Theme and menu:** both destination icons occupy the same 20px SVG box, with
  a 120ms crossfade driven by the already-applied document theme. The two menu
  strokes become an X in 150ms. Theme, expanded state, labels and navigation
  update immediately; they never wait for animation completion.
- **Filters and Lab modes:** existing selected fills remain, with a small ink
  dot reinforcing the selected state. Hover/focus/press follow the same visual
  language; no additional glyph or list animation is introduced. Works reset
  controls now also provide 44px targets.

Repeated input updates the current state and reverses CSS transitions instead
of queuing animation. Leaving hover/focus restores the resting appearance;
menu/theme interruption settles to the latest state. Reduced motion removes
transitions and movement, showing the correct underline, icon and selection
immediately, even if the preference changes mid-interaction. The server still
sends readable labels and ordinary links with JavaScript disabled; interactive
theme, menu and filtering behavior requires JavaScript as before.

## Connect: feedback inside the send button

Connect keeps its form visible after sending. The transparent outlined button
holds a small SVG, with no cream illustration panel and no Lottie download.
Submitting nudges the plane once (420 ms), then it rests while the request is
pending. Only the server's success result changes it to a check drawn once
(240 ms) and the stable “Sent. Thank you!” label. Animation completion never
sends a message or determines delivery.

Pending and sent states prevent repeated submissions and make the fields
read-only. Errors retain the visitor's note and allow retry. “Write another
note” explicitly opens an empty form and focuses Name; a rerender or focus
change does not reset a sent note. The live status announces progress and
outcome, while the SVG is hidden from assistive technology. Keyboard focus
stays on the same submit control as its label changes.

Reduced motion shows the static plane/check and skips both animations, also
when the preference changes during feedback. The form's content and button
are visible in the server HTML. Motion is CSS scoped to this control and has
no timer, loop, external asset, or new runtime.

## Lottie: illustrated moments

HILMAN BITS provides interface feedback; Lottie provides short notebook
illustrations. These are decorative, transparent shape drawings played by
`NotebookMoment` (`components/bits/notebook-moment.tsx`).

| Where | Drawing | Trigger / final state |
|---|---|---|
| Home / Play | A design sketch and pencil, a folded paper plane, a little code window (`play-design`, `play-motion`, `play-code`, each 2.4 s) | Once on view or mode change; rests on the finished drawing. Explicit replay button. |
| Home / invitation | Three loose ideas gather into a signed note (`filed-idea`, 2.4 s) | Once on view, then the finished note. Replaces the animated underline in this section. |
| 404 | A drawer searched and a card marked “?” (`page-not-filed`, 1.8 s) | Once on view, then its last frame. |

- **No automatic loops or hover replays.** Repeated mode input stays settled;
  rapid changes follow the latest choice without an animation queue. Leaving
  the viewport or backgrounding the tab pauses playback; returning resumes
  that playback, and a completed drawing stays completed.
- **Deferred player.** Both the JSON and dynamic import of the existing
  lottie-web light SVG player (5.13.0) wait until the illustration is visible.
  Reduced motion does not load them. Home uses the shared player; Connect,
  navigation, footer and the site shell do not import it. No new dependency.
- **Static first.** Each asset has a local SVG still, visible before hydration,
  without JavaScript, on load failure and with reduced motion. Preference
  changes during playback immediately reveal that still and stop the player.
  The reserved square prevents layout shifts; all illustration markup is
  `aria-hidden`, cannot receive focus, and cannot intercept pointer input.
- **Cleanup.** Switching/removing a drawing aborts its fetch and destroys only
  its own player. A late old response cannot overwrite or destroy a new mode.
- **Original assets.** `scripts/create-notebook-doodles.mjs` generates the three
  Play JSON/SVG pairs from shared vector coordinates, using the notebook's
  cream, ink, yellow and red. They use no external art, fonts or images. Paper
  shapes are cream but the surrounding canvas is transparent in Night/Paper.

`sent-note` and `page-not-filed-loop` remain unused assets. Connect retains its
small transparent send-button feedback; the earlier success panel does not
return. The 404 still uses its cream sheet. See `public/lottie/README.md` for
asset details and original timelines.

One exception, measured: the 404 draws its card only where the not-found
file is the page — a URL with no route at all. Next also sends a finished
copy of the not-found inside every other page, ready for a page that calls
`notFound()`, and every page downloads the client code in that copy whether
it is shown or not. With the card in it, Home, Works, Journal, About and the
Lab each carried 4.5 KB more gzipped JavaScript. So a missing work or journal
entry gets the same 404 without the card.

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
  from `ReaderCount`). And the production build folds small client chunks
  together: client code only one page uses can land in the chunk every page
  shares. Measured with PhotoStack: imported statically it put ~3 KB on
  Home and every entry; through `next/dynamic`, that loader's ~1.2 KB went
  there instead. Keep a page's own client code to a few hundred bytes and
  bring the rest with a plain `import()` after the page
  (`photo-stack-hands.tsx`), then check each page's JavaScript against
  master.
- Never wrap server-rendered content in `<Suspense>` on a public page.
  React 19 sends a large boundary — or one with images in it — as a hidden
  segment that a script moves into place, even when nothing in it waits:
  with JavaScript off, About's moments were not there at all. Render the
  content on the server, and load behaviour, not markup.
- It works on a phone at 390 px with a finger, with a keyboard, with reduced
  motion, and with JavaScript off.
- If it reads a token from JavaScript, it reads it with its unit
  (`cssDuration` in `tokens.ts`): the production build's minifier ships
  `520ms` as `.52s`, and a bare `parseFloat` turns that into half a
  millisecond. Check it in `next build`, not only in `next dev`.
- `npm test` passes: the contract test, a render test showing its content is
  in the server HTML, and tests for any logic it carries.
- It is added to both tables above, including where it is used.
