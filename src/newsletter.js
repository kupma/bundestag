// The daily letter: the day's article, short, with a link to read it in full
// and discuss it on the site. Sent to confirmed subscribers only (double
// opt-in: ticking the box at registration is not enough, the address has to be
// confirmed from the inbox first).

import { escapeHtml } from './html.js';
import { isExternal, LEVELS, RESOURCES } from './resources.js';
import { formatDateDe } from './text.js';

const RESULT = { angenommen: 'angenommen', abgelehnt: 'abgelehnt', erledigt: 'für erledigt erklärt', sonstiges: 'beschlossen' };

// Same calm palette as the site: paper, stone, charcoal – no party colour.
const C = { paper: '#f6f3ee', surface: '#fffdfa', stone: '#efebe4', ink: '#2b2926', ink2: '#57524b', ink3: '#807970', line: '#e2dcd2' };

// Up to three suggestions for the whole day, one per decision first, so the
// letter stays short.
function pickActions(decisions) {
  const firsts = decisions.map((d) => (d.actions || [])[0]).filter(Boolean);
  const rest = decisions.flatMap((d) => (d.actions || []).slice(1));
  return [...firsts, ...rest].slice(0, 3);
}

function resourceUrl(config, key) {
  const r = RESOURCES[key];
  if (!r) return null;
  return { label: r.label, url: isExternal(r.url) ? r.url : `${config.baseUrl}${r.url}` };
}

export function composeLetter(config, article, user) {
  const url = `${config.baseUrl}/artikel/${article.slug}`;
  const unsubscribeUrl = `${config.baseUrl}/newsletter/abmelden?t=${encodeURIComponent(user.unsubscribe_token)}`;
  const body = article.body || {};
  const date = formatDateDe(article.sitting_date);
  const decisions = body.decisions || [];
  const items = decisions.map((d) => ({ headline: d.headline, result: RESULT[d.result] || d.result, summary: d.summary }));
  const actions = pickActions(decisions).map((a) => ({ ...a, link: a.resource ? resourceUrl(config, a.resource) : null }));
  const commonGround = String(body.commonGround || '');

  const text = [
    `${config.siteName} – Sitzung vom ${date}`,
    '',
    article.title,
    '',
    article.lede,
    '',
    ...(commonGround ? [`Gemeinsamkeiten: ${commonGround}`, ''] : []),
    ...items.flatMap((i) => [`• ${i.headline} (${i.result})`, `  ${i.summary}`, '']),
    ...(actions.length
      ? ['Was du tun kannst:', ...actions.map((a) => `– ${a.text}${a.link ? ` (${a.link.label}: ${a.link.url})` : ''}`), '']
      : []),
    `Ganzer Artikel mit Fundstellen und Diskussion: ${url}`,
    '',
    '—',
    `Du bekommst diese E-Mail, weil du den Newsletter von ${config.siteName} abonniert hast.`,
    `Abbestellen: ${unsubscribeUrl}`,
  ].join('\n');

  const e = escapeHtml;
  const sans = "font-family:Figtree,-apple-system,'Segoe UI',Roboto,Arial,sans-serif";
  const serif = "font-family:Georgia,'Times New Roman',serif";
  const html = `<!doctype html><html lang="de"><body style="margin:0;background:${C.paper};color:${C.ink};${sans}">
<div style="max-width:600px;margin:0 auto;padding:28px 20px">
<p style="font-size:13px;line-height:1.4;color:${C.ink3};margin:0 0 18px">${e(config.siteName)} · Sitzung vom ${e(date)}</p>
<div style="background:${C.surface};border-radius:24px;padding:28px 26px">
<h1 style="${serif};font-weight:600;font-size:26px;line-height:1.25;margin:0 0 12px;color:${C.ink}">${e(article.title)}</h1>
<p style="font-size:17px;line-height:1.6;margin:0 0 8px;color:${C.ink2}">${e(article.lede)}</p>
${commonGround ? `<div style="background:${C.stone};border-radius:16px;padding:14px 18px;margin:20px 0 4px"><p style="margin:0;font-size:15px;line-height:1.6"><strong>Gemeinsamkeiten.</strong> ${e(commonGround)}</p></div>` : ''}
${items
  .map(
    (i) => `<h2 style="${serif};font-weight:600;font-size:19px;line-height:1.3;margin:24px 0 4px;color:${C.ink}">${e(i.headline)}</h2>
<p style="font-size:13px;color:${C.ink3};margin:0 0 6px">${e(i.result)}</p>
<p style="font-size:16px;line-height:1.6;margin:0;color:${C.ink2}">${e(i.summary)}</p>`,
  )
  .join('\n')}
${actions.length
  ? `<div style="background:${C.stone};border-radius:16px;padding:16px 18px;margin:26px 0 0">
<p style="margin:0 0 8px;font-weight:700;font-size:15px">Was du tun kannst</p>
${actions
  .map(
    (a) => `<p style="margin:8px 0 0;font-size:15px;line-height:1.55"><span style="font-size:12px;color:${C.ink3}">${e(LEVELS[a.level] || '')}</span><br>${e(a.text)}${a.link ? ` <a href="${e(a.link.url)}" style="color:${C.ink}">${e(a.link.label)}</a>` : ''}</p>`,
  )
  .join('\n')}
</div>`
  : ''}
<p style="margin:28px 0 4px"><a href="${e(url)}" style="background:${C.ink};color:${C.paper};padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">Ganzer Artikel mit Fundstellen</a></p>
</div>
<p style="font-size:12px;line-height:1.6;color:${C.ink3};margin:18px 6px 0">Die Einordnungen erstellt eine KI (Claude) aus Bundestagsdokumenten und den Wahlprogrammen; jedes Zitat wird automatisch geprüft. Du bekommst diese E-Mail, weil du den Newsletter abonniert hast. <a href="${e(unsubscribeUrl)}" style="color:${C.ink3}">Abbestellen</a></p>
</div></body></html>`;

  return { subject: `${article.title} – ${config.siteName}`, text, html, unsubscribeUrl };
}

export async function mailArticle({ db, mailer, config }, articleId, { log = () => {}, pauseMs = 550 } = {}) {
  if (!mailer.configured) {
    log('E-Mail-Versand ist nicht eingerichtet (MAIL_API_KEY, MAIL_FROM).');
    return { sent: 0, failed: 0, skipped: true };
  }
  const article = await db.one(`select * from articles where id = $1 and status = 'published'`, [articleId]);
  if (!article) return { sent: 0, failed: 0 };

  const { rows: recipients } = await db.query(
    `select u.id, u.email, u.display_name, u.unsubscribe_token from users u
      where u.newsletter and u.email_verified_at is not null
        and not exists (select 1 from email_deliveries e where e.article_id = $1 and e.user_id = u.id)
      order by u.id`,
    [articleId],
  );

  let sent = 0;
  let failed = 0;
  for (const user of recipients) {
    // Claim first, send second: a crash between the two costs this person one
    // letter, which is better than a second copy.
    const claimed = await db.one(
      `insert into email_deliveries (article_id, user_id, status) values ($1, $2, 'sending')
       on conflict do nothing returning user_id`,
      [articleId, user.id],
    );
    if (!claimed) continue;
    const letter = composeLetter(config, article, user);
    const res = await mailer.sendMail({ to: user.email, ...letter });
    await db.query(
      'update email_deliveries set status = $3, provider_id = $4, error = $5 where article_id = $1 and user_id = $2',
      [articleId, user.id, res.ok ? 'sent' : 'failed', res.id || null, res.ok ? null : String(res.error).slice(0, 500)],
    );
    if (res.ok) sent++;
    else failed++;
    // Resend's default limit is two requests per second.
    if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
  }
  await db.query('update articles set mailed_at = now() where id = $1 and mailed_at is null', [articleId]);
  log(`${sent} E-Mails versandt${failed ? `, ${failed} fehlgeschlagen` : ''}`);
  return { sent, failed };
}
