import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * A real PostgreSQL to run the migrations against.
 *
 * The studio's save path is mostly SQL: `save_content_synced` decides whether
 * a save is a replay or a conflict, and `save_project` / `save_journal_post`
 * decide what a publication date becomes. Asserting on the *text* of those
 * functions is not a test of any of it — migration 0007 shipped a journal
 * function that reads an undeclared variable, and every source-level check
 * over that file passed, because the string `v_chosen` was present exactly
 * where it was expected to be. plpgsql only resolves names in expressions when
 * the statement first runs, so nothing short of running it could have caught
 * that.
 *
 * PGlite is PostgreSQL compiled to WebAssembly — the same planner, the same
 * plpgsql. No Docker, no service to start, so `npm test` stays one command.
 */

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);

/**
 * What Supabase provides and a bare PostgreSQL does not.
 *
 * `auth.uid()` is normally derived from the request's JWT. Here it reads a
 * session setting instead, so a test can say who is signed in. The three roles
 * exist because the migrations grant and revoke against them by name.
 */
const SUPABASE_SHIM = `
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('test.user_id', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit bypassrls;
  end if;
end $$;
`;

export interface Harness {
  db: PGlite;
  /** Applies one more migration by number, e.g. 8 for 0008_*.sql. */
  apply(step: number): Promise<void>;
  /** Everything from `after` up to and including `through`. */
  applyThrough(after: number, through: number): Promise<void>;
  /** Becomes the site owner, the way the studio's own requests arrive. */
  signInAsOwner(): Promise<string>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

function migrationFile(step: number): string {
  const prefix = String(step).padStart(4, "0");
  const name = readdirSync(MIGRATIONS).find((file) => file.startsWith(`${prefix}_`));
  if (!name) throw new Error(`No migration numbered ${prefix} in supabase/migrations/`);
  return readFileSync(new URL(name, MIGRATIONS), "utf8");
}

/** The highest migration number present, so tests never hard-code the latest. */
export function latestMigration(): number {
  return Math.max(
    ...readdirSync(MIGRATIONS)
      .filter((file) => /^\d{4}_.*\.sql$/.test(file))
      .map((file) => Number(file.slice(0, 4)))
  );
}

export function migrationName(step: number): string {
  const prefix = String(step).padStart(4, "0");
  const name = readdirSync(MIGRATIONS).find((file) => file.startsWith(`${prefix}_`));
  if (!name) throw new Error(`No migration numbered ${prefix}`);
  return name;
}

/**
 * A database with migrations 0001..`through` applied, in order.
 *
 * `through` is a parameter because the upgrade path matters as much as the
 * fresh install: a corrective migration has to work on a database that already
 * has the broken function in it, which is the situation this author's real
 * Supabase project is in.
 */
export async function freshDatabase(through: number = latestMigration()): Promise<Harness> {
  const db = await new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_SHIM);

  const harness: Harness = {
    db,
    async apply(step) {
      await db.exec(migrationFile(step));
    },
    async applyThrough(after, target) {
      for (let step = after + 1; step <= target; step++) await harness.apply(step);
    },
    async signInAsOwner() {
      const [user] = await harness.query<{ id: string }>(
        "insert into auth.users (id, email) values (gen_random_uuid(), 'owner@example.test') returning id"
      );
      await db.exec(`select set_config('test.user_id', '${user.id}', false)`);
      await harness.query("insert into site_owners (user_id, note) values ($1, 'test owner')", [
        user.id,
      ]);
      return user.id;
    },
    async query(sql, params = []) {
      const result = await db.query(sql, params as never[]);
      return result.rows as never[];
    },
    async close() {
      await db.close();
    },
  };

  await harness.applyThrough(0, through);
  return harness;
}

/* ── sharing one database between tests ───────────────────── */

const shared = new Map<number, Promise<Harness>>();

/**
 * A database at this migration level, booted once.
 *
 * Booting PGlite and replaying eight migrations costs a couple of seconds, and
 * doing it per test turned a fast suite into a slow one. Tests that only need
 * to *use* the schema share one instance and undo themselves — see
 * withRollback(). Tests that are about the migrations themselves still take a
 * private database, because that is the thing they are measuring.
 */
export function sharedDatabase(through: number = latestMigration()): Promise<Harness> {
  let existing = shared.get(through);
  if (!existing) {
    existing = freshDatabase(through).then(async (harness) => {
      // Signed in once, outside any transaction, so it survives a rollback.
      await harness.signInAsOwner();
      return harness;
    });
    shared.set(through, existing);
  }
  return existing;
}

/**
 * Runs the body and undoes everything it wrote.
 *
 * A rollback rather than a truncate: it also unwinds sequences, the mutation
 * ledger and anything a trigger did, so the next test genuinely starts from
 * the schema as migrated.
 */
export async function withRollback<T>(
  harness: Harness,
  body: (harness: Harness) => Promise<T>
): Promise<T> {
  await harness.db.exec("begin");
  try {
    return await body(harness);
  } finally {
    await harness.db.exec("rollback");
  }
}

/** Closes every shared database. Node exits regardless; this keeps it tidy. */
export async function closeSharedDatabases(): Promise<void> {
  for (const pending of shared.values()) await (await pending).close();
  shared.clear();
}
