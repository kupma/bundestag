// A written record of every background run – fetching DIP, writing an
// article, importing a programme, sending the newsletter – so the admin page
// can say what happened overnight instead of leaving it to the Railway logs.

export async function runJob(db, kind, fn) {
  const { id } = await db.one('insert into job_runs (kind) values ($1) returning id', [kind]);
  const lines = [];
  const log = (line) => {
    lines.push(String(line));
    console.log(`[${kind}] ${line}`);
  };
  try {
    const result = await fn(log);
    await db.query('update job_runs set finished_at = now(), ok = true, summary = $2 where id = $1', [id, lines.join('\n').slice(0, 4000)]);
    return result;
  } catch (err) {
    log(`Fehler: ${err.message}`);
    await db.query('update job_runs set finished_at = now(), ok = false, summary = $2 where id = $1', [id, lines.join('\n').slice(0, 4000)]);
    throw err;
  }
}

// Failed runs, and runs that never finished. Callers ask before starting a
// run of the same kind, which never overlaps with itself, so an unfinished
// run here is one whose process died – for example when a large PDF took the
// memory with it. Counting those stops a crash from repeating on every
// restart.
export async function recentFailures(db, kind, hours) {
  const row = await db.one(
    `select count(*)::int as n from job_runs
      where kind = $1 and ok is distinct from true and started_at > now() - ($2 || ' hours')::interval`,
    [kind, String(hours)],
  );
  return row.n;
}

export async function recentJobs(db, limit = 30) {
  const { rows } = await db.query('select * from job_runs order by id desc limit $1', [limit]);
  return rows;
}
