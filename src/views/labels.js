export const ALIGNMENT_LABEL = {
  entspricht: 'Entspricht dem Programm',
  teilweise: 'Teilweise im Programm',
  widerspricht: 'Widerspricht dem Programm',
  nicht_thematisiert: 'Im Programm nicht thematisiert',
};

export const ALIGNMENT_SHORT = {
  entspricht: 'entspricht',
  teilweise: 'teilweise',
  widerspricht: 'widerspricht',
  nicht_thematisiert: 'nicht thematisiert',
};

export const VOTE_LABEL = {
  'dafür': 'Fraktion stimmte mit Ja',
  dagegen: 'Fraktion stimmte mit Nein',
  enthalten: 'Fraktion enthielt sich',
  gespalten: 'Fraktion stimmte uneinheitlich',
  unbekannt: 'Abstimmung der Fraktion unbekannt',
  nicht_anwendbar: '',
};

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

// Short column headings for the overview table.
export function shortParty(party, kind) {
  const p = String(party || '').toLowerCase();
  if (kind === 'koalitionsvertrag' || (/spd/.test(p) && /cdu|csu/.test(p))) return 'Koalition';
  if (/cdu|csu|union/.test(p)) return 'Union';
  if (/spd/.test(p)) return 'SPD';
  if (/grün|gruen|bündnis/.test(p)) return 'Grüne';
  if (/linke/.test(p)) return 'Linke';
  if (/afd/.test(p)) return 'AfD';
  if (/fdp/.test(p)) return 'FDP';
  if (/bsw|wagenknecht/.test(p)) return 'BSW';
  if (/ssw/.test(p)) return 'SSW';
  return String(party || '').slice(0, 10);
}

// CSS class suffixes without umlauts.
export const cls = (s) => String(s || '').replace(/ü/g, 'ue').replace(/[^a-z_]/gi, '');
