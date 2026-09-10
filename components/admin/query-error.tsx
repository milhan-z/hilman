/**
 * A failed admin query rendered as a failure, not as an empty list.
 *
 * Every list screen in Studio used to destructure `{ data }` and ignore
 * `error`, so a permission problem or an outage looked exactly like "you
 * haven't made anything yet".
 */
export function QueryError({ what, error }: { what: string; error?: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded border border-red/40 bg-red-soft/10 p-4 text-sm text-red"
    >
      Could not load {what}: {error}
    </p>
  );
}
