// Getting a letter out of the building, and nothing else: handed an address
// and a letter, it posts it to the mail provider and says whether that worked.
//
// An HTTP API rather than SMTP: Railway blocks outbound SMTP on its smaller
// plans, and a transactional API answers with an id and keeps bounces in a
// dashboard. Resend's shape is below; Postmark, Mailgun, Brevo and SES take the
// same five fields under other names, so `sendMail` is all that would change.
//
// Unconfigured is a valid state: the site works, it just sends no mail.

const TIMEOUT_MS = 10000;

export function createMailer(config, { fetch = globalThis.fetch } = {}) {
  const { apiKey, from, replyTo, baseUrl } = config.mail;
  const configured = !!(apiKey && from);

  async function sendMail({ to, subject, html, text, unsubscribeUrl }) {
    if (!configured) return { ok: false, skipped: true, error: 'E-Mail-Versand ist nicht eingerichtet.' };
    if (!to || !subject) return { ok: false, error: 'Adresse oder Betreff fehlt.' };

    const payload = { from, to: [to], subject, html, text };
    if (replyTo) payload.reply_to = replyTo;
    // RFC 8058 one-click unsubscribe: Gmail and Yahoo require it for bulk mail
    // and show their own "abbestellen" button for it.
    if (unsubscribeUrl) {
      payload.headers = {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }

    try {
      const res = await fetch(`${baseUrl}/emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await res.text();
      if (!res.ok) return { ok: false, status: res.status, error: `Mail-Anbieter antwortete ${res.status}: ${body.slice(0, 300)}` };
      let id = null;
      try {
        id = JSON.parse(body).id || null;
      } catch {
        // an id is nice to have, not needed
      }
      return { ok: true, id };
    } catch (err) {
      return {
        ok: false,
        error: err.name === 'TimeoutError' ? 'Mail-Anbieter hat nicht rechtzeitig geantwortet.' : err.message || 'Mail-Anbieter nicht erreichbar.',
      };
    }
  }

  return { configured, sendMail };
}
