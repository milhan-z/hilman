import Link from "next/link";

export default function NotFound() {
  return (
    <div className="dotgrid flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <p className="font-hand text-2xl text-faint">flipped through every page…</p>
      <h1 className="mt-3 font-display text-4xl font-bold">
        This one isn’t in the archive<span className="text-red">.</span>
      </h1>
      <p className="mt-4 max-w-md text-soft">
        Either it was never filed, or it’s been quietly torn out. The rest of the notebook is intact.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-[44px] items-center rounded bg-pen px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Back to the first page
      </Link>
    </div>
  );
}
