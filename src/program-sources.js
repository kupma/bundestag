// The standard library: the election programmes of every party in the 21st
// Bundestag (election of 23 February 2025) and the coalition agreement. The app
// downloads these by itself – nobody has to search for them.
//
// Addresses are the parties' own PDFs. Parties move files around, so every
// download is checked (a real PDF, long enough to be the full version, and it
// mentions the expected title) before it is imported. If none of the listed
// addresses works, the app asks Claude's web search for the current file –
// restricted to the party's own domains – and checks that the same way.
//
// `key` is stable forever: it is how the app recognises an entry it has
// already imported. `minPages` is set low enough to allow for PDFs laid out
// as double-page spreads, and high enough to turn away the short versions.

export const DEFAULT_PROGRAMS = [
  {
    key: 'btw2025-afd',
    party: 'AfD',
    title: 'Zeit für Deutschland',
    kind: 'wahlprogramm',
    election: 'Bundestagswahl 2025',
    urls: ['https://www.afd.de/wp-content/uploads/2025/02/AfD_Bundestagswahlprogramm2025_web.pdf'],
    domains: ['afd.de'],
    expect: ['zeit für deutschland', 'alternative für deutschland'],
    minPages: 60,
  },
  {
    key: 'btw2025-gruene',
    party: 'Bündnis 90/Die Grünen',
    title: 'Zusammen wachsen',
    kind: 'wahlprogramm',
    election: 'Bundestagswahl 2025',
    urls: ['https://cms.gruene.de/uploads/assets/Regierungsprogramm_DIGITAL_DINA5.pdf'],
    domains: ['gruene.de'],
    expect: ['zusammen wachsen', 'regierungsprogramm'],
    minPages: 60,
  },
  {
    key: 'btw2025-cdu-csu',
    party: 'CDU/CSU',
    title: 'Politikwechsel für Deutschland',
    kind: 'wahlprogramm',
    election: 'Bundestagswahl 2025',
    urls: ['https://www.cdu.de/app/uploads/2025/01/km_btw_2025_wahlprogramm_langfassung_ansicht.pdf'],
    domains: ['cdu.de', 'csu.de'],
    expect: ['politikwechsel'],
    minPages: 30,
  },
  {
    key: 'btw2025-linke',
    party: 'Die Linke',
    title: 'Alle wollen regieren. Wir wollen verändern.',
    kind: 'wahlprogramm',
    election: 'Bundestagswahl 2025',
    urls: ['https://www.die-linke.de/fileadmin/user_upload/Wahlprogramm_Langfassung_Linke-BTW25_01.pdf'],
    domains: ['die-linke.de'],
    expect: ['wir wollen verändern', 'die linke'],
    minPages: 25,
  },
  {
    key: 'btw2025-spd',
    party: 'SPD',
    title: 'Mehr für Dich. Besser für Deutschland.',
    kind: 'wahlprogramm',
    election: 'Bundestagswahl 2025',
    urls: [
      'https://www.spd.de/fileadmin/Dokumente/Beschluesse/Programm/2025_SPD_Regierungsprogramm.pdf',
      'https://parteitag.spd.de/fileadmin/parteitag/Dokumente/Beschluesse_2025/2025_SPD_Regierungsprogramm.pdf',
    ],
    domains: ['spd.de'],
    expect: ['mehr für dich', 'regierungsprogramm'],
    minPages: 30,
  },
  {
    key: 'koav-2025',
    party: 'CDU, CSU und SPD',
    title: 'Verantwortung für Deutschland',
    kind: 'koalitionsvertrag',
    election: 'Koalitionsvertrag der 21. Wahlperiode',
    urls: [
      'https://www.cdu.de/app/uploads/2025/04/KoaV-2025-Gesamt-final-0424.pdf',
      'https://www.spd.de/fileadmin/Dokumente/Koalitionsvertrag2025_bf.pdf',
      'https://www.csu.de/common/csu/Koalitionsvertrag_2025_Verantwortung_fuer_Deutschland.pdf',
    ],
    domains: ['cdu.de', 'csu.de', 'spd.de', 'bundesregierung.de'],
    expect: ['koalitionsvertrag', 'verantwortung für deutschland'],
    minPages: 60,
  },
];

// Versions that are not the full programme: short versions, easy-language
// editions, drafts and motions. Web search results matching these are skipped.
export const NOT_THE_FULL_VERSION = /kurz|leichte|einfach|[-_]ls[-_.]|[-_]lp[-_]|entwurf|leitantrag|antrag|english|englisch|argumentation|flyer|plakat/i;
