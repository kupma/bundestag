import { escapeHtml, html, raw } from '../html.js';
import { KINDS, partyClass, pdfPageUrl } from '../programs.js';
import { formatDateDe } from '../text.js';
import { layout } from './layout.js';

// ts_headline marked the hits with ⟦ ⟧; escape first, then mark.
const snippet = (s) => raw(escapeHtml(s).replace(/⟦/g, '<mark>').replace(/⟧/g, '</mark>'));

function searchForm(q, action, placeholder) {
  return html`<form class="search" method="get" action="${action}" role="search">
    <label class="visually-hidden" for="q">Suche</label>
    <input id="q" type="search" name="q" value="${q}" placeholder="${placeholder}" maxlength="200">
    <button type="submit">Suchen</button>
  </form>`;
}

function results(q, hits, { showProgram = true } = {}) {
  if (!q) return '';
  if (!hits.length) return html`<p class="meta">Keine Passage gefunden für „${q}“.</p>`;
  return html`<ol class="hits">${hits.map(
    (h) => html`<li class="hit ${partyClass(h.party)}">
      <p class="hit-meta">${showProgram ? html`<span class="dot" aria-hidden="true"></span><strong>${h.party}</strong> · ${h.title} · ` : ''}PDF-S. ${h.page}</p>
      <p>${snippet(h.snippet)}</p>
      <p class="cite-links"><a href="/stelle/${h.id}">Passage ansehen</a>${h.source_url ? html` · <a href="${pdfPageUrl(h.source_url, h.page)}" target="_blank" rel="noopener">Original-PDF ↗</a>` : ''}</p>
    </li>`,
  )}</ol>`;
}

export function libraryPage(view, { programs, q, hits }) {
  const body = html`<h1>Bibliothek</h1>
  <p class="lede">Die Wahlprogramme, mit denen wir die Beschlüsse abgleichen – durchsuchbar, mit Seitenangabe und Link zum Original.</p>
  ${searchForm(q, '/programme', 'z. B. Mietpreisbremse, Wehrpflicht, Bürgergeld')}
  ${results(q, hits)}
  <h2 class="section-title">Dokumente</h2>
  ${programs.length
    ? html`<ul class="program-list">${programs.map(
        (p) => html`<li class="${partyClass(p.party)}"><span class="dot" aria-hidden="true"></span>
          <a href="/programme/${p.slug}"><strong>${p.party}</strong> – ${p.title}</a>
          <span class="meta">${KINDS[p.kind]}${p.election ? ` · ${p.election}` : ''} · ${p.page_count} Seiten</span></li>`,
      )}</ul>`
    : html`<p>Noch keine Dokumente in der Bibliothek.</p>`}`;
  return layout(view, { title: q ? `Suche: ${q}` : 'Bibliothek', body, canonical: '/programme', noindex: !!q });
}

export function programPage(view, { program, q, hits, cited }) {
  const body = html`<p class="kicker"><a href="/programme">Bibliothek</a></p>
  <h1 class="${partyClass(program.party)}"><span class="dot big" aria-hidden="true"></span>${program.party}: ${program.title}</h1>
  <p class="meta">${KINDS[program.kind]}${program.election ? ` · ${program.election}` : ''} · ${program.page_count} Seiten · ${program.chunk_count} Passagen${
    program.source_url ? html` · <a href="${program.source_url}" target="_blank" rel="noopener">Original-PDF ↗</a>` : ''
  }</p>
  ${searchForm(q, `/programme/${program.slug}`, `In diesem Dokument suchen`)}
  ${results(q, hits, { showProgram: false })}
  ${!q && cited.length
    ? html`<h2 class="section-title">Zuletzt zitiert</h2><ul class="archive-list">${cited.map(
        (c) => html`<li><a href="/stelle/${c.chunk_id}">PDF-S. ${c.page}</a> in <a href="/artikel/${c.slug}">${c.title}</a> <span class="meta">(${formatDateDe(c.sitting_date, { weekday: false })})</span></li>`,
      )}</ul>`
    : ''}`;
  return layout(view, { title: `${program.party}: ${program.title}`, body, canonical: `/programme/${program.slug}`, noindex: !!q });
}

export function passagePage(view, { passage, prev, next, citedIn }) {
  const p = passage;
  const body = html`<p class="kicker"><a href="/programme">Bibliothek</a> › <a href="/programme/${p.slug}">${p.party}: ${p.title}</a></p>
  <h1 class="${partyClass(p.party)}"><span class="dot big" aria-hidden="true"></span>${KINDS[p.kind]} ${p.party}, PDF-Seite ${p.page}</h1>
  <blockquote class="passage">${p.text.split(/\n{2,}/).map((para) => html`<p>${para}</p>`)}</blockquote>
  <p class="cite-links">${p.source_url ? html`<a class="button" href="${pdfPageUrl(p.source_url, p.page)}" target="_blank" rel="noopener">Im Original-PDF auf Seite ${p.page} öffnen ↗</a>` : html`<span class="meta">Für dieses Dokument ist keine Originalquelle hinterlegt.</span>`}</p>
  <p class="pager">${prev ? html`<a href="/stelle/${prev.id}">← vorherige Passage</a>` : ''} ${next ? html`<a href="/stelle/${next.id}">nächste Passage →</a>` : ''}</p>
  ${citedIn.length
    ? html`<h2 class="section-title">Zitiert in</h2><ul class="archive-list">${citedIn.map(
        (a) => html`<li><a href="/artikel/${a.slug}">${a.title}</a> <span class="meta">(${formatDateDe(a.sitting_date, { weekday: false })})</span></li>`,
      )}</ul>`
    : ''}
  <p class="meta">Der Text wurde automatisch aus dem PDF gelesen; Silbentrennung und Spalten können vom Original abweichen. Maßgeblich ist das Original-PDF.</p>`;
  return layout(view, { title: `${p.party}, PDF-S. ${p.page}`, body });
}
