// The apps' session store: a SQLite database on disk, reached through the Tauri SQL plugin.
//
// (c) Copyright 2026 Liminal HQ, Scott Morris
// SPDX-License-Identifier: Apache-2.0 OR MIT

import type { SampleStore, SessionHeader, SessionInfo } from './store';

/** What the store needs of a database: run a statement, or read rows. The Tauri plugin's `Database` has both. */
export interface SqlDb {
  execute(query: string, bindings?: unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(query: string, bindings?: unknown[]): Promise<T[]>;
}

/** The database file, in the app's config directory. */
export const DB_FILE = 'sqlite:play-samples.db';

/**
 * Every statement is a single one, because the plugin's connection pool may use another connection for the
 * next call, so a transaction cannot span calls. A chunk is one `INSERT` that takes its own position, so it
 * is written whole or not at all, and a session's size and chunk count are counted from its chunks instead of
 * being kept as numbers that could drift after a crash.
 */
export async function openSqliteStore(db: SqlDb): Promise<SampleStore> {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS sessions (
       id TEXT PRIMARY KEY NOT NULL,
       started_at TEXT NOT NULL,
       header TEXT NOT NULL,
       ended INTEGER NOT NULL DEFAULT 0
     )`,
  );
  await db.execute(
    `CREATE TABLE IF NOT EXISTS chunks (
       session_id TEXT NOT NULL,
       n INTEGER NOT NULL,
       data TEXT NOT NULL,
       PRIMARY KEY (session_id, n)
     ) WITHOUT ROWID`,
  );

  return {
    kind: 'sqlite',
    async create(header: SessionHeader) {
      await db.execute(
        'INSERT INTO sessions (id, started_at, header, ended) VALUES (?1, ?2, ?3, 0)',
        [header.id, header.startedAt, JSON.stringify(header)],
      );
    },
    async append(id, chunk) {
      const { rowsAffected } = await db.execute(
        `INSERT INTO chunks (session_id, n, data)
         SELECT ?1, COALESCE((SELECT MAX(n) + 1 FROM chunks WHERE session_id = ?1), 0), ?2
         WHERE EXISTS (SELECT 1 FROM sessions WHERE id = ?1)`,
        [id, chunk],
      );
      if (!rowsAffected) throw new Error(`no session ${id}`);
    },
    async end(id) {
      const { rowsAffected } = await db.execute('UPDATE sessions SET ended = 1 WHERE id = ?1', [
        id,
      ]);
      if (!rowsAffected) throw new Error(`no session ${id}`);
    },
    async list() {
      const rows = await db.select<{
        id: string;
        startedAt: string;
        ended: number;
        chunks: number;
        bytes: number;
      }>(
        `SELECT s.id AS id, s.started_at AS startedAt, s.ended AS ended,
                (SELECT COUNT(*) FROM chunks c WHERE c.session_id = s.id) AS chunks,
                (SELECT COALESCE(SUM(LENGTH(c.data)), 0) FROM chunks c WHERE c.session_id = s.id) AS bytes
         FROM sessions s ORDER BY s.started_at, s.id`,
      );
      return rows.map((r): SessionInfo => ({
        id: r.id,
        startedAt: r.startedAt,
        ended: r.ended === 1,
        chunks: Number(r.chunks),
        bytes: Number(r.bytes),
      }));
    },
    async read(id) {
      const [row] = await db.select<{ header: string }>(
        'SELECT header FROM sessions WHERE id = ?1',
        [id],
      );
      if (!row) return null;
      const chunks = await db.select<{ data: string }>(
        'SELECT data FROM chunks WHERE session_id = ?1 ORDER BY n',
        [id],
      );
      return { header: JSON.parse(row.header) as SessionHeader, chunks: chunks.map((c) => c.data) };
    },
    async remove(id) {
      // Chunks first: a crash between the two leaves an empty session, never chunks with no owner.
      await db.execute('DELETE FROM chunks WHERE session_id = ?1', [id]);
      await db.execute('DELETE FROM sessions WHERE id = ?1', [id]);
    },
  };
}

/**
 * Opens the app's database through `@tauri-apps/plugin-sql`, loaded only here so the web bundle never carries it.
 * Resolves null if the plugin or the database cannot be opened, so the caller can fall back to another store.
 */
export async function openAppSqliteStore(): Promise<SampleStore | null> {
  try {
    const { default: Database } = await import('@tauri-apps/plugin-sql');
    return await openSqliteStore(await Database.load(DB_FILE));
  } catch {
    return null;
  }
}
