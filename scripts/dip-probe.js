// Shows what DIP returns for a date range and which decisions this app makes
// of it – without touching the database. The first thing to run with a new
// DIP_API_KEY:
//
//   DIP_API_KEY=… npm run dip:probe -- 2026-09-24
//   DIP_API_KEY=… npm run dip:probe -- 2026-09-22 2026-09-26 --raw

import { loadConfig } from '../src/config.js';
import { createDipClient, extractDecisions } from '../src/dip.js';
import { addDays, berlinDate } from '../src/text.js';

const argv = process.argv.slice(2);
const dates = argv.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
const start = dates[0] || addDays(berlinDate(), -7);
const end = dates[1] || dates[0] || berlinDate();

const config = loadConfig();
if (!config.dipApiKey) {
  console.error('DIP_API_KEY fehlt. Den öffentlichen Schlüssel gibt es unter https://dip.bundestag.de/über-dip/hilfe/api');
  process.exit(1);
}
const dip = createDipClient({ apiKey: config.dipApiKey, baseUrl: config.dipBaseUrl });

const positions = await dip.positions(start, end);
console.log(`${start} bis ${end}: ${positions.length} Vorgangspositionen`);
const withVotes = positions.filter((p) => (p.beschlussfassung || []).length);
console.log(`davon mit Beschlussfassung: ${withVotes.length}`);
if (argv.includes('--raw') && withVotes[0]) console.log(JSON.stringify(withVotes[0], null, 2));

const decisions = extractDecisions(positions);
console.log(`\n${decisions.length} Beschlüsse:`);
for (const d of decisions.sort((a, b) => a.date.localeCompare(b.date) || b.importance - a.importance)) {
  console.log(`${d.date}  [${String(d.importance).padStart(4)}]  ${d.outcome.padEnd(10)}  ${d.vorgangstyp.padEnd(14)}  ${d.title.slice(0, 90)}`);
  console.log(`            Drucksachen: ${d.drucksachen.join(', ') || '–'} · Protokoll: ${d.protocol ? d.protocol.dokumentnummer : '–'}`);
}

const byDate = [...new Set(decisions.map((d) => d.date))];
for (const date of byDate.slice(-1)) {
  const first = decisions.find((d) => d.date === date);
  try {
    const protocol = await dip.protocolText(date, first.protocol && first.protocol.dokumentnummer);
    console.log(`\nPlenarprotokoll ${date}: ${protocol ? `${protocol.dokumentnummer}, ${String(protocol.text || '').length} Zeichen Text` : 'noch nicht verfügbar'}`);
  } catch (err) {
    console.log(`\nPlenarprotokoll ${date}: ${err.message}`);
  }
}
