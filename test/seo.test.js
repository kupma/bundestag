import assert from 'node:assert/strict';
import test from 'node:test';

import { fakeMailer, makeConfig, makeDb, startApp } from './helpers.js';

test('the Railway address and www. lead to the one real address', async () => {
  const db = await makeDb();
  const config = makeConfig({ baseUrl: 'https://wahlwort.de', canonicalHost: 'wahlwort.de', seo: { googleVerification: 'abc123', bingVerification: '', indexNowKey: 'key-12345678' } });
  const app = await startApp({ db, config, mailer: fakeMailer() });
  // Railway's proxy names the address that was asked for in X-Forwarded-Host.
  const get = (path, host) => fetch(app.base + path, { headers: { 'X-Forwarded-Host': host }, redirect: 'manual' });
  try {
    const railway = await get('/archiv?x=1', 'bundestag-production.up.railway.app');
    assert.equal(railway.status, 301);
    assert.equal(railway.headers.get('location'), 'https://wahlwort.de/archiv?x=1');
    assert.equal((await get('/', 'www.wahlwort.de')).headers.get('location'), 'https://wahlwort.de/');
    assert.equal((await get('/healthz', 'bundestag-production.up.railway.app')).status, 200, 'health checks are answered where they are asked');

    const home = await get('/', 'wahlwort.de');
    assert.equal(home.status, 200);
    assert.match(await home.text(), /<meta name="google-site-verification" content="abc123">/);
    assert.equal(await (await get('/key-12345678.txt', 'wahlwort.de')).text(), 'key-12345678');
  } finally {
    await app.close();
    await db.close();
  }
});
