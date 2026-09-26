import { html } from '../html.js';
import { KINDS } from '../programs.js';
import { formatDateDe, formatDateTimeDe, truncate } from '../text.js';
import { ASSET_VERSION, layout, notices } from './layout.js';

const yes = (ok, label) => html`<span class="chip ${ok ? 'ok' : 'warn'}">${ok ? '✓' : '✗'} ${label}</span>`;

export function adminPage(view, d) {
  const { config } = view;
  const body = html`<h1>Admin</h1>
  ${notices({ notice: d.notice, error: d.error })}

  <section class="admin-block">
    <h2>Status</h2>
    <p class="chips">
      ${yes(d.status.dip, 'DIP-API-Key')}
      ${yes(d.status.claude, `Claude (${config.claudeModel})`)}
      ${yes(d.status.mail, 'E-Mail-Versand')}
      ${yes(d.status.voyage, 'Semantische Suche (optional)')}
      ${yes(d.status.database === 'postgres', d.status.database === 'postgres' ? 'Postgres' : 'PGlite (nur lokal!)')}
      ${yes(d.status.scheduler, 'Zeitplan')}
    </p>
    <p>${d.counts.users} Konten · ${d.counts.subscribers} Newsletter-Abos (bestätigt) · ${d.counts.articles} Artikel · ${d.counts.comments} Kommentare · ${d.counts.chunks} Passagen in ${d.programs.length} Dokumenten</p>
  </section>

  <section class="admin-block">
    <h2>Besucher</h2>
    <p><a class="button secondary" href="/admin/statistik">Statistik ansehen →</a></p>
    <p class="meta">Ohne Cookies und ohne fremde Dienste gezählt.${config.plausible.domain ? ` Zusätzlich aktiv: Plausible (${config.plausible.domain}).` : ''}${config.seo.googleVerification ? ' Google Search Console ist verbunden.' : ' Tipp: GOOGLE_SITE_VERIFICATION setzen und die Seite in der Google Search Console anmelden – dort stehen die Suchbegriffe.'}</p>
  </section>

  <section class="admin-block">
    <h2>Aktionen</h2>
    <div class="admin-actions">
      <form method="post" action="/admin/tick"><button type="submit">Jetzt aktualisieren</button><p class="meta">Holt neue Beschlüsse aus DIP, schreibt fällige Artikel, verschickt den Newsletter.</p></form>
      <form method="post" action="/admin/artikel" class="stack">
        <label for="date">Artikel für Sitzungstag erzeugen</label>
        <input id="date" name="date" type="date" required value="${d.suggestedDate || ''}">
        <label class="check"><input type="checkbox" name="force" value="1"> vorhandenen Artikel neu schreiben</label>
        <button type="submit">Erzeugen</button>
        <p class="meta">Läuft im Hintergrund (einige Minuten); das Ergebnis steht unten unter „Protokoll“.</p>
      </form>
    </div>
  </section>

  <section class="admin-block">
    <h2>Sitzungstage der letzten ${config.lookbackDays + 4} Tage</h2>
    ${d.days.length
      ? html`<table><thead><tr><th>Tag</th><th>Beschlüsse</th><th>davon im Detail</th><th>Artikel</th></tr></thead><tbody>${d.days.map(
          (x) => html`<tr><td>${formatDateDe(x.sitting_date)}</td><td>${x.n}</td><td>${x.in_depth}</td><td>${x.slug ? html`<a href="/artikel/${x.slug}">ansehen</a>` : '–'}</td></tr>`,
        )}</tbody></table>`
      : html`<p class="meta">Noch keine Beschlüsse abgerufen.</p>`}
  </section>

  <section class="admin-block">
    <h2>Bibliothek</h2>
    <h3>Standard-Bibliothek</h3>
    <p class="meta">Die Wahlprogramme aller Bundestagsparteien und der Koalitionsvertrag werden automatisch von den offiziellen Seiten geladen und geprüft – beim ersten Durchlauf nach dem Start und danach für alles, was noch fehlt.${config.defaultLibrary ? '' : ' (Zurzeit abgeschaltet: DEFAULT_LIBRARY=off.)'}</p>
    <table><thead><tr><th>Partei</th><th>Dokument</th><th>Status</th><th>Quelle</th></tr></thead><tbody>${d.standard.map(
      (s) => html`<tr>
        <td>${s.party}</td>
        <td>${s.program && s.program.status === 'ready' ? html`<a href="/programme/${s.program.slug}">${s.title}</a>` : s.title}</td>
        <td>${!s.program
          ? html`<span class="chip warn">noch nicht geladen</span>`
          : s.program.status === 'ready'
            ? html`<span class="chip ok">bereit, ${s.program.page_count} Seiten</span>`
            : s.program.status === 'error'
              ? html`<span class="chip warn">Fehler</span> <span class="meta">${truncate(s.program.error || '', 140)}</span>`
              : html`<span class="chip">wird verarbeitet</span>`}</td>
        <td>${s.program && s.program.source_url ? html`<a href="${s.program.source_url}" target="_blank" rel="noopener">PDF ↗</a>` : ''}</td>
      </tr>`,
    )}</tbody></table>
    <form method="post" action="/admin/programme/standard"><button type="submit" class="secondary">Fehlende jetzt laden</button></form>
    <h3>Weiteres Dokument hinzufügen</h3>
    <p class="meta">Wahlprogramme als PDF, am besten direkt von der Website der Partei. Die Quelladresse wird für die Links „Original-PDF, Seite …“ gebraucht – auch beim Hochladen bitte angeben.</p>
    <div class="admin-actions">
      <form method="post" action="/admin/programme" class="stack" id="program-form">
        <label for="party">Partei</label><input id="party" name="party" required placeholder="z. B. SPD" maxlength="60">
        <label for="title">Titel</label><input id="title" name="title" required placeholder="z. B. Regierungsprogramm 2025" maxlength="200">
        <label for="kind">Art</label>
        <select id="kind" name="kind">${Object.entries(KINDS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select>
        <label for="election">Wahl</label><input id="election" name="election" placeholder="z. B. Bundestagswahl 2025" maxlength="80">
        <label for="source_url">Adresse des PDFs</label><input id="source_url" name="source_url" type="url" placeholder="https://…/programm.pdf">
        <label for="file">… oder PDF hochladen <span class="meta">(dann wird die Adresse nur für die Links verwendet)</span></label>
        <input id="file" type="file" accept="application/pdf">
        <button type="submit">Importieren</button>
        <p class="meta" id="upload-status" role="status"></p>
      </form>
    </div>
    ${d.programs.length
      ? html`<table><thead><tr><th>Partei</th><th>Titel</th><th>Art</th><th>Status</th><th>Seiten</th><th>Passagen</th><th></th></tr></thead><tbody>${d.programs.map(
          (p) => html`<tr>
            <td>${p.party}</td><td><a href="/programme/${p.slug}">${p.title}</a></td><td>${KINDS[p.kind]}</td>
            <td>${p.status === 'ready' ? html`<span class="chip ok">bereit</span>` : p.status === 'error' ? html`<span class="chip warn" title="${p.error || ''}">Fehler</span> <span class="meta">${truncate(p.error || '', 120)}</span>` : html`<span class="chip">wird verarbeitet</span>`}</td>
            <td>${p.page_count}</td><td>${p.chunk_count}${p.embedding_model ? html` <span class="meta">(+ ${p.embedding_model})</span>` : ''}</td>
            <td><form method="post" action="/admin/programme/${p.id}/loeschen" class="inline confirm" data-confirm="${p.party}: ${p.title} wirklich löschen? Zitate in bestehenden Artikeln verlieren ihren Link auf die Passage."><button class="link danger" type="submit">löschen</button></form></td>
          </tr>`,
        )}</tbody></table>`
      : html`<p class="meta">Noch leer.</p>`}
  </section>

  <section class="admin-block">
    <h2>Artikel</h2>
    ${d.articles.length
      ? html`<table><thead><tr><th>Sitzungstag</th><th>Titel</th><th>Status</th><th>Newsletter</th><th>Kosten</th><th></th></tr></thead><tbody>${d.articles.map(
          (a) => html`<tr>
            <td>${formatDateDe(a.sitting_date, { weekday: false })}</td>
            <td><a href="/artikel/${a.slug}">${truncate(a.title, 70)}</a></td>
            <td>${a.status === 'published' ? 'sichtbar' : html`<span class="chip warn">ausgeblendet</span>`}</td>
            <td>${a.mailed_at ? formatDateTimeDe(a.mailed_at) : '–'}</td>
            <td class="meta">${a.usage ? `${a.usage.calls} Aufrufe, ${Math.round((a.usage.input || 0) / 1000)}k/${Math.round((a.usage.output || 0) / 1000)}k Token` : ''}</td>
            <td>
              <form method="post" action="/admin/artikel/${a.id}/${a.status === 'published' ? 'ausblenden' : 'einblenden'}" class="inline"><button class="link" type="submit">${a.status === 'published' ? 'ausblenden' : 'einblenden'}</button></form>
              ${!a.mailed_at && a.status === 'published' ? html`<form method="post" action="/admin/artikel/${a.id}/versenden" class="inline"><button class="link" type="submit">jetzt versenden</button></form>` : ''}
            </td>
          </tr>`,
        )}</tbody></table>`
      : html`<p class="meta">Noch keine.</p>`}
  </section>

  <section class="admin-block">
    <h2>Neueste Kommentare</h2>
    ${d.comments.length
      ? html`<ul class="admin-comments">${d.comments.map(
          (c) => html`<li><p><strong>${c.display_name}</strong> <span class="meta">(${c.email}) zu <a href="/artikel/${c.slug}#kommentar-${c.id}">${truncate(c.title, 60)}</a>, ${formatDateTimeDe(c.created_at)}</span></p>
            <p>${truncate(c.body, 300)}</p>
            <form method="post" action="/kommentare/${c.id}/loeschen" class="inline"><button class="link danger" type="submit">löschen</button></form></li>`,
        )}</ul>`
      : html`<p class="meta">Keine.</p>`}
  </section>

  <section class="admin-block">
    <h2>Protokoll</h2>
    ${d.jobs.length
      ? html`<table class="jobs"><thead><tr><th>Start</th><th>Aufgabe</th><th>Ergebnis</th></tr></thead><tbody>${d.jobs.map(
          (j) => html`<tr class="${j.ok === false ? 'failed' : ''}"><td>${formatDateTimeDe(j.started_at)}</td><td>${j.kind}</td><td><pre>${j.ok == null ? 'läuft …\n' : ''}${j.summary}</pre></td></tr>`,
        )}</tbody></table>`
      : html`<p class="meta">Noch nichts gelaufen.</p>`}
  </section>
  <script src="/static/admin.js?v=${ASSET_VERSION.adminJs}" defer></script>`;
  return layout(view, { title: 'Admin', body, noindex: true });
}

// --- statistics -------------------------------------------------------------------

const fmt = (n) => new Intl.NumberFormat('de-DE').format(n || 0);

function rankTable(title, rows, { label = (k) => k, empty = 'Noch keine Daten.' } = {}) {
  return html`<div class="stats-table"><h3>${title}</h3>${rows.length
    ? html`<table><thead><tr><th></th><th class="num">Besuche</th><th class="num">Aufrufe</th></tr></thead><tbody>${rows.map(
        (r) => html`<tr><td>${label(r.key)}</td><td class="num">${fmt(r.visitors)}</td><td class="num">${fmt(r.views)}</td></tr>`,
      )}</tbody></table>`
    : html`<p class="meta">${empty}</p>`}</div>`;
}

export function statsPage(view, { days, report }) {
  const { series, totals } = report;
  const max = Math.max(1, ...series.map((r) => r.visitors));
  const dayLabel = (d) => formatDateDe(d, { weekday: false });
  const body = html`<p class="meta"><a href="/admin">← Admin</a></p>
  <h1>Statistik</h1>
  <p class="range-nav">${[7, 30, 90, 365].map((n) => html`<a class="chip${n === days ? ' ok' : ''}" href="/admin/statistik?tage=${n}"${n === days ? html` aria-current="page"` : ''}>${n} Tage</a>`)}</p>

  <div class="stat-tiles">
    <div class="stat-tile"><span class="stat-value">${fmt(totals.live)}</span><span class="stat-label">gerade da (30 Min.)</span></div>
    <div class="stat-tile"><span class="stat-value">${fmt(totals.today.visitors)}</span><span class="stat-label">Besuche heute</span></div>
    <div class="stat-tile"><span class="stat-value">${fmt(totals.week.visits)}</span><span class="stat-label">Besuche, 7 Tage</span></div>
    <div class="stat-tile"><span class="stat-value">${fmt(totals.visits)}</span><span class="stat-label">Besuche, ${days} Tage</span></div>
    <div class="stat-tile"><span class="stat-value">${fmt(totals.views)}</span><span class="stat-label">Seitenaufrufe, ${days} Tage</span></div>
  </div>

  <section class="admin-block">
    <h2>Besuche pro Tag</h2>
    <svg class="bars" viewBox="0 0 ${series.length * 10} 100" preserveAspectRatio="none" role="img" aria-label="Besuche pro Tag vom ${dayLabel(report.from)} bis ${dayLabel(report.today)}, höchstens ${fmt(max)} an einem Tag">
      ${series.map((r, i) => {
        const h = r.visitors ? Math.max(1.5, (r.visitors / max) * 100) : 0;
        return html`<g><rect class="bar-hit" x="${i * 10}" y="0" width="10" height="100"></rect><rect class="bar" x="${i * 10 + 1.5}" y="${(100 - h).toFixed(2)}" width="7" height="${h.toFixed(2)}" rx="1"></rect><title>${dayLabel(r.day)}: ${fmt(r.visitors)} Besuche, ${fmt(r.views)} Aufrufe</title></g>`;
      })}
    </svg>
    <p class="bars-axis meta"><span>${dayLabel(report.from)}</span><span>Spitze: ${fmt(max)}</span><span>${dayLabel(report.today)}</span></p>
  </section>

  <section class="admin-block stats-grid">
    ${rankTable('Seiten', report.pages, { label: (k) => html`<a href="${k}">${k}</a>` })}
    ${rankTable('Woher', report.referrers, { empty: 'Noch keine verweisenden Seiten – direkte Besuche zählen hier nicht.' })}
    ${rankTable('Kampagnen (utm_source)', report.sources, { empty: 'Links mit ?utm_source=… erscheinen hier, z. B. der Newsletter.' })}
    ${rankTable('Geräte', report.devices)}
  </section>
  <p class="meta">Ein „Besuch“ ist eine Person an einem Tag: Wer an drei Tagen kommt, zählt dreimal. Gezählt wird ohne Cookies, Bots und Admins werden nicht mitgezählt. Rohdaten werden nach gut einem Jahr gelöscht.</p>`;
  return layout(view, { title: 'Statistik', body, noindex: true });
}
