// The parliamentary groups of the 21st Bundestag, left to right as seen from
// the President – the order in which the site lists them everywhere. The
// landing page draws the hall from it, the articles record each group's vote
// against it, and the explainer counts the coalition's majority.

export const PLENUM = [
  { party: 'Die Linke', short: 'Linke', seats: 64 },
  { party: 'Bündnis 90/Die Grünen', short: 'Grüne', seats: 85 },
  { party: 'SPD', short: 'SPD', seats: 120, coalition: true },
  { party: 'CDU/CSU', short: 'CDU/CSU', seats: 208, coalition: true },
  { party: 'AfD', short: 'AfD', seats: 152 },
];

export const FRAKTIONEN = PLENUM.map((p) => p.short);

// A group's name as the protocol or an older article writes it ("BÜNDNIS
// 90/DIE GRÜNEN", "Die Linke", "CDU/CSU und SPD") to its short name, or ''.
export function fraktionOf(name) {
  const p = String(name || '').toLowerCase();
  if (/koalition|cdu.*spd|spd.*cdu/.test(p)) return '';
  if (/cdu|csu|union/.test(p)) return 'CDU/CSU';
  if (/spd/.test(p)) return 'SPD';
  if (/grüne|gruene|bündnis/.test(p)) return 'Grüne';
  if (/afd/.test(p)) return 'AfD';
  if (/linke/.test(p)) return 'Linke';
  return '';
}

// The small identification dot: one class per party, the same size for all.
export function partyClass(party) {
  const p = String(party || '').toLowerCase();
  if (/koalition|cdu.*spd|spd.*cdu/.test(p)) return 'p-koalition';
  if (/cdu|csu|union/.test(p)) return 'p-union';
  if (/spd/.test(p)) return 'p-spd';
  if (/grüne|gruene|bündnis/.test(p)) return 'p-gruene';
  if (/afd/.test(p)) return 'p-afd';
  if (/linke/.test(p)) return 'p-linke';
  if (/fdp/.test(p)) return 'p-fdp';
  if (/bsw|wagenknecht/.test(p)) return 'p-bsw';
  if (/ssw/.test(p)) return 'p-ssw';
  return 'p-other';
}
