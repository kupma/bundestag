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
