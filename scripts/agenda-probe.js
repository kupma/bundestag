// Shows what the Bundestag's agenda returns for the coming weeks and which
// items this app counts as votes – without touching the database. The first
// thing to run when the preview (/vorschau) stays empty:
//
//   npm run agenda:probe
//   npm run agenda:probe -- 2026-10-05 --raw

import { createAgendaClient, isoWeek, parseWeek } from '../src/agenda.js';
import { loadConfig } from '../src/config.js';
import { berlinDate } from '../src/text.js';
import { AGENDA_KIND_LABEL } from '../src/views/labels.js';

const argv = process.argv.slice(2);
const from = argv.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) || berlinDate();
const config = loadConfig();
const agenda = createAgendaClient({ baseUrl: config.agendaBaseUrl });

let cursor = isoWeek(from);
for (let i = 0; i < 4; i++) {
  const data = await agenda.week(cursor.year, cursor.week);
  console.log(`\nKW ${cursor.week}/${cursor.year}: ${data ? `${data.conferences.length} Sitzungstage, weiter mit ${JSON.stringify(data.next)}` : 'keine Seite (404)'}`);
  if (data && argv.includes('--raw') && data.conferences[0]) console.log(JSON.stringify(data.conferences[0].rows.slice(0, 3), null, 2));
  for (const day of data ? parseWeek(data) : []) {
    console.log(`\n${day.date} · ${day.session}. Sitzung · ${day.items.length} Punkte`);
    for (const item of day.items) {
      console.log(`  ${item.vote ? '●' : item.kind === 'antrag' ? '◐' : '○'} ${item.time.padEnd(5)} ${String(item.top).padEnd(8)} ${item.title.slice(0, 70)}`);
      if (item.kind !== 'sonstiges') console.log(`${' '.repeat(18)}${AGENDA_KIND_LABEL[item.kind]}${item.drucksachen.length ? ` · ${item.drucksachen.map((d) => d.nummer).join(', ')}` : ''}`);
    }
  }
  if (!data || !data.next) break;
  cursor = data.next;
}
