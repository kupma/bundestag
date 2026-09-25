// The daily letter: the day's article, short, with a link to read it in full
// and discuss it on the site. Sent to confirmed subscribers only (double
// opt-in: ticking the box at registration is not enough, the address has to be
// confirmed from the inbox first).

import { escapeHtml } from './html.js';
import { formatDateDe } from './text.js';

const RESULT = { angenommen: 'angenommen', abgelehnt: 'abgelehnt', erledigt: 'für erledigt erklärt', sonstiges: 'beschlossen' };

export function composeLetter(config, article, user) {
  const url = `${config.baseUrl}/artikel/${article.slug}`;
  const unsubscribeUrl = `${config.baseUrl}/newsletter/abmelden?t=${encodeURIComponent(user.unsubscribe_token)}`;
  const body = article.body || {};
  const date = formatDateDe(article.sitting_date);
  const items = (body.decisions || []).map((d) => ({ headline: d.headline, result: RESULT[d.result] || d.result, summary: d.summary }));

  const text = [
    `${config.siteName} – Sitzung vom ${date}`,
    '',
    article.title,
    '',
    article.lede,
    '',
    ...items.flatMap((i) => [`• ${i.headline} (${i.result})`, `  ${i.summary}`, '']),
    `Ganzer Artikel mit Fundstellen und Kommentaren: ${url}`,
    '',
    '—',
    `Du bekommst diese E-Mail, weil du den Newsletter von ${config.siteName} abonniert hast.`,
    `Abbestellen: ${unsubscribeUrl}`,
  ].join('\n');

  const html = `<!doctype html><html lang="de"><body style="margin:0;background:#f6f5f1;font-family:Georgia,serif;color:#1c1c1c">
<div style="max-width:620px;margin:0 auto;padding:24px 20px;background:#fff">
<p style="font:13px/1.4 system-ui,sans-serif;color:#666;margin:0 0 16px">${escapeHtml(config.siteName)} · Sitzung vom ${escapeHtml(date)}</p>
<h1 style="font-size:26px;line-height:1.2;margin:0 0 12px">${escapeHtml(article.title)}</h1>
<p style="font-size:17px;line-height:1.5;margin:0 0 20px">${escapeHtml(article.lede)}</p>
${items
  .map(
    (i) => `<h2 style="font-size:18px;margin:20px 0 4px">${escapeHtml(i.headline)} <span style="font:13px system-ui,sans-serif;color:#666">(${escapeHtml(i.result)})</span></h2>
<p style="font-size:16px;line-height:1.5;margin:0">${escapeHtml(i.summary)}</p>`,
  )
  .join('\n')}
<p style="margin:28px 0"><a href="${escapeHtml(url)}" style="background:#1d3557;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font:15px system-ui,sans-serif">Ganzer Artikel mit Fundstellen &amp; Kommentaren</a></p>
<p style="font:12px/1.5 system-ui,sans-serif;color:#777;border-top:1px solid #ddd;padding-top:12px">Die Analysen werden mit KI (Claude) aus Bundestagsdokumenten und den Wahlprogrammen erstellt und automatisch auf wörtliche Zitate geprüft. Du bekommst diese E-Mail, weil du den Newsletter abonniert hast. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#777">Abbestellen</a></p>
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
