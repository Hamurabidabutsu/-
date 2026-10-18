import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { getDatabase } from "@netlify/database";
import { baseSchema } from "./schema";
type QueryResult = {
  rows: Row[];
  rowCount: number | null;
  fields?: { name: string; dataTypeID: number }[];
};
export type QueryConnection = {
  query: (sql: string, params?: any[]) => Promise<QueryResult>;
};
type Client = QueryConnection & { release: () => void };
type Pool = QueryConnection & { connect: () => Promise<Client> };

export type Row = Record<string, any>;
export const remoteStorage = () =>
  process.env.STORAGE_BACKEND === "netlify" ||
  (!!process.env.NETLIFY && process.env.STORAGE_BACKEND !== "sqlite");
export const dataDir = () =>
  path.resolve(
    process.env.DATA_DIR ||
      (process.env.APP_MODE === "demo" ? "./data/demo" : "./data/live"),
  );
let sqlite: DatabaseSync | undefined;
let pool: Pool | undefined;
let ready: Promise<void> | undefined;
let localTail: Promise<unknown> = Promise.resolve();
const connection = new AsyncLocalStorage<Client | "sqlite">();

// Local SQLite operations must not enter another request's open transaction.
async function localExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const previous = localTail;
  let release!: () => void;
  localTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}
export function ensureStorage() {
  if (!ready)
    ready = (async () => {
      if (process.env.NETLIFY && !remoteStorage())
        throw new Error("NetlifyにはSTORAGE_BACKEND=netlifyが必要です。");
      if (remoteStorage()) {
        pool = getDatabase().pool as unknown as Pool;
        // Schema is applied by Netlify's deploy migration lifecycle, never per request.
        await pool.query("SELECT 1 FROM users LIMIT 1");
      } else {
        mkdirSync(path.join(dataDir(), "uploads"), {
          recursive: true,
          mode: 0o700,
        });
        sqlite = new DatabaseSync(path.join(dataDir(), "site.sqlite"));
        sqlite.exec(
          "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;",
        );
        sqlite.exec(baseSchema);
      }
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}

// Convert only placeholders outside SQL string literals; parameters stay separate.
export function postgresSQL(sql: string) {
  let quoted = false,
    index = 0,
    result = "";
  for (let n = 0; n < sql.length; n++) {
    const char = sql[n];
    if (char === "'") {
      if (quoted && sql[n + 1] === "'") {
        result += "''";
        n++;
        continue;
      }
      quoted = !quoted;
    }
    if (!quoted && /[a-zA-Z_]/.test(char)) {
      const token = sql.slice(n).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)![0];
      const table =
        /^(users|sessions|profiles|applications|conversations|files|messages|events|chat_tombstones|rate_limits|file_gc|catalog|email_tokens|mail_queue|review_mail|support_tickets|support_messages|reports|service_leases)$/.test(
          token,
        );
      result +=
        process.env.APP_MODE === "demo" && table ? "demo_" + token : token;
      n += token.length - 1;
      continue;
    }
    result += char === "?" && !quoted ? `$${++index}` : char;
  }
  if (/^INSERT OR IGNORE /i.test(result))
    result =
      result.replace(/^INSERT OR IGNORE /i, "INSERT ") +
      " ON CONFLICT DO NOTHING";
  return result;
}
async function query(sql: string, params: any[] = []) {
  await ensureStorage();
  if (remoteStorage()) {
    const client = connection.getStore();
    const result = await (client && client !== "sqlite" ? client : pool!).query(
      postgresSQL(sql),
      params,
    );
    // COUNT is int8 in PostgreSQL. Existing domain/UI values are small numbers.
    for (const row of result.rows)
      for (const field of result.fields || [])
        if (field.dataTypeID === 20 && row[field.name] !== null)
          row[field.name] = Number(row[field.name]);
    return { rows: result.rows as Row[], changes: result.rowCount || 0 };
  }
  const execute = async () => {
    const statement = sqlite!.prepare(sql);
    if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
      const rows = statement.all(...params) as Row[];
      return { rows, changes: rows.length };
    }
    const result = statement.run(...params);
    return { rows: [] as Row[], changes: Number(result.changes) };
  };
  return connection.getStore() === "sqlite"
    ? execute()
    : localExclusive(execute);
}
export async function one(sql: string, ...params: any[]) {
  return (await query(sql, params)).rows[0];
}
export async function all(sql: string, ...params: any[]) {
  return (await query(sql, params)).rows;
}
export async function run(sql: string, ...params: any[]) {
  return query(sql, params);
}
export async function exec(sql: string) {
  await ensureStorage();
  if (remoteStorage()) {
    const client = connection.getStore();
    await (client && client !== "sqlite" ? client : pool!).query(sql);
  } else if (connection.getStore() === "sqlite") sqlite!.exec(sql);
  else
    await localExclusive(async () => {
      sqlite!.exec(sql);
    });
}
export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  await ensureStorage();
  if (connection.getStore()) return fn();
  if (remoteStorage()) {
    const client = await pool!.connect();
    try {
      await client.query("BEGIN");
      // Serialize short domain mutations across serverless instances, not mail/network I/O.
      await client.query("SELECT pg_advisory_xact_lock(1748301)");
      const result = await connection.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return localExclusive(async () => {
    sqlite!.exec("BEGIN IMMEDIATE");
    try {
      const result = await connection.run("sqlite", fn);
      sqlite!.exec("COMMIT");
      return result;
    } catch (error) {
      sqlite!.exec("ROLLBACK");
      throw error;
    }
  });
}

export async function compactLocalDatabase() {
  if (!remoteStorage())
    await exec(
      "PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);",
    );
}

export function useTestDatabase(testPool: Pool) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Test database is disabled");
  pool = testPool;
  ready = Promise.resolve();
}
