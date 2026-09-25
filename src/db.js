// One small interface over two Postgres drivers: `pg` for the real database
// on Railway, and PGlite (Postgres compiled to WebAssembly) for local
// development and the tests. Both speak the same SQL, so everything above this
// file only ever sees query/one/exec/tx/tryLock.
//
// Two conventions keep the drivers interchangeable:
//   - counts are cast with ::int (pg returns bigint as a string, PGlite as a
//     number);
//   - calendar dates are stored as 'YYYY-MM-DD' text, because pg turns a
//     `date` column into a JavaScript Date at *local* midnight, which is a
//     different day in half the world.

import fs from 'node:fs';
import { MIGRATIONS } from './migrations.js';

function wrapQueryable(q) {
  return {
    query: (sql, params = []) => q.query(sql, params),
    async one(sql, params = []) {
      const { rows } = await q.query(sql, params);
      return rows[0] || null;
    },
  };
}

function wrapPg(pool) {
  const inProcessLocks = new Set();
  return {
    kind: 'postgres',
    ...wrapQueryable(pool),
    exec: (sql) => pool.query(sql),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ ...wrapQueryable(client), exec: (sql) => client.query(sql) });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    // Session-level advisory lock, held on one dedicated connection for the
    // duration of fn. Stops two replicas (or two overlapping ticks) from
    // generating the same article twice.
    async tryLock(key, fn) {
      if (inProcessLocks.has(key)) return { ran: false };
      inProcessLocks.add(key);
      const client = await pool.connect();
      try {
        const { rows } = await client.query('select pg_try_advisory_lock($1) as ok', [key]);
        if (!rows[0].ok) return { ran: false };
        try {
          return { ran: true, result: await fn() };
        } finally {
          await client.query('select pg_advisory_unlock($1)', [key]).catch(() => {});
        }
      } finally {
        client.release();
        inProcessLocks.delete(key);
      }
    },
    close: () => pool.end(),
  };
}

function wrapPglite(pg) {
  const locks = new Set();
  return {
    kind: 'pglite',
    ...wrapQueryable(pg),
    exec: (sql) => pg.exec(sql),
    tx: (fn) => pg.transaction((t) => fn({ ...wrapQueryable(t), exec: (sql) => t.exec(sql) })),
    async tryLock(key, fn) {
      if (locks.has(key)) return { ran: false };
      locks.add(key);
      try {
        return { ran: true, result: await fn() };
      } finally {
        locks.delete(key);
      }
    },
    close: () => pg.close(),
  };
}

export async function openDatabase(config) {
  if (config.databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
    pool.on('error', (err) => console.error('[db] idle client error:', err.message));
    return wrapPg(pool);
  }
  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch {
    throw new Error(
      'DATABASE_URL ist nicht gesetzt und die lokale Ersatz-Datenbank (@electric-sql/pglite) ist nicht installiert. ' +
        'Entweder `npm install` ausführen oder DATABASE_URL setzen.',
    );
  }
  const dir = config.pgliteDir;
  if (dir && dir !== 'memory://') fs.mkdirSync(dir, { recursive: true });
  const pg = dir && dir !== 'memory://' ? new PGlite(dir) : new PGlite();
  await pg.waitReady;
  return wrapPglite(pg);
}

// Each migration runs in its own transaction behind a transaction-scoped
// advisory lock, so two instances booting at once apply it exactly once.
export async function migrate(db) {
  await db.exec(
    'create table if not exists schema_migrations (id int primary key, applied_at timestamptz not null default now())',
  );
  for (const m of MIGRATIONS) {
    await db.tx(async (q) => {
      await q.query('select pg_advisory_xact_lock(7243001)');
      const done = await q.one('select 1 as ok from schema_migrations where id = $1', [m.id]);
      if (done) return;
      await q.exec(m.sql);
      await q.query('insert into schema_migrations (id) values ($1)', [m.id]);
    });
  }
}
