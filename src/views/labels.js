export const ALIGNMENT_LABEL = {
  entspricht: 'Entspricht dem Programm',
  teilweise: 'Teilweise im Programm',
  widerspricht: 'Widerspricht dem Programm',
  nicht_thematisiert: 'Im Programm nicht thematisiert',
};

export const VOTE_LABEL = {
  'dafür': 'Fraktion: Ja',
  dagegen: 'Fraktion: Nein',
  enthalten: 'Fraktion: Enthaltung',
  gespalten: 'Fraktion: uneinheitlich',
  unbekannt: 'Abstimmung unbekannt',
  nicht_anwendbar: '',
};

export const RESULT_LABEL = {
  angenommen: 'Angenommen',
  abgelehnt: 'Abgelehnt',
  erledigt: 'Für erledigt erklärt',
  sonstiges: 'Beschlossen',
};

// CSS class suffixes without umlauts.
export const cls = (s) => String(s || '').replace(/ü/g, 'ue').replace(/[^a-z_]/gi, '');
