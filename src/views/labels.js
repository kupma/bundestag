// How a parliamentary group voted, in a word, and in the order the page
// groups them.
export const VOTE_LABEL = {
  'dafür': 'Ja',
  dagegen: 'Nein',
  enthalten: 'Enthaltung',
  gespalten: 'uneinheitlich',
  unbekannt: 'unbekannt',
};
export const VOTE_ORDER = ['dafür', 'dagegen', 'enthalten', 'gespalten', 'unbekannt'];

export const RESULT_LABEL = {
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  erledigt: 'Für erledigt erklärt',
  sonstiges: 'Beschlossen',
};

// What an agenda item announces (src/agenda.js), for the preview.
export const AGENDA_KIND_LABEL = {
  gesetz: 'Abstimmung über ein Gesetz',
  beschlussempfehlung: 'Abstimmung über eine Beschlussempfehlung',
  abschliessend: 'Abstimmungen ohne Aussprache',
  wahl: 'Wahl im Plenum',
  antrag: 'Antrag – meist Überweisung, Abstimmung möglich',
  ueberweisung: 'Erste Lesung – Überweisung in die Ausschüsse',
  sonstiges: '',
};

// The same, for one part of an item ("a) …, b) …").
export const AGENDA_PART_LABEL = {
  gesetz: 'Gesetz',
  beschlussempfehlung: 'Beschlussempfehlung',
  wahl: 'Wahl',
  antrag: 'Antrag',
  ueberweisung: 'Erste Lesung',
  sonstiges: '',
};

export { PLENUM } from '../plenum.js';

// CSS class suffixes without umlauts.
export const cls = (s) => String(s || '').replace(/ü/g, 'ue').replace(/[^a-z_]/gi, '');
