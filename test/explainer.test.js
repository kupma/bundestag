import assert from 'node:assert/strict';
import test from 'node:test';

import { decisionMeaning, decisionTags, finalReading, procedureKind } from '../src/views/explainer.js';

test('what a decision was about, from Vorgangstyp and title', () => {
  assert.equal(procedureKind({ vorgangstyp: 'Gesetzgebung', title: 'Gesetz zur Verlängerung der Mietpreisbremse' }), 'gesetz');
  assert.equal(procedureKind({ vorgangstyp: 'Antrag', title: 'Kostenloses Mittagessen an allen Schulen' }), 'antrag');
  assert.equal(procedureKind({ vorgangstyp: 'Entschließungsantrag', title: 'zum Haushalt' }), 'entschliessung');
  assert.equal(
    procedureKind({ vorgangstyp: 'Antrag', title: 'Fortsetzung der Beteiligung bewaffneter deutscher Streitkräfte an der Operation EUNAVFOR ASPIDES' }),
    'einsatz',
  );
  assert.equal(procedureKind({ vorgangstyp: 'Antrag', title: 'Die Bundeswehr besser ausstatten' }), 'antrag', 'a motion about the armed forces is no mandate');
  assert.equal(procedureKind({ vorgangstyp: 'Petition', title: 'Sammelübersicht 42 zu Petitionen' }), 'petition');
  assert.equal(procedureKind({ vorgangstyp: 'Wahl im BT', title: 'Wahl der Mitglieder des Parlamentarischen Kontrollgremiums' }), 'wahl');
  assert.equal(procedureKind({ vorgangstyp: 'Wahlprüfung', title: 'Wahlprüfungsangelegenheit' }), 'sonstiges');
  assert.equal(procedureKind({ vorgangstyp: 'Rechtsverordnung', title: 'Verordnung über …' }), 'verordnung');
  assert.equal(procedureKind({ vorgangstyp: 'EU-Vorlage', title: 'Vorschlag für eine Richtlinie' }), 'eu');
  assert.equal(procedureKind({}), 'sonstiges');
});

test('a bill is passed only with its final reading', () => {
  assert.equal(finalReading(['2. Beratung', '3. Beratung']), true);
  assert.equal(finalReading(['3. Beratung']), true, 'the second reading was on an earlier day');
  assert.equal(finalReading(['Beratung']), true, 'e.g. after the mediation committee');
  assert.equal(finalReading(undefined), true, 'articles from before the positions were stored');
  assert.equal(finalReading(['2. Beratung']), false, 'the budget week: second reading only');
});

test('what a result means, in words', () => {
  const law = { vorgangstyp: 'Gesetzgebung', title: 'Gesetz zur Verlängerung der Mietpreisbremse' };
  const passed = decisionMeaning({ ...law, result: 'angenommen', positions: ['2. Beratung', '3. Beratung'] });
  assert.equal(passed.path, true);
  assert.match(passed.text, /beschlossen\. In Kraft ist es damit noch nicht/);
  assert.deepEqual(decisionTags({ ...law, result: 'angenommen' }), ['Gesetz', 'Als Nächstes: Bundesrat']);

  const second = decisionMeaning({ ...law, result: 'angenommen', positions: ['2. Beratung'] });
  assert.ok(!second.path);
  assert.match(second.text, /in zweiter Lesung angenommen/);
  assert.deepEqual(decisionTags({ ...law, result: 'angenommen', positions: ['2. Beratung'] }), ['Gesetz']);

  assert.match(decisionMeaning({ ...law, result: 'abgelehnt' }).text, /gescheitert/);
  assert.match(decisionMeaning({ vorgangstyp: 'Antrag', title: 'x', result: 'angenommen' }).text, /Ein Antrag ist kein Gesetz/);
  assert.match(decisionMeaning({ vorgangstyp: 'Antrag', title: 'x', result: 'abgelehnt' }).text, /vom Tisch/);
  assert.match(decisionMeaning({ vorgangstyp: 'Antrag', title: 'x', result: 'erledigt' }).text, /für erledigt erklärt/);
  assert.deepEqual(decisionTags({ vorgangstyp: 'Unbekannt', title: 'x', result: 'sonstiges' }), ['Unbekannt'], 'unknown kinds keep DIP’s word');
});
