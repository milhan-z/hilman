import type { Metadata } from "next";
import { Pic } from "@/components/cld-image";
import { ContentUnavailablePage } from "@/components/content-unavailable";
import { DrawAccent } from "@/components/draw-accent";
import { SectionReveal } from "@/components/motion";
import { PersonalMoments } from "@/components/personal-moments";
import { ArrowLink, Button, Kicker, Tag } from "@/components/ui";
import { getPage, load } from "@/lib/data";
import { mediaSrc } from "@/lib/cloudinary";
import { resolveProfileData } from "@/lib/profile";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "About",
  description: "Meet Hilman: an Informatics student at ITS exploring design, media, code, and the things we make together.",
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    : [];
}

export default async function AboutPage() {
  const pageRes = await load(() => getPage("about"));
  if (!pageRes.ok) {
    return <ContentUnavailablePage what="the About page" detail={pageRes.error} />;
  }
  const d = resolveProfileData("about", pageRes.value?.data);
  const hasPortrait = Boolean(mediaSrc(d.portrait));
  const story = strings(d.story);
  const focus = strings(d.focus);
  const interests = strings(d.interests);
  const toolbox = strings(d.toolbox);
  const currently = strings(d.currently);
  const timeline = Array.isArray(d.timeline)
    ? d.timeline.filter((item: any) => item && typeof item.text === "string" && item.text.trim())
    : [];

  return (
    <div className="mx-auto max-w-wide px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20">
      <header className="grid items-start gap-10 lg:grid-cols-[1.3fr_0.85fr] lg:gap-20">
        <div>
          <Kicker>a little more than the work</Kicker>
          <h1 className="mt-5 font-display text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            Hi, I&apos;m <span className="relative inline-block">Hilman.<span aria-hidden className="absolute -bottom-3 left-0 right-0 overflow-hidden"><DrawAccent variant="underline2" color="yellow" width={260} strokeWidth={4} /></span></span>
          </h1>
          {d.lede && <p className="mt-10 max-w-2xl text-pretty text-xl font-medium leading-relaxed sm:text-2xl">{d.lede}</p>}
          {story.length > 0 && (
            <div className="mt-6 max-w-2xl space-y-5 text-base leading-relaxed text-soft sm:text-lg">
              {story.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/connect">Let&apos;s make something</Button>
            <Button href="/works" variant="ghost">Explore my work</Button>
          </div>
        </div>

        <aside className="mx-auto w-full max-w-md lg:pt-4" aria-label="A personal note">
          {hasPortrait ? (
            <figure className="relative bg-cream p-3 pb-5 text-cream-ink shadow-lift sm:rotate-1">
              <span aria-hidden className="absolute -top-2 left-1/2 z-10 h-5 w-20 -translate-x-1/2 -rotate-3 bg-hl" />
              <Pic
                src={d.portrait}
                alt={d.portrait_alt || "Hilman"}
                width={900}
                height={1100}
                sizes="(max-width: 1024px) 90vw, 420px"
                priority
                className="aspect-[4/5] w-full object-cover"
              />
              {d.portrait_caption && <figcaption className="px-2 pt-4 font-hand text-xl leading-snug text-cream-soft">{d.portrait_caption}</figcaption>}
            </figure>
          ) : (
            <div className="relative rounded-sm bg-cream p-7 text-cream-ink shadow-lift sm:rotate-1 sm:p-9">
              <span aria-hidden className="absolute -top-2 right-9 h-5 w-16 -rotate-6 bg-hl" />
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-cream-soft">A few things I gravitate towards</p>
              <p className="mt-7 font-display text-3xl font-medium leading-[1.12] tracking-tight sm:text-4xl">
                Design.<br />Code.<br /><span className="italic">And everything<br />in between.</span>
              </p>
              {interests.length > 0 && (
                <ul className="mt-7 flex flex-wrap gap-x-3 gap-y-2 border-t border-cream-line pt-5 text-sm text-cream-soft">
                  {interests.map((interest, index) => (
                    <li key={index} className="flex items-center gap-3"><span aria-hidden className="text-cream-soft">✦</span>{interest}</li>
                  ))}
                </ul>
              )}
              {d.personal_note && <p className="mt-6 font-hand text-xl leading-snug text-cream-soft">{d.personal_note}</p>}
            </div>
          )}
          {hasPortrait && d.personal_note && <p className="mt-7 px-2 font-hand text-xl leading-relaxed text-soft">{d.personal_note}</p>}
          {hasPortrait && interests.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2" aria-label="Personal interests">
              {interests.map((interest, index) => <Tag key={index}>{interest}</Tag>)}
            </div>
          )}
        </aside>
      </header>

      {focus.length > 0 && (
        <section className="mt-16 border-y border-line-strong py-7 sm:mt-20" aria-labelledby="focus-heading">
          <div className="grid gap-5 lg:grid-cols-[0.7fr_2fr] lg:gap-12">
            <h2 id="focus-heading" className="font-hand text-2xl text-pen">Where my curiosity goes</h2>
            <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {focus.map((item, index) => (
                <li key={index} className="flex items-baseline gap-3 text-soft"><span aria-hidden className="text-pen">↗</span><span>{item}</span></li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {d.community_story && (
        <SectionReveal>
          <section id="people" className="scroll-mt-24 py-16 sm:py-20" aria-labelledby={d.community_heading ? "community-heading" : undefined} aria-label={d.community_heading ? undefined : "People and community"}>
            <div className="grid gap-7 lg:grid-cols-[0.85fr_1.3fr] lg:gap-20">
              <div>
                <Kicker>the people are part of the story</Kicker>
                {d.community_heading && <h2 id="community-heading" className="mt-4 max-w-md font-display text-3xl font-medium tracking-tight sm:text-4xl">{d.community_heading}</h2>}
              </div>
              <div className="lg:pt-8">
                <p className="max-w-2xl whitespace-pre-line text-lg leading-relaxed text-soft">{d.community_story}</p>
                <ArrowLink href="/journal" className="mt-6">Read my notes &amp; stories</ArrowLink>
              </div>
            </div>
          </section>
        </SectionReveal>
      )}

      <PersonalMoments moments={d.moments} />

      {(timeline.length > 0 || toolbox.length > 0 || currently.length > 0) && (
        <section className="mt-10 grid gap-12 border-t border-line-strong pt-12 lg:grid-cols-2 lg:gap-20" aria-label="Experience and current interests">
          {timeline.length > 0 && (
            <div>
              <h2 className="font-display text-2xl font-medium">A few chapters so far</h2>
              <ol className="mt-7 border-l border-line-strong pl-6">
                {timeline.map((item: { year?: string; text: string }, index: number) => (
                  <li key={index} className="relative pb-7 last:pb-0">
                    <span aria-hidden className="absolute -left-[29px] top-2 h-2 w-2 rounded-full bg-pen" />
                    {item.year && <span className="font-mono text-xs text-pen">{item.year}</span>}
                    <p className="mt-1 text-soft">{item.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {(toolbox.length > 0 || currently.length > 0) && (
            <div className="space-y-9">
              {currently.length > 0 && (
                <div>
                  <h2 className="font-display text-2xl font-medium">On my mind lately</h2>
                  <ul className="mt-5 space-y-3 text-soft">
                    {currently.map((item, index) => <li key={index} className="flex gap-3"><span aria-hidden className="text-pen">→</span><span>{item}</span></li>)}
                  </ul>
                </div>
              )}
              {toolbox.length > 0 && (
                <div>
                  <h2 className="font-mono text-xs uppercase tracking-widest text-soft">Tools I work with</h2>
                  <div className="mt-4 flex flex-wrap gap-2">{toolbox.map((tool, index) => <Tag key={index}>{tool}</Tag>)}</div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      <section className="mt-16 rounded-lg border border-line-strong bg-surface px-6 py-9 sm:mt-20 sm:px-10 sm:py-12" aria-labelledby="about-connect-heading">
        <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <h2 id="about-connect-heading" className="font-display text-3xl font-medium tracking-tight">Have something in mind?</h2>
            <p className="mt-3 text-soft">A creative project, a tech idea, or just a conversation. I&apos;d love to meet the person behind it.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href="/connect">Say hello <span aria-hidden>↗</span></Button>
            {d.cv_url && <Button href={d.cv_url} variant="ghost">Read my CV <span aria-hidden>↗</span></Button>}
          </div>
        </div>
      </section>
    </div>
  );
}
