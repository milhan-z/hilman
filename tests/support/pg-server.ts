import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";

import { SUPABASE_SHIM, latestMigration, migrationFile } from "./pg";

/**
 * A PostgreSQL with more than one connection in it.
 *
 * PGlite — which the rest of the database tests use — is a single embedded
 * backend. One session, one transaction at a time. That is plenty for asking
 * what a function *computes*, and useless for asking what two of them do to
 * each other, because a second `begin` on the same session is not a second
 * transaction, it is a warning.
 *
 * And what two of them do to each other is the entire finding. The lost update
 * in save_content_synced only appears when one transaction reads a version
 * that another has already changed but not yet committed. Calling the function
 * twice in a row cannot express that, and a test that did would pass against
 * the broken code.
 *
 * So these tests want a real server. They get one three ways, in order:
 *
 *   1. HILMAN_TEST_PG — a connection URL, if you want to point them somewhere.
 *   2. A private instance this module starts itself, on its own port and its
 *      own data directory, from PostgreSQL binaries already installed on the
 *      machine. It never touches a server you are already running.
 *   3. Nothing — and the concurrency tests skip, loudly, rather than passing
 *      quietly and claiming a guarantee nobody checked.
 *
 * Point 3 is why this is a separate file from pg.ts. Everything PGlite can
 * answer stays on PGlite and always runs; only the questions that genuinely
 * need two connections depend on finding a server.
 */

/** Deliberately not 5432. Whatever is already running is not ours to use. */
const PORT = Number(process.env.HILMAN_TEST_PG_PORT ?? 54329);
const DATA_DIR = join(tmpdir(), "hilman-pgtest", "data");

/** Where a Windows installer puts them, newest first. Unix has them on PATH. */
function findBinDir(): string | null {
  const roots = [
    "C:/Program Files/PostgreSQL",
    "C:/Program Files (x86)/PostgreSQL",
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const versions = readdirSync(root)
      .filter((name) => /^\d+$/.test(name))
      .sort((a, b) => Number(b) - Number(a));
    for (const version of versions) {
      const bin = join(root, version, "bin");
      if (existsSync(join(bin, "pg_ctl.exe"))) return bin;
    }
  }
  // On anything else, trust PATH if initdb answers.
  const probe = spawnSync("initdb", ["--version"], { stdio: "ignore" });
  return probe.status === 0 ? "" : null;
}

const exe = (bin: string, name: string) => (bin ? join(bin, `${name}.exe`) : name);

function isListening(bin: string): boolean {
  const probe = spawnSync(exe(bin, "pg_isready"), ["-h", "127.0.0.1", "-p", String(PORT)], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

/**
 * Starts our own server if one is not already up on our port.
 *
 * The data directory is cached between runs, so `initdb` — which is the slow
 * part — happens once on a machine rather than once a test run. fsync is off
 * because this database is disposable by construction.
 */
function ensureServer(): string | null {
  const bin = findBinDir();
  if (bin === null) return null;
  if (isListening(bin)) return bin;

  try {
    if (!existsSync(join(DATA_DIR, "PG_VERSION"))) {
      mkdirSync(DATA_DIR, { recursive: true });
      const pwFile = join(tmpdir(), "hilman-pgtest", "pw.txt");
      writeFileSync(pwFile, "postgres");
      execFileSync(
        exe(bin, "initdb"),
        ["-D", DATA_DIR, "-U", "postgres", "--auth=trust", "--pwfile", pwFile, "-E", "UTF8"],
        { stdio: "ignore" }
      );
    }
    execFileSync(
      exe(bin, "pg_ctl"),
      [
        "-D",
        DATA_DIR,
        "-o",
        `-p ${PORT} -c listen_addresses=127.0.0.1 -c fsync=off -c full_page_writes=off`,
        "-l",
        join(tmpdir(), "hilman-pgtest", "log.txt"),
        "-w",
        "start",
      ],
      { stdio: "ignore" }
    );
  } catch {
    return null;
  }
  return isListening(bin) ? bin : null;
}

let discovery: { url: string } | null | undefined;

/** The base connection URL, or null when this machine has no PostgreSQL. */
export function postgresAvailable(): string | null {
  if (discovery !== undefined) return discovery?.url ?? null;

  if (process.env.HILMAN_TEST_PG) {
    discovery = { url: process.env.HILMAN_TEST_PG };
    return discovery.url;
  }
  const bin = ensureServer();
  discovery = bin === null ? null : { url: `postgres://postgres@127.0.0.1:${PORT}/postgres` };
  return discovery?.url ?? null;
}

/** Printed once when the concurrency tests cannot run, so it is never silent. */
export const NO_POSTGRES =
  "no local PostgreSQL — concurrency tests skipped. Install PostgreSQL, or set " +
  "HILMAN_TEST_PG to a connection URL, to run them.";

/* ── a disposable database with the migrations applied ────── */

export interface ConcurrentHarness {
  /** Opens another independent connection, signed in as the site owner. */
  connect(): Promise<Client>;
  /** Opens one with only the anon role, so RLS actually applies. */
  connectAsAnon(): Promise<Client>;
  /** The owner's id, for anything that needs to name it. */
  ownerId: string;
  /** The exact `updated_at` of a row, as text — microseconds intact. */
  versionOf(table: string, id: string): Promise<string>;
  /** Applies one further migration, for testing an upgrade in place. */
  apply(step: number): Promise<void>;
  close(): Promise<void>;
}

let counter = 0;

/**
 * Applies 0001..latest to a brand-new database and hands back a way to open
 * as many connections to it as a test needs.
 *
 * A database per harness rather than a transaction per test: these tests hold
 * several transactions open at once *on purpose*, so the usual rollback trick
 * has nothing to roll back into.
 */
export async function concurrentDatabase(
  through: number = latestMigration()
): Promise<ConcurrentHarness> {
  const base = postgresAvailable();
  if (!base) throw new Error(NO_POSTGRES);

  const name = `hilman_concurrency_${process.pid}_${++counter}`;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  await admin.query(`drop database if exists ${name}`);
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = base.replace(/\/[^/]*$/, `/${name}`);
  const open = async () => {
    const client = new Client({ connectionString: url });
    await client.connect();
    return client;
  };

  const setup = await open();
  await setup.query(SUPABASE_SHIM);
  for (let step = 1; step <= through; step++) await setup.query(migrationFile(step));

  // Supabase's own bootstrap grants table privileges to anon and authenticated
  // and relies on RLS to decide what they may actually do. The migrations
  // assume that arrangement — their policies are written `to anon` — so a
  // harness that omitted it would test a database anon cannot reach at all,
  // and would report the public insert path as safe because it was unreachable.
  await setup.query(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  `);

  const {
    rows: [owner],
  } = await setup.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), 'owner@example.test') returning id"
  );
  await setup.query("insert into site_owners (user_id, note) values ($1, 'test owner')", [owner.id]);
  await setup.end();

  const opened: Client[] = [];

  return {
    ownerId: owner.id,
    async connect() {
      const client = await open();
      // auth.uid() reads a session setting here — see SUPABASE_SHIM.
      await client.query("select set_config('test.user_id', $1, false)", [owner.id]);
      opened.push(client);
      return client;
    },
    /**
     * A connection with no more authority than a visitor's.
     *
     * `set role anon` is what makes RLS apply: the harness otherwise connects
     * as the superuser, which bypasses every policy, so a test of the public
     * insert path would be testing nothing.
     */
    async connectAsAnon() {
      const client = await open();
      await client.query("set role anon");
      opened.push(client);
      return client;
    },
    async apply(step) {
      const client = await open();
      try {
        await client.query(migrationFile(step));
      } finally {
        await client.end();
      }
    },
    async versionOf(table, id) {
      const client = await open();
      try {
        const { rows } = await client.query<{ t: string }>(
          `select updated_at::text as t from ${table} where id = $1`,
          [id]
        );
        // As text, never through a JS Date: PostgreSQL keeps microseconds and
        // toISOString() truncates to milliseconds, so a round-tripped version
        // would never match itself and every save would look like a conflict.
        return rows[0].t;
      } finally {
        await client.end();
      }
    },
    async close() {
      for (const client of opened.splice(0)) {
        try {
          await client.end();
        } catch {
          /* already gone */
        }
      }
    },
  };
}

/* ── saying the same things the studio says ───────────────── */

export const projectData = (extra: Record<string, unknown> = {}) => ({
  title: "A piece",
  slug: "a-piece",
  stream: "visual-design",
  status: "draft",
  ...extra,
});

export const journalData = (extra: Record<string, unknown> = {}) => ({
  title: "An entry",
  slug: "an-entry",
  status: "draft",
  reading_minutes: "3",
  ...extra,
});

export interface SyncedOutcome {
  status: "saved" | "conflict";
  id: string;
  replayed?: boolean;
  updated_at?: string;
  server_updated_at?: string;
}

/** One call to the RPC the studio's sync endpoint makes. */
export function saveSynced(
  client: Client,
  args: {
    mutationId: string;
    entity: "project" | "journal";
    id: string | null;
    base: string | null;
    data: Record<string, unknown>;
    blocks?: unknown[];
    tagIds?: string[];
  }
) {
  return client
    .query<{ out: SyncedOutcome }>(
      "select public.save_content_synced($1::uuid, $2, $3::uuid, $4::timestamptz, $5::jsonb, $6::jsonb, $7::uuid[]) as out",
      [
        args.mutationId,
        args.entity,
        args.id,
        args.base,
        JSON.stringify(args.data),
        JSON.stringify(args.blocks ?? []),
        args.tagIds ?? [],
      ]
    )
    .then((result) => result.rows[0].out);
}
