// How the parliamentary groups voted is in the plenary protocol, in the
// President's words after each vote: "Der Gesetzentwurf ist damit mit den
// Stimmen der Fraktionen der CDU/CSU und SPD gegen die Stimmen der Fraktion der
// AfD bei Enthaltung ... angenommen." DIP's structured data does not carry it,
// so this finds those sentences near the places where the protocol names the
// decision's Drucksachen, and the model reads them.

const VOTE_RE =
  /mit den Stimmen|gegen die Stimmen|bei Enthaltung|einstimmig|(?:ist|sind) (?:damit|somit)?\s*(?:[\wäöüß/ ]{0,70})?(?:angenommen|abgelehnt)|abgegebene[n]? Stimmen|Ja-Stimmen|Nein-Stimmen|mit Ja gestimmt|mit Nein gestimmt|Enthaltungen/i;

// The next agenda item starts here; vote sentences after it belong to
// something else.
const BOUNDARY_RE = /\b(?:Tagesordnungspunkt|Zusatzpunkt|Ich rufe (?:jetzt |nun )?(?:den |die )?(?:Tagesordnungspunkt|Zusatzpunkt|Punkt))\b/g;

function sentencesOf(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[\p{Lu}„–(])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function findVotePassages(protocolText, drucksachen, { window = 3500, maxChars = 1800 } = {}) {
  const text = String(protocolText || '').replace(/\s+/g, ' ');
  if (!text || !drucksachen || !drucksachen.length) return '';
  const found = [];
  const seen = new Set();

  for (const nummer of drucksachen) {
    const escaped = nummer.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace('\\/', '\\s?\\/\\s?');
    const re = new RegExp(`(?<![\\d/])${escaped}(?![\\d])`, 'g');
    let m;
    while ((m = re.exec(text))) {
      let slice = text.slice(m.index, m.index + window);
      BOUNDARY_RE.lastIndex = 0;
      let b;
      while ((b = BOUNDARY_RE.exec(slice))) {
        if (b.index > 200) {
          slice = slice.slice(0, b.index);
          break;
        }
      }
      for (const s of sentencesOf(slice)) {
        if (!VOTE_RE.test(s) || s.length > 900) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        found.push(s);
      }
    }
  }

  let out = '';
  for (const s of found) {
    if (out.length + s.length + 1 > maxChars) break;
    out += (out ? '\n' : '') + s;
  }
  return out;
}
