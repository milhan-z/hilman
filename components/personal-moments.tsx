import { Pic } from "@/components/cld-image";
import { mediaSrc } from "@/lib/cloudinary";

export type PersonalMoment = {
  title?: string;
  image?: string;
  alt?: string;
  caption?: string;
};

/** Optional real memories. Text-only entries remain useful until a photo is added. */
export function PersonalMoments({ moments }: { moments?: PersonalMoment[] }) {
  const entries = Array.isArray(moments)
    ? moments.filter((moment) => moment && (mediaSrc(moment.image) || moment.title || moment.caption))
    : [];
  if (!entries.length) return null;

  return (
    <section className="pb-10" aria-label="Personal moments">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((moment, index) => (
          <figure key={index} className="h-fit rounded-sm bg-cream p-3 text-cream-ink shadow-card">
            {mediaSrc(moment.image) && (
              <Pic
                src={moment.image}
                alt={moment.alt || moment.title || ""}
                width={1000}
                height={800}
                sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 420px"
                className="aspect-[5/4] w-full object-cover"
              />
            )}
            {(moment.title || moment.caption) && (
              <figcaption className="px-2 pb-3 pt-5">
                {moment.title && <h3 className="font-display text-xl font-medium">{moment.title}</h3>}
                {moment.caption && <p className="mt-2 text-sm leading-relaxed text-cream-soft">{moment.caption}</p>}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
