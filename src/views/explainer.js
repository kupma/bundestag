// How the Bundestag decides, in plain words, for readers without any
// background: the page /bundestag-erklaert, and next to every decision in an
// article a short "Was heißt das?". Both say the things a result pill cannot:
// a bill the Bundestag passed is not in force yet, an adopted motion is no
// law at all, and a first reading decides nothing.
//
// Everything here is general knowledge from the Grundgesetz and the
// Bundestag's rules of procedure, written once by hand – nothing is generated.

import { html } from '../html.js';
import { formatDateDe } from '../text.js';
import { PLENUM, RESULT_LABEL } from './labels.js';
import { layout } from './layout.js';
import { pendingMark } from './shapes.js';

export const EXPLAINER_PATH = '/bundestag-erklaert';

// --- what a decision means ---------------------------------------------------------

// What a decision was about, from DIP's Vorgangstyp and the title.
export function procedureKind({ vorgangstyp = '', title = '' } = {}) {
  const typ = String(vorgangstyp).toLowerCase();
  const t = String(title).toLowerCase();
  if (/petition|sammelübersicht/.test(`${typ} ${t}`)) return 'petition';
  if (/gesetz/.test(typ)) return 'gesetz';
  if (/entschließung/.test(typ)) return 'entschliessung';
  // every mandate for the armed forces abroad is titled like this
  if (/bewaffnete[rn]? deutsche[rn]? streitkräfte/.test(t)) return 'einsatz';
  if (/antrag/.test(typ)) return 'antrag';
  if (/^wahl\b|wahlvorschlag/.test(typ) || /^wahl\b|\bwahl (?:der|des|eines|einer|von) /.test(t)) return 'wahl';
  if (/verordnung/.test(typ)) return 'verordnung';
  if (/eu-vorlage/.test(typ)) return 'eu';
  return 'sonstiges';
}

// Whether a bill had its final vote that day. DIP names the plenary positions
// "2. Beratung" and "3. Beratung"; a day with only the second reading (the
// budget week, say) has not decided the bill yet. Articles written before the
// positions were stored count as final, which is what nearly every day is.
export function finalReading(positions) {
  if (!Array.isArray(positions) || !positions.length) return true;
  const second = positions.some((p) => /^2\.|zweite/i.test(p));
  const third = positions.some((p) => /^3\.|dritte|schlussabstimmung/i.test(p));
  return third || !second;
}

const MORE = {
  gesetz: ['#gesetz', 'Wie ein Gesetz entsteht'],
  vorlagen: ['#vorlagen', 'Welche Beschlüsse es gibt'],
  start: ['', 'So arbeitet der Bundestag'],
};

export function decisionMeaning(d) {
  const kind = procedureKind(d);
  const r = d.result;
  const settled = 'Über den Inhalt wird damit nicht mehr abgestimmt – meist, weil sich die Sache überholt hat oder in einem anderen Beschluss aufgegangen ist.';
  switch (kind) {
    case 'gesetz':
      if (r === 'angenommen' && !finalReading(d.positions)) {
        return { kind, more: MORE.gesetz, text: 'Der Bundestag hat den Entwurf in zweiter Lesung angenommen. Beschlossen ist das Gesetz erst mit der Schlussabstimmung in der dritten Lesung.' };
      }
      if (r === 'angenommen') {
        return { kind, more: MORE.gesetz, path: true, text: 'Der Bundestag hat das Gesetz beschlossen. In Kraft ist es damit noch nicht: Als Nächstes ist der Bundesrat dran, dann unterschreibt der Bundespräsident, und erst nach der Verkündung im Bundesgesetzblatt gilt es.' };
      }
      if (r === 'abgelehnt') return { kind, more: MORE.gesetz, text: 'Der Bundestag hat den Gesetzentwurf abgelehnt. Damit ist er gescheitert – ein Gesetz wird daraus nicht.' };
      if (r === 'erledigt') return { kind, more: MORE.gesetz, text: `Der Gesetzentwurf wurde für erledigt erklärt. ${settled}` };
      return { kind, more: MORE.gesetz, text: 'Ein Beschluss in einem Gesetzgebungsverfahren. Was genau entschieden wurde, steht oben.' };
    case 'einsatz':
      return {
        kind,
        more: MORE.vorlagen,
        text: `${r === 'angenommen' ? 'Der Bundestag hat dem Antrag zugestimmt.' : r === 'abgelehnt' ? 'Der Bundestag hat den Antrag abgelehnt.' : 'Ein Beschluss zu einem Einsatz der Bundeswehr.'} Bewaffnete Einsätze der Bundeswehr im Ausland brauchen die Zustimmung des Bundestags – anders als die meisten Anträge ist dieser Beschluss verbindlich.`,
      };
    case 'antrag':
      if (r === 'angenommen') return { kind, more: MORE.vorlagen, text: 'Der Bundestag hat den Antrag angenommen. Ein Antrag ist kein Gesetz: Der Bundestag bezieht damit Stellung oder fordert meist die Bundesregierung auf, etwas zu tun. Das hat politisches Gewicht, ändert für sich genommen aber keine Regel.' };
      if (r === 'abgelehnt') return { kind, more: MORE.vorlagen, text: 'Der Antrag ist abgelehnt und damit vom Tisch. Das ist der häufigste Ausgang: Die meisten Anträge stellt die Opposition, und die Mehrheit haben die Fraktionen, die die Regierung tragen.' };
      if (r === 'erledigt') return { kind, more: MORE.vorlagen, text: `Der Antrag wurde für erledigt erklärt. ${settled}` };
      return { kind, more: MORE.vorlagen, text: 'Ein Beschluss über einen Antrag. Ein Antrag ist kein Gesetz: Der Bundestag bezieht damit Stellung oder fordert die Bundesregierung zu etwas auf.' };
    case 'entschliessung':
      if (r === 'angenommen') return { kind, more: MORE.vorlagen, text: 'Der Bundestag hat eine Entschließung gefasst: eine politische Erklärung, meist zu einem Gesetz oder einer Debatte. Sie ist kein Gesetz und bindet niemanden rechtlich.' };
      return { kind, more: MORE.vorlagen, text: `${r === 'abgelehnt' ? 'Der Entschließungsantrag ist abgelehnt.' : 'Ein Beschluss über einen Entschließungsantrag.'} Solche Anträge begleiten oft ein Gesetz oder eine Debatte und zeigen, was eine Fraktion anders machen würde. Ein Gesetz ist das nicht.` };
    case 'wahl':
      return { kind, more: MORE.vorlagen, text: 'Eine Wahl im Plenum: Der Bundestag bestimmt, wer ein Amt übernimmt oder in einem Gremium sitzt.' };
    case 'petition':
      return { kind, more: MORE.vorlagen, text: 'Über Petitionen – Bitten und Beschwerden von Bürgerinnen und Bürgern – entscheidet der Bundestag meist gesammelt, auf Empfehlung des Petitionsausschusses.' };
    case 'verordnung':
      return { kind, more: MORE.vorlagen, text: 'Ein Beschluss über eine Verordnung. Verordnungen erlässt die Bundesregierung auf Grundlage eines Gesetzes; manche brauchen dafür die Zustimmung des Bundestags.' };
    case 'eu':
      return { kind, more: MORE.vorlagen, text: 'Ein Beschluss zu einem Vorhaben der Europäischen Union. Entschieden wird es auf europäischer Ebene; die Bundesregierung muss die Stellungnahme des Bundestags in den Verhandlungen berücksichtigen.' };
    default:
      return { kind, more: MORE.start, text: 'Was ein Beschluss bedeutet, hängt davon ab, worüber abgestimmt wurde – über ein Gesetz, einen Antrag oder eine Wahl.' };
  }
}

// The short words for the folded decision: what it was, and for a passed
// bill where it goes next.
export const KIND_LABEL = {
  gesetz: 'Gesetz',
  einsatz: 'Einsatz der Bundeswehr',
  antrag: 'Antrag',
  entschliessung: 'Entschließungsantrag',
  wahl: 'Wahl',
  petition: 'Petitionen',
  verordnung: 'Verordnung',
  eu: 'EU-Vorhaben',
};

export function decisionTags(d) {
  const { kind, path } = decisionMeaning(d);
  const tags = [KIND_LABEL[kind] || d.vorgangstyp || ''];
  if (path) tags.push('Als Nächstes: Bundesrat');
  return tags.filter(Boolean);
}

// The way of a passed bill, from where it stands after the sitting.
const LAW_PATH = [
  ['Entwurf, erste Lesung, Ausschüsse', 'done'],
  ['Bundestag beschließt', 'now'],
  ['Bundesrat', ''],
  ['Unterschrift des Bundes­präsidenten', ''],
  ['Verkündung, Inkrafttreten', ''],
];

function lawPath(date) {
  return html`<ol class="stages" aria-label="Weg des Gesetzes">${LAW_PATH.map(
    ([label, state]) => html`<li class="${state}"${state === 'now' ? html` aria-current="step"` : ''}>${label}<span class="visually-hidden">${state ? ' – erledigt' : ' – steht noch aus'}</span></li>`,
  )}</ol>
  ${date ? html`<p class="meta">Stand nach der Sitzung vom ${formatDateDe(date, { weekday: false })}.</p>` : ''}`;
}

export function decisionContext(d, date) {
  const m = decisionMeaning(d);
  const [anchor, label] = m.more;
  return html`<aside class="meaning" aria-label="Was heißt das?">
    <p><strong>Was heißt das?</strong> ${m.text}</p>
    ${m.path ? lawPath(date) : ''}
    <p class="meta"><a href="${EXPLAINER_PATH}${anchor}">${label} →</a></p>
  </aside>`;
}

// --- the page ------------------------------------------------------------------------

const SECTIONS = [
  ['beschlossen', 'Ist das beschlossen?'],
  ['gesetz', 'Wie ein Gesetz entsteht'],
  ['vorlagen', 'Nicht alles ist ein Gesetz'],
  ['abstimmung', 'Wie abgestimmt wird'],
  ['wer', 'Wer mitentscheidet'],
  ['lexikon', 'Lexikon'],
];

// What the result marks on this site mean, in the order people meet them.
const MEANINGS = [
  {
    mark: () => html`<span class="result result-angenommen">${RESULT_LABEL.angenommen}</span>`,
    kind: 'Gesetz',
    title: 'Beschlossen – aber noch nicht in Kraft',
    text: 'Der Bundestag hat das Gesetz in der Schlussabstimmung beschlossen. Danach berät der Bundesrat, der Bundespräsident unterschreibt, und das Gesetz wird verkündet. Erst dann gilt es, und zwar ab dem Tag, den es selbst nennt.',
  },
  {
    mark: () => html`<span class="result result-abgelehnt">${RESULT_LABEL.abgelehnt}</span>`,
    kind: 'Gesetz',
    title: 'Gescheitert',
    text: 'Der Entwurf wird kein Gesetz. Das Verfahren ist damit zu Ende.',
  },
  {
    mark: () => html`<span class="result result-angenommen">${RESULT_LABEL.angenommen}</span>`,
    kind: 'Antrag',
    title: 'Eine Forderung, kein Gesetz',
    text: 'Der Bundestag sagt, was er will – meist richtet er sich an die Bundesregierung („Der Bundestag fordert die Bundesregierung auf …“). Das hat politisches Gewicht, ändert für sich genommen aber keine Regel. Die Ausnahme sind Auslandseinsätze der Bundeswehr: Für sie ist die Zustimmung des Bundestags Pflicht.',
  },
  {
    mark: () => html`<span class="result result-abgelehnt">${RESULT_LABEL.abgelehnt}</span>`,
    kind: 'Antrag',
    title: 'Vom Tisch – und der Normalfall',
    text: 'Die meisten Anträge stellt die Opposition, und die Mehrheit haben die Fraktionen, die die Regierung tragen. Abgelehnte Anträge zeigen trotzdem, wofür eine Fraktion steht – deshalb legen wir auch sie neben die Programme.',
  },
  {
    mark: () => html`<span class="result result-erledigt">${RESULT_LABEL.erledigt}</span>`,
    kind: 'Gesetz oder Antrag',
    title: 'Ohne Entscheidung in der Sache',
    text: 'Über den Inhalt wird nicht mehr abgestimmt, etwa weil sich die Sache überholt hat oder in einem anderen Beschluss aufgegangen ist.',
  },
  {
    mark: () => html`<span class="meaning-pending">${pendingMark()}</span>`,
    kind: 'In der Vorschau',
    title: 'Erste Lesung: noch nichts entschieden',
    text: 'Der Entwurf wird zum ersten Mal beraten und in die Ausschüsse überwiesen. Abgestimmt wird über ihn erst Wochen oder Monate später.',
  },
];

// Three words that sound like a decision, or like none.
const CONFUSING = [
  ['Beratung', 'Im Bundestag heißt jede Behandlung eines Themas im Plenum „Beratung“ – mit oder ohne Abstimmung. Ob am Ende abgestimmt wird, steht davor: Die „erste Beratung“ eines Gesetzentwurfs endet mit der Überweisung in die Ausschüsse, die „zweite und dritte Beratung“ mit der Abstimmung.'],
  ['Lesung', 'Ein anderes Wort für die Beratung eines Gesetzentwurfs. Jedes Gesetz hat drei Lesungen; die zweite und dritte finden meist am selben Tag statt.'],
  ['Vorabstimmung', 'Gibt es im eigentlichen Sinn nicht. Was so aussehen kann: In der zweiten Lesung wird abgestimmt und gleich danach in der dritten noch einmal – entscheidend ist die Schlussabstimmung. Vorher beschließen die Ausschüsse ihre Empfehlung, und die Fraktionen klären intern, wie sie abstimmen wollen. Das sind Vorbereitungen; beschlossen ist erst, was das Plenum beschließt.'],
];

// The way of a bill. `where` names the pages of this site that show a step.
const LAW_STEPS = [
  {
    title: 'Der Entwurf',
    text: 'Einen Gesetzentwurf einbringen können die Bundesregierung, der Bundesrat und Abgeordnete des Bundestags – eine Fraktion oder mindestens fünf Prozent der Abgeordneten. Die meisten Entwürfe kommen von der Bundesregierung. Sie gehen zuerst an den Bundesrat, der dazu Stellung nehmen kann.',
  },
  {
    title: 'Erste Lesung',
    where: 'Vorschau: Überweisung',
    text: 'Das Plenum berät den Entwurf zum ersten Mal, manchmal mit Debatte, oft ohne. Über den Inhalt wird nicht abgestimmt – nur darüber, in welche Ausschüsse der Entwurf geht.',
  },
  {
    title: 'In den Ausschüssen',
    text: 'Hier passiert die eigentliche Arbeit. Abgeordnete der Fachgebiete prüfen den Entwurf, hören Sachverständige an und ändern ihn oft. Am Ende steht eine Beschlussempfehlung an das Plenum: annehmen, geändert annehmen oder ablehnen.',
  },
  {
    title: 'Zweite und dritte Lesung',
    where: 'Vorschau: Abstimmung · danach unser Artikel',
    decisive: true,
    text: 'Das Plenum debattiert den Entwurf in der Fassung des Ausschusses und stimmt ab; Änderungsanträge sind möglich. Meist folgt gleich danach die dritte Lesung mit der Schlussabstimmung, bei der die Abgeordneten aufstehen oder sitzen bleiben. Findet sie eine Mehrheit, hat der Bundestag das Gesetz beschlossen.',
  },
  {
    title: 'Bundesrat',
    after: true,
    text: 'Über den Bundesrat wirken die Länder mit. Manche Gesetze brauchen seine Zustimmung, sonst scheitern sie – etwa wenn sie die Finanzen oder die Verwaltung der Länder betreffen (Zustimmungsgesetze). Gegen die übrigen kann er Einspruch einlegen, den der Bundestag überstimmen kann (Einspruchsgesetze). Bei Streit sucht der Vermittlungsausschuss einen Kompromiss.',
  },
  {
    title: 'Unterschrift',
    after: true,
    text: 'Die Bundesregierung zeichnet das Gesetz gegen, dann unterschreibt der Bundespräsident. Er prüft dabei, ob es verfassungsgemäß zustande gekommen ist. Dass er die Unterschrift verweigert, kommt nur sehr selten vor.',
  },
  {
    title: 'Verkündung und Inkrafttreten',
    after: true,
    text: 'Das Gesetz wird im Bundesgesetzblatt verkündet, das seit 2023 online erscheint. Es gilt ab dem Tag, den es selbst nennt – oft erst Monate später. Nennt es keinen, tritt es zwei Wochen nach der Verkündung in Kraft.',
  },
];

const KINDS_OF_DECISION = [
  ['Antrag', 'Eine Fraktion oder die Bundesregierung schlägt vor, was der Bundestag beschließen soll – meist eine Aufforderung an die Bundesregierung. Kein Gesetz und rechtlich nicht bindend, aber ein politisches Signal. Anträge ohne Bericht eines Ausschusses gehen meist erst in die Ausschüsse.'],
  ['Beschlussempfehlung', 'Die Empfehlung eines Ausschusses, wie das Plenum über eine Vorlage entscheiden soll. Abgestimmt wird über die Empfehlung. Vorsicht: „Beschlussempfehlung angenommen“ kann heißen, dass der Antrag dahinter abgelehnt ist – wenn der Ausschuss die Ablehnung empfohlen hat. Wir geben das Ergebnis für die Sache selbst an.'],
  ['Entschließungsantrag', 'Begleitet ein Gesetz oder eine Debatte und sagt, wie der Bundestag dazu steht. Die Opposition nutzt ihn oft, um zu zeigen, was sie anders machen würde. Er ist kein Gesetz.'],
  ['Änderungsantrag', 'Ein Vorschlag, einen Gesetzentwurf in der zweiten oder dritten Lesung zu ändern. Über ihn wird vor dem Gesetz selbst abgestimmt.'],
  ['Einsatz der Bundeswehr', 'Bewaffnete Einsätze im Ausland brauchen die Zustimmung des Bundestags – die Bundeswehr ist eine Parlamentsarmee. Die Bundesregierung stellt dazu einen Antrag; dieser Beschluss ist verbindlich.'],
  ['Verordnungen und EU-Vorhaben', 'Verordnungen erlässt die Bundesregierung auf Grundlage eines Gesetzes; manche brauchen die Zustimmung des Bundestags. Zu Vorhaben der Europäischen Union kann der Bundestag Stellung nehmen, und die Bundesregierung muss das in den Verhandlungen berücksichtigen.'],
  ['Wahlen', 'Der Bundestag wählt die Bundeskanzlerin oder den Bundeskanzler, sein Präsidium, die Hälfte der Richterinnen und Richter am Bundesverfassungsgericht und die Mitglieder vieler Gremien.'],
  ['Petitionen', 'Alle können sich mit Bitten und Beschwerden an den Bundestag wenden. Der Petitionsausschuss prüft sie; das Plenum entscheidet meist gesammelt über seine Empfehlungen („Sammelübersichten“).'],
  ['Debatten ohne Abstimmung', 'Aktuelle Stunden, Regierungsbefragung, Fragestunde und vereinbarte Debatten stehen auch auf der Tagesordnung. Dort wird diskutiert und gefragt, aber nichts beschlossen.'],
];

const GLOSSARY = [
  ['aktuelle-stunde', 'Aktuelle Stunde', 'Eine kurze Debatte über ein aktuelles Thema, die eine Fraktion verlangen kann. Abgestimmt wird nicht.'],
  ['ausschuss', 'Ausschuss', 'Eine Arbeitsgruppe des Bundestags für ein Fachgebiet, besetzt nach der Stärke der Fraktionen. Bereitet die Entscheidungen des Plenums vor.'],
  ['beratung', 'Beratung, Lesung', 'Die Behandlung eines Themas im Plenum. Gesetzentwürfe haben drei Beratungen, auch Lesungen genannt; abgestimmt wird in der zweiten und dritten.'],
  ['beschlussempfehlung', 'Beschlussempfehlung', 'Die Empfehlung eines Ausschusses an das Plenum: annehmen, ändern oder ablehnen.'],
  ['bundesgesetzblatt', 'Bundesgesetzblatt', 'Das amtliche Blatt, in dem Gesetze verkündet werden. Erst danach können sie in Kraft treten.'],
  ['diskontinuitaet', 'Diskontinuität', 'Was bis zum Ende einer Wahlperiode nicht beschlossen ist, verfällt und muss im neuen Bundestag neu eingebracht werden.'],
  ['drucksache', 'Drucksache', 'Ein offizielles Dokument des Bundestags, etwa ein Gesetzentwurf, Antrag oder eine Beschlussempfehlung. Die Nummer 21/1234 heißt: 21. Wahlperiode, Dokument 1234. Bei uns unter „Quellen“ verlinkt.'],
  ['einspruchsgesetz', 'Einspruchsgesetz', 'Ein Gesetz, gegen das der Bundesrat nur Einspruch einlegen kann. Der Bundestag kann ihn überstimmen.'],
  ['entschliessung', 'Entschließung', 'Eine politische Erklärung des Bundestags, oft zu einem Gesetz. Rechtlich nicht bindend.'],
  ['erledigt', 'Für erledigt erklärt', 'Über eine Vorlage wird nicht mehr in der Sache entschieden, weil sie sich überholt hat.'],
  ['fraktion', 'Fraktion', 'Der Zusammenschluss von Abgeordneten einer Partei (bei CDU und CSU zweier Parteien). Braucht mindestens fünf Prozent der Sitze.'],
  ['hammelsprung', 'Hammelsprung', 'Eine Zählung, wenn das Ergebnis per Handzeichen unklar ist: Alle gehen hinaus und kommen durch die Tür für Ja, Nein oder Enthaltung zurück.'],
  ['koalitionsvertrag', 'Koalitionsvertrag', 'Die Vereinbarung der Regierungsparteien über das, was sie gemeinsam vorhaben. Er liegt neben den Wahlprogrammen in unserer Bibliothek.'],
  ['namentliche-abstimmung', 'Namentliche Abstimmung', 'Jede und jeder Abgeordnete stimmt mit einer Karte mit dem eigenen Namen. So ist für jede Person öffentlich, wie sie gestimmt hat.'],
  ['plenarprotokoll', 'Plenarprotokoll', 'Das wörtliche Protokoll jeder Sitzung. Daraus lesen wir ab, wie die Fraktionen gestimmt haben.'],
  ['plenum', 'Plenum', 'Die Versammlung aller Abgeordneten im Plenarsaal. Nur das Plenum kann für den Bundestag beschließen.'],
  ['schlussabstimmung', 'Schlussabstimmung', 'Die Abstimmung am Ende der dritten Lesung. Mit ihr ist ein Gesetz vom Bundestag beschlossen.'],
  ['tagesordnung', 'Tagesordnung, Tagesordnungspunkt', 'Die Liste dessen, was in einer Sitzung behandelt wird. Jeder Punkt hat eine Nummer, den Tagesordnungspunkt (TOP); Punkte, die erst nachträglich dazukommen, heißen Zusatzpunkte (ZP). Die Uhrzeiten sind geplant – Debatten dauern oft länger oder kürzer.'],
  ['ueberweisung', 'Überweisung', 'Eine Vorlage geht zur Beratung in die Ausschüsse. Eine Entscheidung in der Sache ist das nicht.'],
  ['vermittlungsausschuss', 'Vermittlungsausschuss', 'Je 16 Mitglieder aus Bundestag und Bundesrat, die einen Kompromiss suchen, wenn beide uneins sind.'],
  ['wahlperiode', 'Wahlperiode', 'Die vier Jahre zwischen zwei Bundestagswahlen. Seit 2025 läuft die 21.'],
  ['zustimmungsgesetz', 'Zustimmungsgesetz', 'Ein Gesetz, das nur mit Zustimmung des Bundesrats zustande kommt.'],
];

const and = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} und ${names[names.length - 1]}` : names.join(''));

export function explainerPage(view) {
  const total = 630;
  const coalition = PLENUM.filter((p) => p.coalition);
  const coalitionSeats = coalition.reduce((n, p) => n + p.seats, 0);
  const opposition = PLENUM.filter((p) => !p.coalition);

  const body = html`<div class="narrow explainer">
    <p class="eyebrow">Grundlagen</p>
    <h1>So arbeitet der Bundestag</h1>
    <p class="lede">Erste Lesung, Beschlussempfehlung, Hammelsprung: Im Parlament klingt vieles komplizierter, als es ist. Hier steht in einfachen Worten, wie der Bundestag entscheidet – und woran du erkennst, ob etwas wirklich beschlossen ist.</p>
    <nav class="theme-nav" aria-label="Abschnitte">${SECTIONS.map(([id, label]) => html`<a href="#${id}">${label}</a>`)}</nav>

    <section id="beschlossen" class="explainer-section">
      <h2>Ist das jetzt beschlossen?</h2>
      <p>Das hängt davon ab, worüber abgestimmt wurde. Ein angenommenes Gesetz ist etwas anderes als ein angenommener Antrag. So liest du die Angaben auf unserer Seite:</p>
      <ul class="meanings">${MEANINGS.map(
        (m) => html`<li>
          <div class="meaning-mark">${m.mark()}<span class="meta">${m.kind}</span></div>
          <div><h3>${m.title}</h3><p>${m.text}</p></div>
        </li>`,
      )}</ul>
      <div class="panel confusing">
        <h3>Drei Wörter, die oft verwirren</h3>
        <dl>${CONFUSING.map(([term, text]) => html`<div><dt>${term}</dt><dd>${text}</dd></div>`)}</dl>
      </div>
    </section>

    <section id="gesetz" class="explainer-section">
      <h2>Wie ein Gesetz entsteht</h2>
      <p>Bis ein Gesetz gilt, vergehen meist Monate. Im Bundestag wird es beschlossen – aber der Bundestag ist nicht die letzte Station.</p>
      <ol class="path">${LAW_STEPS.map(
        (s, i) => html`${i === 4 ? html`<li class="path-break" aria-hidden="true">Nach dem Beschluss im Bundestag</li>` : ''}<li class="path-step${s.decisive ? ' decisive' : ''}${s.after ? ' after' : ''}">
          <h3>${s.title}</h3>
          ${s.where ? html`<p class="pills"><span class="pill">${s.where}</span></p>` : ''}
          <p>${s.text}</p>
        </li>`,
      )}</ol>
      <p>Für eine Änderung des Grundgesetzes gilt derselbe Weg mit einer höheren Hürde: Zwei Drittel der Abgeordneten und zwei Drittel der Stimmen im Bundesrat müssen zustimmen.</p>
      <p>Endet die Wahlperiode, bevor ein Entwurf beschlossen ist, verfällt er. Im neuen Bundestag müsste er neu eingebracht werden.</p>
    </section>

    <section id="vorlagen" class="explainer-section">
      <h2>Nicht alles ist ein Gesetz</h2>
      <p>Der Bundestag stimmt über vieles ab, das kein Gesetz ist. Diese Arten von Beschlüssen begegnen dir in unseren Artikeln und in der <a href="/vorschau">Vorschau</a>:</p>
      <dl class="kinds">${KINDS_OF_DECISION.map(([term, text]) => html`<div><dt>${term}</dt><dd>${text}</dd></div>`)}</dl>
    </section>

    <section id="abstimmung" class="explainer-section">
      <h2>Wie abgestimmt wird</h2>
      <h3>Handzeichen, Aufstehen, Hammelsprung</h3>
      <p>Meist fragt die Sitzungsleitung: „Wer stimmt dafür? – Wer stimmt dagegen? – Wer enthält sich?“ Die Abgeordneten heben die Hand; bei der Schlussabstimmung über ein Gesetz stehen sie auf. Das Präsidium stellt fest, welche Seite die Mehrheit hat. Ist es sich nicht einig, folgt der Hammelsprung: Alle verlassen den Saal und kommen durch eine von drei Türen zurück – Ja, Nein oder Enthaltung – und werden dabei gezählt.</p>
      <h3>Namentliche Abstimmung</h3>
      <p>Verlangt es eine Fraktion, wird namentlich abgestimmt: Alle Abgeordneten werfen eine Karte mit ihrem Namen in eine Urne, und hinterher ist für jede Person öffentlich, wie sie gestimmt hat. Bei Handzeichen wird nur festgehalten, wie die Fraktionen insgesamt gestimmt haben. Deshalb steht bei uns „Fraktion stimmte mit Ja“ – und „uneinheitlich“, wenn sie sich nicht einig war.</p>
      <h3>Welche Mehrheit reicht?</h3>
      <ul>
        <li><strong>Meistens die einfache Mehrheit:</strong> mehr Ja- als Nein-Stimmen. Enthaltungen zählen nicht mit; bei Gleichstand ist ein Antrag abgelehnt.</li>
        <li><strong>Die Mehrheit aller Abgeordneten</strong>, also mindestens ${Math.floor(total / 2) + 1} von ${total} Stimmen, braucht es etwa für die Wahl der Bundeskanzlerin oder des Bundeskanzlers.</li>
        <li><strong>Zwei Drittel</strong> der Abgeordneten, also ${Math.ceil((total * 2) / 3)} Stimmen, sind für eine Änderung des Grundgesetzes nötig – und zwei Drittel der Stimmen im Bundesrat.</li>
      </ul>
      <h3>Warum der Saal oft leer ist</h3>
      <p>Der Bundestag ist beschlussfähig, wenn mehr als die Hälfte der Abgeordneten da ist. Geprüft wird das aber nur, wenn eine Fraktion es bezweifelt. Die meiste Arbeit geschieht in Ausschüssen, Arbeitsgruppen und Fraktionen; zu einer Debatte kommen oft vor allem die, die sich mit dem Thema befassen. Zu namentlichen Abstimmungen kommen fast alle.</p>
      <h3>Fraktion und Gewissen</h3>
      <p>Abgeordnete sind laut Grundgesetz an Aufträge und Weisungen nicht gebunden und nur ihrem Gewissen unterworfen. Trotzdem stimmen Fraktionen meist geschlossen ab: Sie verabreden vorher, meist am Dienstag einer Sitzungswoche, wie sie abstimmen. Bei Gewissensfragen wird die Abstimmung oft ausdrücklich freigegeben.</p>
      <h3>Wann der Bundestag tagt</h3>
      <p>Der Bundestag arbeitet in Sitzungswochen, rund zwanzig im Jahr. Montag und Dienstag treffen sich vor allem die Fraktionen und ihre Arbeitsgruppen, am Mittwochvormittag die Ausschüsse, und von Mittwochmittag bis Freitag tagt das Plenum. Was dort behandelt wird, steht in der Tagesordnung – und in unserer <a href="/vorschau">Vorschau</a>.</p>
    </section>

    <section id="wer" class="explainer-section">
      <h2>Wer mitentscheidet</h2>
      <dl class="kinds">
        <div><dt>Der Bundestag</dt><dd>${total} Abgeordnete, alle vier Jahre gewählt. Er beschließt die Gesetze und den Bundeshaushalt, wählt die Bundeskanzlerin oder den Bundeskanzler und kontrolliert die Regierung. Er ist das einzige Verfassungsorgan des Bundes, das direkt vom Volk gewählt wird.</dd></div>
        <div><dt>Die Fraktionen</dt><dd>Seit der Wahl 2025 sitzen fünf Fraktionen im Bundestag, von links nach rechts: ${and(PLENUM.map((p) => `${p.party} (${p.seats})`))}, dazu ein Abgeordneter des SSW.</dd></div>
        <div><dt>Koalition und Opposition</dt><dd>Die Regierung stützt sich auf eine Mehrheit im Bundestag. Die Koalition bilden ${and(coalition.map((p) => p.short))} mit zusammen ${coalitionSeats} von ${total} Sitzen. Deshalb gehen ihre Vorhaben meist durch und die Anträge der Opposition meist nicht. Die Opposition – ${and(opposition.map((p) => p.short))} – kontrolliert die Regierung, kritisiert und zeigt Alternativen.</dd></div>
        <div><dt>Die Bundesregierung</dt><dd>Die Bundeskanzlerin oder der Bundeskanzler und die Ministerinnen und Minister. Sie bringt die meisten Gesetzentwürfe ein und setzt die Gesetze um.</dd></div>
        <div><dt>Der Bundesrat</dt><dd>Die Vertretung der 16 Länder, besetzt mit Mitgliedern der Landesregierungen. Er wirkt an jedem Bundesgesetz mit, und viele brauchen seine Zustimmung.</dd></div>
        <div><dt>Der Bundespräsident</dt><dd>Das Staatsoberhaupt. Er unterschreibt die Gesetze und prüft dabei, ob sie verfassungsgemäß zustande gekommen sind.</dd></div>
        <div><dt>Das Bundesverfassungsgericht</dt><dd>Prüft auf Antrag, ob ein Gesetz mit dem Grundgesetz vereinbar ist, und kann es für nichtig erklären. Seine Richterinnen und Richter wählen je zur Hälfte Bundestag und Bundesrat.</dd></div>
        <div><dt>Du</dt><dd>Du wählst den Bundestag, kannst Petitionen einreichen, deinen Abgeordneten schreiben und Sitzungen besuchen. Ideen dazu stehen unter <a href="/mitmachen#demokratie">Mitmachen</a>.</dd></div>
      </dl>
    </section>

    <section id="lexikon" class="explainer-section">
      <h2>Kleines Lexikon</h2>
      <dl class="glossary">${GLOSSARY.map(([id, term, text]) => html`<div id="lexikon-${id}"><dt>${term}</dt><dd>${text}</dd></div>`)}</dl>
    </section>

    <aside class="panel disclaimer">
      <p><strong>Grundlage</strong> sind das Grundgesetz und die Geschäftsordnung des Bundestags. Wir haben vereinfacht, wo es dem Verständnis hilft; Ausnahmen gibt es fast überall. Ausführlicher: <a href="https://www.bundestag.de" target="_blank" rel="noopener">Deutscher Bundestag ↗</a> · <a href="https://www.bpb.de" target="_blank" rel="noopener">Bundeszentrale für politische Bildung ↗</a> · <a href="https://www.gesetze-im-internet.de/gg/" target="_blank" rel="noopener">Grundgesetz im Wortlaut ↗</a></p>
    </aside>
  </div>`;

  return layout(view, {
    title: 'So arbeitet der Bundestag – einfach erklärt',
    description: 'Wie ein Gesetz entsteht, was erste Lesung, Beschlussempfehlung und Antrag bedeuten, wie der Bundestag abstimmt und woran du erkennst, ob etwas wirklich beschlossen ist – in einfachen Worten.',
    body,
    canonical: EXPLAINER_PATH,
  });
}
