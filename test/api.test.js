const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

// Each run gets its own Postgres schema, so tests never touch real data and
// can't see each other's rows. Set TEST_DATABASE_URL to a reachable Postgres.
const schema = `test_${crypto.randomBytes(4).toString('hex')}`;
const baseUrl = process.env.TEST_DATABASE_URL || 'postgres://postgres:test@localhost:5433/radiocalico';
process.env.DATABASE_URL = baseUrl + (baseUrl.includes('?') ? '&' : '?') + `options=-c%20search_path%3D${schema}`;

const { Pool } = require('pg');
const admin = new Pool({ connectionString: baseUrl });

let app;
let pool;
let server;
let base;

// The app is required only after the schema exists, because db.js creates its table on import.
before(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  ({ app, pool } = require('../server'));
  await require('../db').ready;
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
  await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  await admin.end();
});

test('GET /api/health reports ok', async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('POST /api/users creates a user and GET lists it', async () => {
  const res = await fetch(`${base}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ada', email: 'ada@example.com' }),
  });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.name, 'Ada');
  assert.equal(created.email, 'ada@example.com');
  assert.ok(created.id);
  assert.ok(created.created_at);

  const list = await (await fetch(`${base}/api/users`)).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].email, 'ada@example.com');
});

test('POST /api/users rejects a missing name or email', async () => {
  for (const body of [{ name: 'No Email' }, { email: 'noname@example.com' }, {}]) {
    const res = await fetch(`${base}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'name and email are required' });
  }
});

test('POST /api/users rejects a duplicate email', async () => {
  const res = await fetch(`${base}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ada Again', email: 'ada@example.com' }),
  });
  assert.equal(res.status, 500);
});

test('static player assets are served from public/', async () => {
  const page = await (await fetch(`${base}/`)).text();
  assert.match(page, /style\.css/);
  assert.match(page, /app\.js/);

  for (const file of ['style.css', 'app.js']) {
    const res = await fetch(`${base}/${file}`);
    assert.equal(res.status, 200, file);
  }
});

test('vendored hls.js and fonts are served locally', async () => {
  const hls = await fetch(`${base}/vendor/hls/hls.min.js`);
  assert.equal(hls.status, 200);
  assert.match(hls.headers.get('content-type'), /javascript/);

  for (const family of ['montserrat', 'open-sans']) {
    const css = await fetch(`${base}/vendor/fonts/${family}/index.css`);
    assert.equal(css.status, 200, family);
  }
});
