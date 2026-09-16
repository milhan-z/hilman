# Hilman's personal notebook

The portfolio introduces a person who studies Informatics at ITS and explores
design, video, motion, photography, and code. Warmth comes from genuine stories
about people, collaboration, and ITS Global Engagement. Dark surfaces, yellow
accents, cream paper, and handwritten details support those stories.

## What changed

- Home introduces Hilman clearly, then shows published work, people, notes, a
  small interactive sketch, and an invitation to collaborate. When no genuine
  projects are ready, it describes interests without presenting them as work.
- About supports personal interests, a community story, a real portrait, and
  optional photo moments with captions and alternative text.
- Works uses the readable labels Design, Film & Photo, and Code. Project pages
  highlight the contribution, description, story chapters, and contact link.
- Mobile navigation supports Escape and returns focus to its trigger. Filters
  have larger touch targets; search fields use readable mobile text. Theme state
  stays consistent when resizing. Introductory content is visible before hydration.
- Studio edits the same resolved values visitors see, retains unrelated stored
  fields, and respects intentionally emptied personal fields. Contact text stays
  in the form after a failed send.
- The runtime was updated to Next.js 16 and React 19. Owner checks deny access
  when verification fails. See `UPGRADE-NEXT.md` for the migration details.

## Content integrity

No database records were deleted or rewritten for this improvement. Public reads
screen known demo stories, unchanged writing prompts, placeholder links, and
confirmed repeated test text. The same checks run when saving published content,
quick publishing, and bulk publishing; draft editing remains available.

The checks use content rather than a slug blacklist. Rewriting a demo into genuine
work keeps its URL usable. Adding a video to an otherwise unchanged seeded story
does not make that story publishable. These checks identify known placeholders;
they cannot prove authenticity or judge editorial quality.

`lib/profile.ts` contains defaults based on Hilman's brief. Exact old seed values
are replaced at read time; custom values and explicit empty strings/arrays remain.
Unverified seeded portraits, timeline claims, and social URLs are not shown.

## Make it yours in Studio

1. **Pages → Home:** refine the headline, introduction, and small handwritten note.
   Optionally add a real image with its own caption and descriptive alternative text.
2. **Pages → About:** add a portrait, adjust the community story, and collect a few
   moments with people. Each moment accepts an image, title, caption, and alt text.
   Use the media library's Cloudinary assets or configured Cloudinary URLs.
3. **Projects:** choose a few real works across creative and technical interests.
   For each, describe why it existed, your exact role, a meaningful decision, the
   process, and the result. Use only outcomes you can substantiate. Replace every
   writing prompt before publishing.
4. **Journal:** add observations, behind-the-scenes notes, or experiments. Short
   genuine notes are welcome; there is no arbitrary minimum story length.
5. **Settings:** enter verified social URLs. Publish a CV link only if an actual
   current file is available.

Suggested project chapters: **The starting point → My contribution → What I
tried → The result → What I learned**. Heading blocks automatically form the
project's chapter navigation. Use a real result even if it is modest; omit claims
that do not apply.

## Verification and release

Run `npm test`, `npm run typecheck`, and `npm run build`. The test suite covers
owner policy, seeded content with appended or rearranged blocks, rewritten work,
short genuine notes, preservation of custom data, explicit field clearing, and
public/editor round trips.

Browser checks cover desktop and small mobile layouts, both themes, the notebook
interaction, mobile menu focus, contact required fields, and unauthenticated
Studio redirects. Authenticated save/upload/delete flows require an owner session
and have not been exercised end-to-end in this change. No production deployment
was made. Set `NEXT_PUBLIC_SITE_URL` to the actual public origin before deploying.
