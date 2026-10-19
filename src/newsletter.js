// The weekly letter: on Sundays, the sitting week that ends that day – each
// sitting day with its title, lede and decisions, and a link to read it in full
// and discuss it on the site. Weeks without a sitting send nothing. Sent to
// confirmed subscribers only (double opt-in: ticking the box at registration
// is not enough, the address has to be confirmed from the inbox first).

import { escapeHtml } from './html.js';
import { isExternal, LEVELS, RESOURCES, shownActions } from './resources.js';
import { addDays, formatDateDe } from './text.js';

const RESULT = { angenommen: 'angenommen', abgelehnt: 'abgelehnt', erledigt: 'für erledigt erklärt', sonstiges: 'beschlossen' };

// Same calm palette as the site: paper, stone, charcoal – no party colour.
const C = { paper: '#f6f3ee', surface: '#fffdfa', stone: '#efebe4', ink: '#2b2926', ink2: '#57524b', ink3: '#807970', line: '#e2dcd2' };

// --- the week ---------------------------------------------------------------------
// A week runs Monday to Sunday and is named by its Sunday, the day its letter
// goes out.

export function lastSunday(ymd) {
  return addDays(ymd, -new Date(`${ymd}T12:00:00Z`).getUTCDay());
}

// The week a day belongs to.
export function weekOf(ymd) {
  const sunday = lastSunday(addDays(ymd, 6));
  return { from: addDays(sunday, -6), to: sunday };
}

// "14. bis 16. Oktober 2026", "30. September bis 2. Oktober 2026"
export function formatRangeDe(from, to) {
  if (from === to) return formatDateDe(from, { weekday: false });
  const [a, b] = [from, to].map((d) => d.split('-'));
  const part = (ymd, opts) => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', ...opts }).format(new Date(`${ymd}T12:00:00Z`));
  const start = a[0] !== b[0] ? formatDateDe(from, { weekday: false }) : a[1] !== b[1] ? part(from, { day: 'numeric', month: 'long' }) : `${Number(a[2])}.`;
  return `${start} bis ${formatDateDe(to, { weekday: false })}`;
}

// The week's letter is due as long as one of its articles has not gone out.
export async function letterDue(db, sunday) {
  const { from, to } = weekOf(sunday);
  return !!(await db.one(
    `select 1 as x from articles where status = 'published' and mailed_at is null and sitting_date between $1 and $2 limit 1`,
    [from, to],
  ));
}

// --- the letter -------------------------------------------------------------------

// Up to three suggestions for the whole week, one per decision first, so the
// letter stays short; the same step under two decisions counts once.
function pickActions(decisions) {
  const firsts = decisions.map((d) => shownActions(d.actions)[0]).filter(Boolean);
  const rest = decisions.flatMap((d) => shownActions(d.actions).slice(1));
  const seen = new Set();
  return [...firsts, ...rest].filter((a) => !seen.has(a.text) && seen.add(a.text)).slice(0, 3);
}

function resourceUrl(config, key) {
  const r = RESOURCES[key];
  if (!r) return null;
  return { label: r.label, url: isExternal(r.url) ? r.url : `${config.baseUrl}${r.url}` };
}

export function composeLetter(config, articles, user) {
  // Tagged, so the site's statistics can tell newsletter readers apart.
  const tag = 'utm_source=newsletter&utm_medium=email';
  const unsubscribeUrl = `${config.baseUrl}/newsletter/abmelden?t=${encodeURIComponent(user.unsubscribe_token)}`;
  const first = articles[0].sitting_date;
  const last = articles[articles.length - 1].sitting_date;
  const week = articles.length > 1 ? `Sitzungswoche vom ${formatRangeDe(first, last)}` : `Sitzung vom ${formatDateDe(first, { weekday: false })}`;
  const days = articles.map((a) => {
    const body = a.body || {};
    return {
      date: formatDateDe(a.sitting_date),
      title: a.title,
      lede: a.lede,
      url: `${config.baseUrl}/artikel/${a.slug}?${tag}`,
      commonGround: String(body.commonGround || ''),
      items: (body.decisions || []).map((d) => ({ headline: d.headline, result: RESULT[d.result] || d.result })),
    };
  });
  const actions = pickActions(articles.flatMap((a) => (a.body && a.body.decisions) || [])).map((a) => ({
    ...a,
    link: a.resource ? resourceUrl(config, a.resource) : null,
  }));
  const archiveUrl = `${config.baseUrl}/archiv?${tag}`;

  const text = [
    `${config.siteName} – die ${week}`,
    '',
    ...days.flatMap((d) => [
      d.date.toUpperCase(),
      d.title,
      '',
      d.lede,
      '',
      ...(d.commonGround ? [`Gemeinsamkeiten: ${d.commonGround}`, ''] : []),
      ...d.items.map((i) => `• ${i.headline} (${i.result})`),
      '',
      `Ganzer Artikel mit Quellen und Diskussion: ${d.url}`,
      '',
      '',
    ]),
    ...(actions.length
      ? ['Was du tun kannst:', ...actions.map((a) => `– ${a.text}${a.link ? ` (${a.link.label}: ${a.link.url})` : ''}`), '']
      : []),
    `Alle Sitzungstage: ${archiveUrl}`,
    '',
    '—',
    `Du bekommst diese E-Mail, weil du den Newsletter von ${config.siteName} abonniert hast. Er kommt sonntags, wenn der Bundestag in der Woche getagt hat.`,
    `Abbestellen: ${unsubscribeUrl}`,
  ].join('\n');

  const e = escapeHtml;
  const sans = "font-family:Figtree,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
  const serif = "font-family:Georgia,'Times New Roman',serif";
  const html = `<!doctype html><html lang="de"><body style="margin:0;background:${C.paper};color:${C.ink};${sans}">
<div style="max-width:600px;margin:0 auto;padding:28px 20px">
<p style="font-size:13px;line-height:1.4;color:${C.ink3};margin:0 0 18px">${e(config.siteName)} · die ${e(week)}</p>
${days
  .map(
    (d) => `<div style="background:${C.surface};border-radius:24px;padding:26px 26px 24px;margin:0 0 16px">
<p style="font-size:13px;line-height:1.4;color:${C.ink3};margin:0 0 8px">${e(d.date)}</p>
<h2 style="${serif};font-weight:600;font-size:23px;line-height:1.25;margin:0 0 10px"><a href="${e(d.url)}" style="color:${C.ink};text-decoration:none">${e(d.title)}</a></h2>
<p style="font-size:16px;line-height:1.6;margin:0;color:${C.ink2}">${e(d.lede)}</p>
${d.commonGround ? `<div style="background:${C.stone};border-radius:16px;padding:12px 16px;margin:16px 0 0"><p style="margin:0;font-size:14px;line-height:1.55"><strong>Gemeinsamkeiten.</strong> ${e(d.commonGround)}</p></div>` : ''}
${d.items.length
  ? `<ul style="margin:16px 0 0;padding:0;list-style:none">
${d.items
  .map(
    (i) => `<li style="border-top:1px solid ${C.line};padding:9px 0;font-size:15px;line-height:1.45;color:${C.ink}">${e(i.headline)} <span style="font-size:13px;color:${C.ink3};white-space:nowrap">· ${e(i.result)}</span></li>`,
  )
  .join('\n')}
</ul>`
  : ''}
<p style="margin:18px 0 0"><a href="${e(d.url)}" style="background:${C.ink};color:${C.paper};padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">Ganzer Artikel mit Quellen</a></p>
</div>`,
  )
  .join('\n')}
${actions.length
  ? `<div style="background:${C.stone};border-radius:16px;padding:16px 18px;margin:0 0 16px">
<p style="margin:0 0 8px;font-weight:700;font-size:15px">Was du tun kannst</p>
${actions
  .map(
    (a) => `<p style="margin:8px 0 0;font-size:15px;line-height:1.55"><span style="font-size:12px;color:${C.ink3}">${e(LEVELS[a.level] || '')}</span><br>${e(a.text)}${a.link ? ` <a href="${e(a.link.url)}" style="color:${C.ink}">${e(a.link.label)}</a>` : ''}</p>`,
  )
  .join('\n')}
</div>`
  : ''}
<p style="font-size:12px;line-height:1.6;color:${C.ink3};margin:18px 6px 0">Die Texte schreibt eine KI (Claude) aus den Dokumenten des Bundestags; jede Quelle ist im Artikel verlinkt. <a href="${e(archiveUrl)}" style="color:${C.ink3}">Alle Sitzungstage</a>. Du bekommst diese E-Mail, weil du den Newsletter abonniert hast; er kommt sonntags, wenn der Bundestag in der Woche getagt hat. <a href="${e(unsubscribeUrl)}" style="color:${C.ink3}">Abbestellen</a></p>
</div></body></html>`;

  return { subject: `Die ${week} – ${config.siteName}`, text, html, unsubscribeUrl };
}

// --- sending ----------------------------------------------------------------------

export async function mailWeek({ db, mailer, config }, sunday, { log = () => {}, pauseMs = 550 } = {}) {
  if (!mailer.configured) {
    log('E-Mail-Versand ist nicht eingerichtet (MAIL_API_KEY, MAIL_FROM).');
    return { sent: 0, failed: 0, skipped: true };
  }
  const { from, to } = weekOf(sunday);
  const { rows: articles } = await db.query(
    `select * from articles where status = 'published' and sitting_date between $1 and $2 order by sitting_date`,
    [from, to],
  );
  if (!articles.length) {
    log(`Keine Sitzung in der Woche vom ${formatRangeDe(from, to)}.`);
    return { sent: 0, failed: 0 };
  }

  const { rows: recipients } = await db.query(
    `select u.id, u.email, u.display_name, u.unsubscribe_token from users u
      where u.newsletter and u.email_verified_at is not null
        and not exists (select 1 from newsletter_deliveries e where e.week = $1 and e.user_id = u.id)
      order by u.id`,
    [to],
  );

  let sent = 0;
  let failed = 0;
  for (const user of recipients) {
    // Claim first, send second: a crash between the two costs this person one
    // letter, which is better than a second copy.
    const claimed = await db.one(
      `insert into newsletter_deliveries (week, user_id, status) values ($1, $2, 'sending')
       on conflict do nothing returning user_id`,
      [to, user.id],
    );
    if (!claimed) continue;
    const letter = composeLetter(config, articles, user);
    const res = await mailer.sendMail({ to: user.email, ...letter });
    await db.query(
      'update newsletter_deliveries set status = $3, provider_id = $4, error = $5 where week = $1 and user_id = $2',
      [to, user.id, res.ok ? 'sent' : 'failed', res.id || null, res.ok ? null : String(res.error).slice(0, 500)],
    );
    if (res.ok) sent++;
    else failed++;
    // Resend's default limit is two requests per second.
    if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
  }
  await db.query('update articles set mailed_at = now() where id = any($1::int[]) and mailed_at is null', [articles.map((a) => a.id)]);
  log(`Woche vom ${formatRangeDe(from, to)}, ${articles.length} Sitzungstag${articles.length === 1 ? '' : 'e'}: ${sent} E-Mails versandt${failed ? `, ${failed} fehlgeschlagen` : ''}`);
  return { week: to, days: articles.length, sent, failed };
}
