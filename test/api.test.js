const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Point the database at a throwaway file before the app loads it.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'radio-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

const app = require('../server');
const db = require('../db');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
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
