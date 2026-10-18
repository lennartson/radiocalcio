const { Pool } = require('pg');

// DATABASE_URL, for example postgres://user:pass@host:5432/radiocalico
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const ready = pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

module.exports = { pool, ready };
