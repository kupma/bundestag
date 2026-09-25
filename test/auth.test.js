import assert from 'node:assert/strict';
import test from 'node:test';

import { consumeUserToken, createSession, hashPassword, issueUserToken, parseCookies, sessionCookie, sessionUser, validateRegistration, verifyPassword } from '../src/auth.js';
import { createLimiter } from '../src/ratelimit.js';
import { makeDb } from './helpers.js';

test('passwords hash with a salt and verify', async () => {
  const a = await hashPassword('korrekt pferd batterie');
  const b = await hashPassword('korrekt pferd batterie');
  assert.notEqual(a, b);
  assert.ok(a.startsWith('scrypt$'));
  assert.equal(await verifyPassword('korrekt pferd batterie', a), true);
  assert.equal(await verifyPassword('falsch', a), false);
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('registration validation', () => {
  assert.deepEqual(validateRegistration({ email: ' Ana@Example.DE ', displayName: 'Ana', password: '0123456789' }), { errors: [], email: 'ana@example.de', displayName: 'Ana' });
  const bad = validateRegistration({ email: 'nope', displayName: '<b>', password: 'short' });
  assert.equal(bad.errors.length, 3, 'email, angle brackets, password');
});

test('sessions and one-time tokens', async () => {
  const db = await makeDb();
  const user = await db.one(`insert into users (email, display_name, password_hash, unsubscribe_token) values ('a@b.de', 'A', 'x', 'u1') returning id`);
  const token = await createSession(db, user.id);
  assert.equal((await sessionUser(db, token)).email, 'a@b.de');
  assert.equal(await sessionUser(db, 'wrong'), null);
  assert.equal(await sessionUser(db, ''), null);

  const verify = await issueUserToken(db, user.id, 'verify', 1);
  assert.equal(await consumeUserToken(db, verify, 'reset'), null, 'wrong purpose');
  assert.equal(await consumeUserToken(db, verify, 'verify'), user.id);
  assert.equal(await consumeUserToken(db, verify, 'verify'), null, 'only once');

  const expired = await issueUserToken(db, user.id, 'reset', -1);
  assert.equal(await consumeUserToken(db, expired, 'reset'), null);
  await db.close();
});

test('cookies', () => {
  assert.deepEqual(parseCookies('sid=abc; other=x%20y; broken'), { sid: 'abc', other: 'x y' });
  assert.match(sessionCookie('t', { secure: true }), /^sid=t; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
});

test('rate limiter', () => {
  const l = createLimiter({ windowMs: 1000, max: 2 });
  assert.equal(l.hit('k', 0), true);
  assert.equal(l.hit('k', 10), true);
  assert.equal(l.hit('k', 20), false);
  assert.equal(l.hit('k', 1015), true, 'window slides');
});
