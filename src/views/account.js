import { escapeHtml as escape, html } from '../html.js';
import { formatDateTimeDe } from '../text.js';
import { layout, notices } from './layout.js';

const hiddenNext = (next) => (next ? html`<input type="hidden" name="weiter" value="${next}">` : '');

export function loginPage(view, { email = '', next = '', error = '', notice = '' } = {}) {
  const body = html`<section class="form-page">
    <h1>Anmelden</h1>
    ${notices({ error, notice })}
    <form method="post" action="/anmelden">
      ${hiddenNext(next)}
      <label for="email">E-Mail-Adresse</label>
      <input id="email" name="email" type="email" autocomplete="email" required value="${email}">
      <label for="password">Passwort</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Anmelden</button>
    </form>
    <p><a href="/passwort-vergessen">Passwort vergessen?</a> · Noch kein Konto? <a href="/registrieren${next ? `?weiter=${encodeURIComponent(next)}` : ''}">Registrieren</a></p>
  </section>`;
  return layout(view, { title: 'Anmelden', body, noindex: true });
}

export function registerPage(view, { values = {}, errors = [], next = '' } = {}) {
  const body = html`<section class="form-page">
    <h1>Registrieren</h1>
    <p>Mit einem Konto kannst du die Artikel kommentieren und den täglichen Newsletter bekommen.</p>
    ${notices({ errors })}
    <form method="post" action="/registrieren">
      ${hiddenNext(next)}
      <label for="display_name">Anzeigename <span class="meta">(öffentlich sichtbar bei Kommentaren)</span></label>
      <input id="display_name" name="display_name" required minlength="2" maxlength="40" value="${values.display_name || ''}" autocomplete="nickname">
      <label for="email">E-Mail-Adresse</label>
      <input id="email" name="email" type="email" required value="${values.email || ''}" autocomplete="email">
      <label for="password">Passwort <span class="meta">(mindestens 10 Zeichen)</span></label>
      <input id="password" name="password" type="password" required minlength="10" autocomplete="new-password">
      <label class="check"><input type="checkbox" name="newsletter" value="1"${values.newsletter ? html` checked` : ''}> Ja, ich möchte nach jedem Sitzungstag den Artikel per E-Mail erhalten. Abbestellen ist jederzeit möglich.</label>
      <label class="check"><input type="checkbox" name="privacy" value="1" required${values.privacy ? html` checked` : ''}> Ich habe die <a href="/datenschutz" target="_blank">Datenschutzerklärung</a> gelesen.</label>
      <button type="submit">Konto anlegen</button>
    </form>
    <p>Schon registriert? <a href="/anmelden">Anmelden</a></p>
  </section>`;
  return layout(view, { title: 'Registrieren', body, noindex: true });
}

export function accountPage(view, { notice = '', error = '', mailConfigured, comments }) {
  const u = view.user;
  const body = html`<section class="form-page wide">
    <h1>Dein Konto</h1>
    ${notices({ notice, error })}
    <dl class="facts">
      <dt>Anzeigename</dt><dd>${u.display_name}</dd>
      <dt>E-Mail</dt><dd>${u.email} ${u.email_verified_at ? html`<span class="chip ok">bestätigt</span>` : html`<span class="chip warn">nicht bestätigt</span>`}</dd>
    </dl>
    ${!u.email_verified_at && mailConfigured
      ? html`<form method="post" action="/konto/bestaetigung-senden" class="inline-form"><p>Wir haben dir einen Bestätigungslink geschickt. Nichts angekommen?</p><button type="submit" class="secondary">Link erneut senden</button></form>`
      : ''}
    <h2>Newsletter</h2>
    ${mailConfigured
      ? html`<form method="post" action="/konto/newsletter">
          <label class="check"><input type="checkbox" name="newsletter" value="1"${u.newsletter ? html` checked` : ''}> Artikel nach jedem Sitzungstag per E-Mail erhalten</label>
          ${u.newsletter && !u.email_verified_at ? html`<p class="meta">Der Versand beginnt, sobald deine E-Mail-Adresse bestätigt ist.</p>` : ''}
          <button type="submit" class="secondary">Speichern</button>
        </form>`
      : html`<p class="meta">Der E-Mail-Versand ist auf dieser Installation noch nicht eingerichtet.</p>`}
    <h2>Deine Kommentare</h2>
    ${comments.length
      ? html`<ul class="archive-list">${comments.map(
          (c) => html`<li><a href="/artikel/${c.slug}#kommentar-${c.id}">${c.title}</a> <span class="meta">· ${formatDateTimeDe(c.created_at)}</span></li>`,
        )}</ul>`
      : html`<p class="meta">Noch keine.</p>`}
    <h2>Abmelden</h2>
    <form method="post" action="/abmelden"><button type="submit" class="secondary">Abmelden</button></form>
    <h2>Konto löschen</h2>
    <form method="post" action="/konto/loeschen" class="danger-zone">
      <p>Löscht dein Konto und alle deine Kommentare endgültig.</p>
      <label for="confirm_password">Zur Bestätigung dein Passwort</label>
      <input id="confirm_password" name="password" type="password" required autocomplete="current-password">
      <button type="submit" class="danger">Konto endgültig löschen</button>
    </form>
  </section>`;
  return layout(view, { title: 'Konto', body, noindex: true });
}

export function forgotPage(view, { notice = '', error = '' } = {}) {
  const body = html`<section class="form-page">
    <h1>Passwort vergessen</h1>
    ${notices({ notice, error })}
    ${view.mailConfigured
      ? html`<form method="post" action="/passwort-vergessen">
          <label for="email">E-Mail-Adresse deines Kontos</label>
          <input id="email" name="email" type="email" required autocomplete="email">
          <button type="submit">Link zum Zurücksetzen senden</button>
        </form>`
      : html`<p>Auf dieser Installation ist kein E-Mail-Versand eingerichtet. Bitte wende dich an die Betreiber.</p>`}
  </section>`;
  return layout(view, { title: 'Passwort vergessen', body, noindex: true });
}

export function resetPage(view, { token, errors = [] }) {
  const body = html`<section class="form-page">
    <h1>Neues Passwort</h1>
    ${notices({ errors })}
    <form method="post" action="/passwort-neu">
      <input type="hidden" name="token" value="${token}">
      <label for="password">Neues Passwort <span class="meta">(mindestens 10 Zeichen)</span></label>
      <input id="password" name="password" type="password" required minlength="10" autocomplete="new-password">
      <button type="submit">Passwort speichern</button>
    </form>
  </section>`;
  return layout(view, { title: 'Neues Passwort', body, noindex: true });
}

export function messagePage(view, { title, message, link = '/', linkLabel = 'Zur Startseite' }) {
  const body = html`<section class="form-page"><h1>${title}</h1><p>${message}</p><p><a href="${link}">${linkLabel}</a></p></section>`;
  return layout(view, { title, body, noindex: true });
}

export function unsubscribePage(view, { token, done, email }) {
  const body = html`<section class="form-page">
    <h1>Newsletter abbestellen</h1>
    ${done
      ? html`<p>Erledigt – ${email ? html`<strong>${email}</strong> bekommt` : 'du bekommst'} keine Newsletter-E-Mails mehr. Dein Konto bleibt bestehen.</p>`
      : html`<form method="post" action="/newsletter/abmelden?t=${encodeURIComponent(token)}">
          <p>Möchtest du den Newsletter wirklich abbestellen?</p>
          <button type="submit">Ja, abbestellen</button>
        </form>`}
  </section>`;
  return layout(view, { title: 'Newsletter abbestellen', body, noindex: true });
}

export function verifyMail(config, user, token) {
  const url = `${config.baseUrl}/konto/bestaetigen?token=${encodeURIComponent(token)}`;
  return {
    subject: `Bitte bestätige deine E-Mail-Adresse – ${config.siteName}`,
    text: `Hallo ${user.display_name},\n\nbitte bestätige deine E-Mail-Adresse für ${config.siteName}:\n${url}\n\nDer Link ist 48 Stunden gültig. Wenn du dich nicht registriert hast, ignoriere diese E-Mail einfach.`,
    html: `<p>Hallo ${escape(user.display_name)},</p><p>bitte bestätige deine E-Mail-Adresse für ${escape(config.siteName)}:</p><p><a href="${escape(url)}">E-Mail-Adresse bestätigen</a></p><p>Der Link ist 48 Stunden gültig. Wenn du dich nicht registriert hast, ignoriere diese E-Mail einfach.</p>`,
  };
}

export function resetMail(config, user, token) {
  const url = `${config.baseUrl}/passwort-neu?token=${encodeURIComponent(token)}`;
  return {
    subject: `Passwort zurücksetzen – ${config.siteName}`,
    text: `Hallo ${user.display_name},\n\nüber diesen Link kannst du ein neues Passwort setzen:\n${url}\n\nDer Link ist 2 Stunden gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail.`,
    html: `<p>Hallo ${escape(user.display_name)},</p><p><a href="${escape(url)}">Neues Passwort setzen</a></p><p>Der Link ist 2 Stunden gültig. Wenn du das nicht angefordert hast, ignoriere diese E-Mail.</p>`,
  };
}

