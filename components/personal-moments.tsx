import { PhotoStack, type PhotoStackItem } from "@/components/bits/photo-stack";
import { mediaSrc } from "@/lib/cloudinary";

export type PersonalMoment = {
  title?: string;
  image?: string;
  alt?: string;
  caption?: string;
};

/**
 * The moments worth showing, as prints: a moment needs a photograph, a
 * title or a few words, and one with nothing is left out. Text-only
 * entries stay useful until a photo is added — they are notes in the pile.
 */
export function momentItems(moments?: PersonalMoment[]): PhotoStackItem[] {
  if (!Array.isArray(moments)) return [];
  return moments
    .filter((moment) => moment && (mediaSrc(moment.image) || moment.title || moment.caption))
    .map((moment) => ({
      src: mediaSrc(moment.image) ? moment.image : undefined,
      alt: moment.alt,
      title: moment.title,
      caption: moment.caption,
    }));
}

/**
 * Optional real memories, as a pile of prints on the desk (HILMAN BITS
 * PhotoStack): one on top with its words beside it, the rest underneath.
 */
export function PersonalMoments({ moments }: { moments?: PersonalMoment[] }) {
  const items = momentItems(moments);
  if (!items.length) return null;

  return (
    <section className="pb-10" aria-label="Personal moments">
      <PhotoStack items={items} />
    </section>
  );
}
