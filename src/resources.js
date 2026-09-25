// The only links the article pipeline may point readers to. Claude picks a key
// from this list (the schema only allows these keys), so a generated article
// can never contain an invented address. URLs are resolved when the page is
// rendered, so fixing one here fixes every article that uses it.

export const RESOURCES = {
  abgeordnete: { label: 'Deine Abgeordneten im Bundestag', url: 'https://www.bundestag.de/abgeordnete' },
  abgeordnetenwatch: { label: 'Abgeordneten öffentlich Fragen stellen', url: 'https://www.abgeordnetenwatch.de' },
  petition: { label: 'Petition an den Bundestag', url: 'https://epetitionen.bundestag.de' },
  bundestag_besuch: { label: 'Den Bundestag besuchen', url: 'https://www.bundestag.de/besuche' },
  dip: { label: 'Bundestagsdokumente im Original', url: 'https://dip.bundestag.de' },
  gesetze: { label: 'Gesetze im Wortlaut', url: 'https://www.gesetze-im-internet.de' },
  bpb: { label: 'Bundeszentrale für politische Bildung', url: 'https://www.bpb.de' },
  verbraucherzentrale: { label: 'Verbraucherzentrale', url: 'https://www.verbraucherzentrale.de' },
  lebensmittelklarheit: { label: 'Lebensmittel-Kennzeichnung verstehen', url: 'https://www.lebensmittelklarheit.de' },
  zu_gut_fuer_die_tonne: { label: 'Weniger Lebensmittel verschwenden', url: 'https://www.zugutfuerdietonne.de' },
  mieterbund: { label: 'Mietervereine vor Ort', url: 'https://www.mieterbund.de' },
  freiwilligenagenturen: { label: 'Ehrenamt in deiner Nähe', url: 'https://www.bagfa.de' },
  tafel: { label: 'Bei der Tafel helfen', url: 'https://www.tafel.de' },
  blutspende: { label: 'Blutspende-Termine', url: 'https://www.drk-blutspende.de' },
  dzi: { label: 'Seriös spenden', url: 'https://www.dzi.de' },
  mitmachen_gelassen: { label: 'Gelassen informiert bleiben', url: '/mitmachen#gelassen' },
  mitmachen_einkaufen: { label: 'Einkaufen mit Wirkung', url: '/mitmachen#einkaufen' },
  mitmachen_demokratie: { label: 'Demokratie im Alltag', url: '/mitmachen#demokratie' },
  mitmachen_miteinander: { label: 'Miteinander', url: '/mitmachen#miteinander' },
};

export const RESOURCE_KEYS = Object.keys(RESOURCES);

export const LEVELS = {
  alltag: 'Für dich',
  gemeinsam: 'Mit anderen',
  politik: 'In der Politik',
};

export const LEVEL_KEYS = Object.keys(LEVELS);

export const isExternal = (url) => /^https?:\/\//.test(url);
