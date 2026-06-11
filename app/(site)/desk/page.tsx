import type { Metadata } from "next";
import { DeskBoard } from "@/components/desk/desk-board";
import { getPage } from "@/lib/data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Hilman's Desk",
  description: "An interactive digital desk — sticky notes, folders, this week's checklist.",
};

export default async function DeskPage() {
  const page = await getPage("desk");
  const d = page?.data ?? {};

  return (
    <div className="mx-auto max-w-content px-5 py-16 sm:px-8">
      <header className="max-w-2xl">
        <p className="font-hand text-xl text-faint">pull up a chair</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Hilman’s Desk
        </h1>
        {d.lede && <p className="mt-4 text-lg text-soft">{d.lede}</p>}
      </header>

      <div className="mt-12">
        <DeskBoard data={d} />
      </div>
    </div>
  );
}
