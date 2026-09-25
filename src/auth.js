// Accounts: password hashing, sessions, and the one-time tokens behind email
// confirmation and password reset. No third-party auth library: Node's crypto
// has scrypt, and the rest is a handful of queries.

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'sid';

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(password).normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(String(password).normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(actual, expected);
}

// A token is handed out once (cookie, email link) and only its hash is stored,
// so a leaked database dump holds no usable session or reset link.
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateRegistration({ email, displayName, password }) {
  const errors = [];
  const e = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 254) errors.push('Bitte eine gültige E-Mail-Adresse angeben.');
  const name = String(displayName || '').trim();
  if (name.length < 2 || name.length > 40) errors.push('Der Anzeigename muss 2 bis 40 Zeichen lang sein.');
  if (/[<>]/.test(name)) errors.push('Der Anzeigename darf keine spitzen Klammern enthalten.');
  const pw = String(password || '');
  if (pw.length < 10) errors.push('Das Passwort muss mindestens 10 Zeichen lang sein.');
  if (pw.length > 200) errors.push('Das Passwort ist zu lang.');
  return { errors, email: e, displayName: name };
}

export async function createSession(db, userId) {
  const token = randomToken();
  await db.query(
    `insert into sessions (token_hash, user_id, expires_at) values ($1, $2, now() + ($3 || ' days')::interval)`,
    [hashToken(token), userId, String(SESSION_DAYS)],
  );
  return token;
}

export async function sessionUser(db, token) {
  if (!token) return null;
  return db.one(
    `select u.id, u.email, u.display_name, u.is_admin, u.email_verified_at, u.newsletter, u.unsubscribe_token
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
}

export async function destroySession(db, token) {
  if (token) await db.query('delete from sessions where token_hash = $1', [hashToken(token)]);
}

export async function issueUserToken(db, userId, purpose, hours) {
  const token = randomToken();
  await db.query(
    `insert into user_tokens (token_hash, user_id, purpose, expires_at) values ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
    [hashToken(token), userId, purpose, String(hours)],
  );
  return token;
}

// Marks the token used and returns its user id, or null when it is unknown,
// expired, already used, or meant for something else.
export async function consumeUserToken(db, token, purpose) {
  if (!token) return null;
  const row = await db.one(
    `update user_tokens set used_at = now()
      where token_hash = $1 and purpose = $2 and used_at is null and expires_at > now()
      returning user_id`,
    [hashToken(token), purpose],
  );
  return row ? row.user_id : null;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export function sessionCookie(token, { secure, maxAgeDays = SESSION_DAYS } = {}) {
  const attrs = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeDays * 86400}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearSessionCookie({ secure } = {}) {
  return sessionCookie('', { secure, maxAgeDays: 0 });
}
