import type { Metadata } from "next";
import { AboutSheet, aboutPhoto, type AboutRole } from "@/components/about-sheet";
import { ContentUnavailablePage } from "@/components/content-unavailable";
import { SectionReveal } from "@/components/motion";
import { PersonalMoments } from "@/components/personal-moments";
import { ArrowLink, Button, Kicker } from "@/components/ui";
import { getPage, load } from "@/lib/data";
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

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export default async function AboutPage() {
  const pageRes = await load(() => getPage("about"));
  if (!pageRes.ok) {
    return <ContentUnavailablePage what="the About page" detail={pageRes.error} />;
  }
  const d = resolveProfileData("about", pageRes.value?.data);
  const story = strings(d.story);
  const focus = strings(d.focus);
  const roles: AboutRole[] = Array.isArray(d.timeline)
    ? d.timeline.filter((item: any) => item && typeof item.text === "string" && item.text.trim())
    : [];

  return (
    <div className="mx-auto max-w-wide px-5 pb-16 pt-14 sm:px-8 sm:pb-24 sm:pt-20 lg:px-12">
      {/* The old About Me page's title: a yellow rule running into it. */}
      <header className="flex items-center gap-5 sm:gap-8">
        <span aria-hidden className="h-[3px] min-w-8 flex-1 bg-hl" />
        <h1 className="shrink-0 font-display text-[2.75rem] font-bold leading-none tracking-tight text-pen sm:text-6xl">About me</h1>
      </header>

      <AboutSheet
        photo={aboutPhoto(d)}
        caption={text(d.portrait_caption)}
        lede={text(d.lede)}
        interests={strings(d.interests)}
        story={story}
        note={text(d.personal_note)}
        roles={roles}
        tools={strings(d.toolbox)}
      />

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
                {/* Not "the people are part of the story": the note that
                    ends the sheet, just above, says that already. */}
                <Kicker>a little more than the work</Kicker>
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
